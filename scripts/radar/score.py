"""Aggregate evidence into auditable conviction; run priced-in check; manage lifecycle."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from . import config, db


def run(dry_run: bool = False) -> None:
    theses = db.get(
        "sector_theses",
        "select=*&status=in.(forming,active,confirmed)",
    )
    for thesis in theses:
        try:
            _score_thesis(thesis, dry_run)
        except Exception as e:  # noqa: BLE001
            print(f"  score failed for {thesis['sector']}: {e}")
    print(f"score: {len(theses)} theses evaluated")


def _score_thesis(thesis: dict[str, Any], dry_run: bool) -> None:
    now = datetime.now(timezone.utc)
    evidence = db.get(
        "thesis_signals",
        f"select=weight,stance,created_at,radar_signals(source_kind,source_name,title)&thesis_id=eq.{thesis['id']}",
    )
    if not evidence:
        return

    supports = [e for e in evidence if e["stance"] == "supports"]
    weakens = [e for e in evidence if e["stance"] == "weakens"]

    # 独立来源互证:按 source_kind 去重后的数量
    kinds = {(e.get("radar_signals") or {}).get("source_kind") for e in supports}
    kinds.discard(None)
    diversity = len(kinds)
    max_weight = max((e["weight"] for e in supports), default=0)

    # 时间衰减:最近证据的新鲜度
    latest = max(e["created_at"] for e in evidence)
    age_hours = max(0.0, (now - _parse_ts(latest)).total_seconds() / 3600)
    recency = math.exp(-age_hours / 72)  # 3 天半衰期量级

    market_reaction, priced_in_penalty = _priced_in_check(thesis)

    base = (
        0.45 * max_weight
        + 12 * min(len(supports), 4)
        + 10 * min(diversity, 3)
    )
    conviction = base * recency * (1 - priced_in_penalty)
    conviction -= 8 * len(weakens)
    conviction = int(max(0, min(100, round(conviction))))

    components = {
        "max_weight": max_weight,
        "supports": len(supports),
        "weakens": len(weakens),
        "source_diversity": diversity,
        "recency": round(recency, 2),
        "priced_in_penalty": round(priced_in_penalty, 2),
    }

    old_status = thesis["status"]
    old_conviction = thesis.get("conviction") or 0
    new_status = old_status
    if old_status == "forming" and (
        conviction >= config.ACTIVATE_CONVICTION or len(supports) >= config.ACTIVATE_MIN_EVIDENCE
    ):
        new_status = "active"
    last_signal = _parse_ts(thesis.get("last_signal_at") or latest)
    if now - last_signal > timedelta(days=config.THESIS_EXPIRE_DAYS):
        new_status = "expired"

    if dry_run:
        print(f"  [{thesis['sector']}/{thesis['direction']}] {old_conviction}->{conviction} {old_status}->{new_status} {components}")
        return

    db.update(
        "sector_theses",
        f"id=eq.{thesis['id']}",
        {
            "conviction": conviction,
            "conviction_components": components,
            "market_reaction": market_reaction,
            "status": new_status,
            "expires_at": (last_signal + timedelta(days=config.THESIS_EXPIRE_DAYS)).isoformat(),
            "updated_at": now.isoformat(),
        },
    )
    _maybe_alert(thesis, old_status, new_status, old_conviction, conviction, market_reaction)


def _priced_in_check(thesis: dict[str, Any]) -> tuple[dict[str, Any], float]:
    """Fetch 5d change per mapped instrument; big move in thesis direction => penalty."""
    instruments = db.get(
        "sector_instruments",
        f"select=market,symbol,name&sector=eq.{thesis['sector']}&limit=15",
    )
    reaction: dict[str, list[dict[str, Any]]] = {}
    moves: list[float] = []
    for inst in instruments:
        pct = _five_day_change(inst["symbol"])
        if pct is None:
            continue
        reaction.setdefault(inst["market"], []).append(
            {"symbol": inst["symbol"], "name": inst.get("name"), "pct_5d": round(pct, 1)}
        )
        moves.append(pct)
    if not moves:
        return {}, 0.0
    avg = sum(moves) / len(moves)
    signed = avg if thesis["direction"] == "bullish" else -avg
    # 平均已同向移动 10% 以上 -> 最高 0.5 折扣
    penalty = max(0.0, min(0.5, (signed - 3) / 14))
    summary = {m: rows for m, rows in reaction.items()}
    summary["avg_pct_5d"] = round(avg, 1)
    return summary, penalty


def _five_day_change(symbol: str) -> float | None:
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        closes = [c for c in r.json()["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c is not None]
        if len(closes) < 2:
            return None
        return (closes[-1] - closes[0]) / closes[0] * 100
    except Exception:  # noqa: BLE001
        return None


def _maybe_alert(
    thesis: dict[str, Any],
    old_status: str,
    new_status: str,
    old_conviction: int,
    conviction: int,
    market_reaction: dict[str, Any],
) -> None:
    kind = None
    if old_status == "forming" and new_status == "active":
        kind = "activated"
    elif conviction - old_conviction >= config.CONVICTION_JUMP_ALERT and new_status in ("active", "confirmed"):
        kind = "conviction_jump"
    if not kind:
        return
    label = thesis.get("sector_zh") or thesis["sector"]
    arrow = "看多" if thesis["direction"] == "bullish" else "看空"
    reaction_txt = ""
    for market, rows in market_reaction.items():
        if market == "avg_pct_5d" or not isinstance(rows, list):
            continue
        parts = [f"{r['symbol']} {r['pct_5d']:+.1f}%" for r in rows[:3]]
        reaction_txt += f"\n{market}: " + ", ".join(parts)
    msg = (
        f"📡 [{label}] {arrow} conviction {conviction}\n"
        f"{thesis.get('transmission') or thesis.get('summary') or ''}\n"
        f"近5日各市场反应:{reaction_txt or ' 无数据'}"
    )
    db.insert("radar_alerts", [{"thesis_id": thesis["id"], "kind": kind, "message": msg}])


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
