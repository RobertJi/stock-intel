"""Sector Radar pipeline runner.

Usage:
    python -m scripts.radar.run [collect|triage|reason|score|synthesize|alert|outcome|all|watchdog|ping] [--dry-run]

Every stage is isolated: one failing stage (e.g. an LLM account out of credit) no longer
aborts the others. Each `all` run writes a heartbeat row to `pipeline_runs`, notifies on
failure, and pings HEALTHCHECK_PING_URL on success so an external dead-man switch can
alert when runs stop happening at all.
"""
from __future__ import annotations

import sys
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import requests

from . import alert as alert_mod
from . import config, db, llm, notify, outcome, reason, score, synthesize, triage
from .collectors import benchmarks, events_bridge, hackernews, news_rss, price_moves, reddit

COLLECTORS = [news_rss, price_moves, benchmarks, events_bridge, reddit, hackernews]


def collect(dry_run: bool = False) -> dict[str, Any]:
    total_new = 0
    failed: list[str] = []
    for mod in COLLECTORS:
        name = mod.__name__.rsplit(".", 1)[-1]
        try:
            signals = mod.collect()
            if dry_run:
                print(f"collect[{name}]: {len(signals)} signals (dry-run, not stored)")
                for s in signals[:5]:
                    print(f"  - {s['title']}")
                continue
            inserted = db.insert("radar_signals", signals, upsert_on="content_hash")
            total_new += len(inserted)
            print(f"collect[{name}]: {len(signals)} fetched, {len(inserted)} new")
        except Exception as e:  # noqa: BLE001
            failed.append(name)
            print(f"collect[{name}] failed: {e}")
    if not dry_run:
        print(f"collect: {total_new} new signals total")
    return {"new": total_new, "failed_collectors": failed}


def expire_backlog(dry_run: bool = False) -> dict[str, Any]:
    """Signals older than MAX_SIGNAL_AGE_HOURS that were never processed are stale news:
    mark them instead of spending model budget on them (fixes the 3,970-signal backlog)."""
    cutoff = _ts(datetime.now(timezone.utc) - timedelta(hours=config.MAX_SIGNAL_AGE_HOURS))
    if dry_run:
        return {"cutoff": cutoff}
    a = db.update("radar_signals", f"triage_status=eq.pending&created_at=lt.{cutoff}&select=id", {"triage_status": "stale"})
    b = db.update(
        "radar_signals",
        f"triage_status=eq.interesting&reason_status=eq.pending&created_at=lt.{cutoff}&select=id",
        {"reason_status": "skipped"},
    )
    # 超过 THESIS_EXPIRE_DAYS 没有新证据的论点一次性过期,避免 score 阶段逐个去拉行情
    thesis_cutoff = _ts(datetime.now(timezone.utc) - timedelta(days=config.THESIS_EXPIRE_DAYS))
    c = db.update(
        "sector_theses",
        f"status=in.(forming,active,confirmed)&last_signal_at=lt.{thesis_cutoff}&select=id",
        {"status": "expired", "updated_at": datetime.now(timezone.utc).isoformat()},
    )
    print(f"backlog: {len(a)} pending → stale, {len(b)} unreasoned → skipped, {len(c)} theses → expired")
    return {"triage_stale": len(a), "reason_skipped": len(b), "theses_expired": len(c)}


def _ts(dt: datetime) -> str:
    """URL 查询里用的时间:必须是 Z 结尾,"+00:00" 里的 + 会被当成空格导致 400。"""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def watchdog() -> None:
    """Alert if no successful pipeline run within STALE_ALERT_HOURS."""
    rows = db.get("pipeline_runs", "select=finished_at&status=eq.ok&order=finished_at.desc&limit=1")
    last = rows[0]["finished_at"] if rows else None
    if last:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(last.replace("Z", "+00:00"))
        if age < timedelta(hours=config.STALE_ALERT_HOURS):
            print(f"watchdog: ok (last success {age} ago)")
            return
    msg = f"⚠️ stock-intel 情报管道已超过 {config.STALE_ALERT_HOURS} 小时没有成功运行(上次成功:{last or '无记录'})"
    notify.send(msg)
    print(msg)


STEPS: dict[str, Callable[[bool], Any]] = {
    "collect": collect,
    "backlog": expire_backlog,
    "triage": triage.run,
    "reason": reason.run,
    "score": score.run,
    "synthesize": synthesize.run,
    "alert": alert_mod.run,
    "outcome": outcome.run,
}


def run_all(dry_run: bool) -> int:
    started = datetime.now(timezone.utc)
    stages: dict[str, Any] = {}
    for name, fn in STEPS.items():
        print(f"== {name} ==")
        t0 = datetime.now(timezone.utc)
        try:
            result = fn(dry_run)
            stages[name] = {"ok": True, "secs": _secs(t0)}
            if isinstance(result, dict):
                stages[name]["result"] = result
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            stages[name] = {"ok": False, "secs": _secs(t0), "error": str(e)[:500]}

    failed = [n for n, s in stages.items() if not s["ok"]]
    usage = llm.usage_summary()
    status = "ok" if not failed else ("failed" if len(failed) == len(stages) else "partial")
    print(f"== done: {status} · failed={failed} · llm≈${usage['est_usd']} ==")

    if dry_run:
        return 0
    try:
        db.insert(
            "pipeline_runs",
            [{
                "started_at": started.isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": status,
                "stages": stages,
                "llm": usage,
                "error": "; ".join(f"{n}: {stages[n].get('error')}" for n in failed)[:2000] or None,
            }],
        )
    except Exception as e:  # noqa: BLE001
        print(f"  heartbeat write failed (apply migration 007?): {e}")

    if failed:
        notify.send(
            f"⚠️ stock-intel 情报管道运行{'失败' if status == 'failed' else '部分失败'}\n"
            + "\n".join(f"· {n}: {stages[n].get('error', '')[:160]}" for n in failed)
        )
    elif config.HEALTHCHECK_PING_URL:
        try:
            requests.get(config.HEALTHCHECK_PING_URL, timeout=10)
        except Exception:  # noqa: BLE001
            pass
    return 1 if failed else 0


def _secs(t0: datetime) -> float:
    return round((datetime.now(timezone.utc) - t0).total_seconds(), 1)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    mode = args[0] if args else "all"
    if not dry_run:
        db.require_env()

    if mode == "all":
        raise SystemExit(run_all(dry_run))
    if mode == "watchdog":
        watchdog()
    elif mode == "ping":
        ok = notify.send("✅ stock-intel 推送测试:通道已连通。之后的论点告警、管道故障和看门狗提醒都会发到这里。")
        print("ping:", "delivered" if ok else "FAILED (check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)")
        raise SystemExit(0 if ok else 1)
    elif mode in STEPS:
        STEPS[mode](dry_run)
    else:
        raise SystemExit(f"unknown mode: {mode} (expected {'/'.join(STEPS)}/all/watchdog/ping)")


if __name__ == "__main__":
    main()
