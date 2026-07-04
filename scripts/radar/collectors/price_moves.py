"""Detect abnormal daily moves in leading-indicator tickers via Yahoo chart API."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from .. import config
from . import make_signal


def collect() -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for symbol, (name, sector_hint) in config.LEADING_TICKERS.items():
        try:
            sig = _check_symbol(symbol, name, sector_hint)
            if sig:
                signals.append(sig)
        except Exception as e:  # noqa: BLE001
            print(f"  price_moves[{symbol}] failed: {e}")
    return signals


def _check_symbol(symbol: str, name: str, sector_hint: str) -> dict[str, Any] | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    closes = [c for c in result["indicators"]["quote"][0]["close"] if c is not None]
    if len(closes) < 2:
        return None
    prev, last = closes[-2], closes[-1]
    pct = (last - prev) / prev * 100
    if abs(pct) < config.PRICE_MOVE_THRESHOLD_PCT:
        return None
    direction = "surged" if pct > 0 else "dropped"
    today = datetime.now(timezone.utc).date().isoformat()
    return make_signal(
        "price_move",
        "price_moves",
        f"{name} ({symbol}) {direction} {pct:+.1f}% today",
        content=f"Leading indicator for sector '{sector_hint}'. Close {prev:.2f} -> {last:.2f}.",
        published_at=datetime.now(timezone.utc).isoformat(),
        entities=[symbol],
        raw={"symbol": symbol, "pct": round(pct, 2), "sector_hint": sector_hint, "date": today},
    )
