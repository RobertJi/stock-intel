"""Outcome tracking: record T+1/T+5/T+20 returns of mapped instruments per thesis.

Baseline = thesis activation time (first transition to active ~ created_at fallback).
Verdict: avg mapped-instrument return in thesis direction >= +2% -> hit, <= -2% -> miss, else mixed.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from . import db

HORIZONS = {"t1": 1, "t5": 5, "t20": 20}
VERDICT_THRESHOLD_PCT = 2.0


def run(dry_run: bool = False) -> None:
    theses = db.get(
        "sector_theses",
        "select=id,sector,direction,status,created_at&status=in.(active,confirmed,invalidated,expired)",
    )
    recorded = 0
    for thesis in theses:
        try:
            recorded += _track(thesis, dry_run)
        except Exception as e:  # noqa: BLE001
            print(f"  outcome failed for {thesis['sector']}: {e}")
    print(f"outcome: {recorded} horizon records written")


def _track(thesis: dict[str, Any], dry_run: bool) -> int:
    now = datetime.now(timezone.utc)
    baseline = datetime.fromisoformat(thesis["created_at"].replace("Z", "+00:00"))
    existing = {
        row["horizon"]
        for row in db.get("thesis_outcomes", f"select=horizon&thesis_id=eq.{thesis['id']}")
    }
    due = [h for h, days in HORIZONS.items() if h not in existing and now - baseline >= timedelta(days=days)]
    if not due:
        return 0

    instruments = db.get(
        "sector_instruments",
        f"select=market,symbol&sector=eq.{thesis['sector']}&limit=15",
    )
    if not instruments:
        return 0

    written = 0
    for horizon in due:
        returns: dict[str, dict[str, float]] = {}
        moves: list[float] = []
        window_end = baseline + timedelta(days=HORIZONS[horizon])
        for inst in instruments:
            pct = _return_between(inst["symbol"], baseline, window_end)
            if pct is None:
                continue
            returns.setdefault(inst["market"], {})[inst["symbol"]] = round(pct, 2)
            moves.append(pct)
        if not moves:
            continue
        avg = sum(moves) / len(moves)
        signed = avg if thesis["direction"] == "bullish" else -avg
        verdict = "hit" if signed >= VERDICT_THRESHOLD_PCT else "miss" if signed <= -VERDICT_THRESHOLD_PCT else "mixed"
        if dry_run:
            print(f"  [{thesis['sector']}] {horizon}: avg {avg:+.1f}% -> {verdict}")
            continue
        db.insert(
            "thesis_outcomes",
            [{
                "thesis_id": thesis["id"],
                "horizon": horizon,
                "returns": returns,
                "verdict": verdict,
            }],
            upsert_on="thesis_id,horizon",
        )
        written += 1
    return written


def _return_between(symbol: str, start: datetime, end: datetime) -> float | None:
    """Close-to-close return from nearest trading day <= start to nearest <= end."""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=3mo&interval=1d"
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        result = r.json()["chart"]["result"][0]
        timestamps = result.get("timestamp") or []
        closes = result["indicators"]["quote"][0]["close"]
        series = [
            (datetime.fromtimestamp(ts, tz=timezone.utc), c)
            for ts, c in zip(timestamps, closes)
            if c is not None
        ]
        if len(series) < 2:
            return None
        start_close = _close_at_or_before(series, start) or series[0][1]
        end_close = _close_at_or_before(series, end) or series[-1][1]
        if not start_close:
            return None
        return (end_close - start_close) / start_close * 100
    except Exception:  # noqa: BLE001
        return None


def _close_at_or_before(series: list[tuple[datetime, float]], when: datetime) -> float | None:
    best = None
    for ts, close in series:
        if ts <= when:
            best = close
        else:
            break
    return best
