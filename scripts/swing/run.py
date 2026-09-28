"""v5 波段管道。

    python -m scripts.swing.run signals [--dry-run]   # 美股开盘前:采集热度 → 选股 → 交易计划 → 推送
    python -m scripts.swing.run track   [--dry-run]   # 收盘后:按日线给所有信号记账
    python -m scripts.swing.run snapshot              # 只存热度快照(自建历史)

热度的「一天」按 UTC 日期算,只用已经走完的日子;价格用最近一个收盘。
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

from ..radar import db, llm, notify
from . import market, risk, signal, sources

MAX_CANDIDATES = int(__import__("os").environ.get("SWING_MAX_CANDIDATES", "250"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# 1. 热度快照
# ---------------------------------------------------------------------------

def snapshot(dry_run: bool) -> dict[str, Any]:
    captured = _ts(_now().replace(minute=0, second=0, microsecond=0))
    rows: list[dict[str, Any]] = []
    ape = []
    try:
        ape = sources.apewisdom()
        for x in ape:
            rows.append({"source": "apewisdom", "ticker": x["ticker"], "captured_at": captured, "mentions": x["mentions"],
                         "mentions_prev": x["mentions_prev"], "rank": x["rank"], "rank_prev": x["rank_prev"],
                         "extra": {"name": x["name"], "upvotes": x["upvotes"]}})
    except Exception as e:  # noqa: BLE001
        print(f"  apewisdom failed: {e}")
    trending: dict[str, list[dict[str, Any]]] = {}
    if sources.adanos_enabled():
        for src in ("reddit", "x", "news"):
            try:
                trending[src] = sources.adanos_trending(src, 100)
                for x in trending[src]:
                    rows.append({"source": f"adanos_{src}", "ticker": x["ticker"].upper(), "captured_at": captured,
                                 "mentions": x.get("mentions"), "buzz": x.get("buzz_score"), "sentiment": x.get("sentiment_score"),
                                 "extra": {"name": x.get("company_name"), "trend": x.get("trend"), "trend_history": x.get("trend_history")}})
            except Exception as e:  # noqa: BLE001
                print(f"  adanos {src} trending failed: {e}")
    if not dry_run and rows:
        for i in range(0, len(rows), 500):
            db.insert("attention_snapshots", rows[i:i + 500], upsert_on="source,ticker,captured_at")
    print(f"snapshot: {len(rows)} rows (apewisdom {len(ape)}, adanos {sum(len(v) for v in trending.values())})")
    return {"ape": ape, "trending": trending}


# ---------------------------------------------------------------------------
# 2. 选候选 → 算信号
# ---------------------------------------------------------------------------

def candidates(ape: list[dict[str, Any]], trending: dict[str, list[dict[str, Any]]]) -> list[tuple[str, str]]:
    """候选 = ApeWisdom 过去 24h 提及 ≥ 10 次的 ∪ Adanos Reddit/X 热门榜。精确的「放大倍数」用 Adanos 日度数据再算。"""
    score: dict[str, float] = {}
    names: dict[str, str] = {}
    for x in ape:
        m, p = x["mentions"] or 0, x["mentions_prev"] or 0
        if m >= 10:
            score[x["ticker"]] = max(score.get(x["ticker"], 0), m / max(p, 3))
            names[x["ticker"]] = x["name"]
    for src in ("reddit", "x"):
        for x in trending.get(src, []):
            t = x["ticker"].upper()
            score.setdefault(t, 0.5)
            names.setdefault(t, x.get("company_name") or "")
    ranked = sorted(score, key=lambda t: -score[t])
    ranked = [t for t in ranked if t.isalpha() and t not in signal.NOT_STOCKS and t not in signal.CRYPTO_SYMBOLS]
    return [(t, names.get(t, "")) for t in ranked[:MAX_CANDIDATES]]


def st_mean(v: list[float]) -> float:
    return sum(v) / len(v) if v else 0.0


def complete_days(daily: list[dict[str, Any]]) -> list[dict[str, Any]]:
    today = _now().date().isoformat()
    return sorted([d for d in daily if d.get("date") and d["date"] < today], key=lambda d: d["date"])


def build_signal(ticker: str, name: str, spy: tuple) -> dict[str, Any] | None:
    red = sources.adanos_stock("reddit", ticker, 30)
    if not red.get("found", True):
        return None
    att = signal.attention_metrics(complete_days(red.get("daily_trend") or []), red.get("top_subreddits"))
    if not att:
        return None
    if att["mentions"] < signal.PARAMS["min_mentions"] or att["accel"] < signal.PARAMS["accel_min"]:
        return None
    if att.get("trading_share") is not None and att["trading_share"] < signal.PARAMS["trading_share_min"]:
        return None
    mkt = market.features(ticker.replace(".", "-"), spy)
    res = signal.classify(ticker, att, mkt, None)
    if not res:
        return None
    x_att = None
    try:  # X 只做参考,不参与判定(回测里 X 历史数据量太小)
        xd = sources.adanos_stock("x", ticker, 30)
        x_att = signal.attention_metrics(complete_days(xd.get("daily_trend") or []))
        if x_att and x_att["accel"] >= 2 and x_att["mentions"] >= 5:
            res["reasons"].append(f"X 上同步放大 {x_att['accel']:.1f} 倍")
    except Exception as e:  # noqa: BLE001
        print(f"  {ticker}: x detail failed ({e})")
    snippets = [m.get("text_snippet", "")[:400] for m in (red.get("top_mentions") or [])[:6]]
    return {
        "ticker": ticker,
        "name": red.get("company_name") or name,
        "as_of": mkt["date"],
        "kind": res["kind"],
        "score": res["score"],
        "attention": {**att, "x": x_att, "reasons": res["reasons"], "snippets": snippets},
        "market": mkt,
        "plan": res["plan"],
        "model_version": signal.MODEL_VERSION,
    }


def explain(sig: dict[str, Any]) -> str | None:
    snippets = [s for s in sig["attention"].get("snippets") or [] if s]
    if not snippets:
        return None
    try:
        out = llm.chat_json(
            "triage",
            "你是美股短线研究助理。根据 Reddit 讨论摘录，用中文两句话说明这只股票最近为什么被热议（催化剂是什么），"
            "不要给买卖建议，不要编造摘录里没有的信息。输出 JSON：{\"why\": \"...\"}",
            f"股票：{sig['ticker']} {sig['name']}\n摘录：\n" + "\n---\n".join(snippets),
            max_tokens=400,
        )
        return (out or {}).get("why")
    except Exception as e:  # noqa: BLE001
        print(f"  {sig['ticker']}: explain failed ({e})")
        return None


def signals(dry_run: bool) -> None:
    snap = snapshot(dry_run)
    if not sources.adanos_enabled():
        print("signals: ADANOS_API_KEY 未配置，只存了 ApeWisdom 快照")
        return
    spy = market.daily("SPY")
    cands = candidates(snap["ape"], snap["trending"])
    print(f"candidates: {len(cands)} → {', '.join(t for t, _ in cands)}")
    found: list[dict[str, Any]] = []
    for t, name in cands:
        try:
            s = build_signal(t, name, spy)
        except Exception as e:  # noqa: BLE001
            print(f"  {t}: failed ({e})")
            continue
        if s:
            found.append(s)
        time.sleep(0.2)
    found.sort(key=lambda s: -s["score"])
    hot_explained = 0
    for s in found:
        s["risk_flags"] = risk.check(s["ticker"], s["market"]["close"]) if s["kind"] == "rebound" else []
        if s["kind"] == "rebound" or hot_explained < 10:
            s["why"] = explain(s)
            hot_explained += s["kind"] == "hot"
        print(json.dumps({k: s[k] for k in ("ticker", "kind", "score", "plan")} | {"risk": [f["key"] for f in s["risk_flags"]]}, ensure_ascii=False))
    n_reb = sum(s["kind"] == "rebound" for s in found)
    print(f"signals: {len(found)} ({n_reb} rebound, {len(found) - n_reb} hot), adanos quota remaining {sources.quota['remaining']}")
    if dry_run:
        return
    if found:
        db.insert("swing_signals", found, upsert_on="ticker,as_of")
    deliver()


# ---------------------------------------------------------------------------
# 3. 记账
# ---------------------------------------------------------------------------

def track(dry_run: bool) -> None:
    since = (_now() - timedelta(days=45)).date().isoformat()
    rows = db.get("swing_signals", f"select=id,ticker,as_of,kind,plan,status,outcome&as_of=gte.{since}&status=in.(open,entered)")
    spy_rows = market.daily("SPY")
    spy = {r[0]: r[4] for r in spy_rows} | {f"open:{r[0]}": r[1] for r in spy_rows}
    spy_dates = [r[0] for r in spy_rows]
    updated = 0
    for r in rows:
        try:
            bars = [b for b in market.daily(r["ticker"].replace(".", "-")) if b[0] > r["as_of"]]
            base = next((b[4] for b in reversed(market.daily(r["ticker"].replace(".", "-"))) if b[0] <= r["as_of"]), None)
            out = dict(r.get("outcome") or {})
            # 固定持有期收益(所有类型都记,用来比较 rebound / hot 的后续表现)
            s0 = spy.get(r["as_of"])
            for h in (1, 3, 5, 10):
                if len(bars) >= h and base:
                    d = bars[h - 1][0]
                    ret = bars[h - 1][4] / base - 1
                    sret = spy[d] / s0 - 1 if s0 and d in spy else None
                    out[f"t{h}"] = {"ret": ret, "excess": ret - sret if sret is not None else None}
            status = r["status"]
            if r["kind"] == "rebound" and r.get("plan"):
                sim = signal.simulate(r["plan"], bars, spy)
                if sim:
                    status = sim["status"]
                    out["trade"] = sim
            if r["kind"] != "rebound" and len(bars) >= 10:
                status = "done"
            if not dry_run:
                db.update("swing_signals", f"id=eq.{r['id']}", {"status": status, "outcome": out})
            updated += 1
        except Exception as e:  # noqa: BLE001
            print(f"  track {r['ticker']} failed: {e}")
    print(f"track: {updated}/{len(rows)} signals updated (spy through {spy_dates[-1] if spy_dates else '?'})")


# ---------------------------------------------------------------------------
# 4. 推送
# ---------------------------------------------------------------------------

def _fmt_rebound(s: dict[str, Any]) -> str:
    p = s["plan"]
    risk_hi = [f["label"] for f in s.get("risk_flags") or [] if f["severity"] == "high"]
    reasons = (s.get("attention") or {}).get("reasons") or []
    lines = [f"🔄 恐慌反弹 {s['ticker']} {s.get('name') or ''}", "；".join(reasons)]
    if s.get("why"):
        lines.append(f"为什么热：{s['why']}")
    lines.append(f"计划：{p['entry']}买入，持有到{p['exit']}；跌破 {p['stop']} 止损（−{p['risk_pct']*100:.0f}%，防极端情况）")
    if risk_hi:
        lines.append("⚠️ " + "、".join(risk_hi) + "（这种情况建议跳过）")
    lines.append("回测：同类信号 5 天后平均跑赢大盘约 3%，胜率约 65%，但收益集中在少数大跌日。纸面跟踪中。")
    return "\n".join(lines)


def _fmt_hot(s: dict[str, Any]) -> str:
    reasons = (s.get("attention") or {}).get("reasons") or []
    lines = [f"🔥 过热提醒 {s['ticker']} {s.get('name') or ''}（你持有或关注）", "；".join(reasons)]
    if s.get("why"):
        lines.append(f"为什么热：{s['why']}")
    lines.append("回测：热度放大 + 已大涨的票，之后 5–10 天平均跑输大盘 1–2%。别追，持有的可以考虑先减一些。")
    return "\n".join(lines)


def deliver() -> int:
    if not notify.configured():
        return 0
    fresh_cutoff = (_now() - timedelta(days=4)).date().isoformat()
    mine: set[str] = set()
    for table in ("positions", "watchlist"):
        try:
            mine |= {r["ticker"].upper() for r in db.get(table, "select=ticker")}
        except Exception:  # noqa: BLE001
            pass
    pending = db.get("swing_signals", "select=*&delivered=eq.false&order=score.desc&limit=30")
    sent = 0
    for s in pending:
        msg = None
        if s["as_of"] >= fresh_cutoff:
            if s["kind"] == "rebound":
                msg = _fmt_rebound(s)
            elif s["kind"] == "hot" and s["ticker"] in mine:
                msg = _fmt_hot(s)
        if msg and notify.send(msg):
            sent += 1
        db.update("swing_signals", f"id=eq.{s['id']}", {"delivered": True})
    print(f"deliver: {sent} pushed")
    return sent


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    mode = args[0] if args else "signals"
    if not dry:
        db.require_env()
    try:
        {"signals": signals, "track": track, "snapshot": snapshot}[mode](dry)
    except Exception:
        traceback.print_exc()
        if not dry:
            notify.send(f"⚠️ stock-intel 波段管道（{mode}）失败，看 Actions 日志")
        raise


if __name__ == "__main__":
    main()
