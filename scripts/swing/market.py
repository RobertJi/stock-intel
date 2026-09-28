"""行情:Yahoo 日线 OHLCV 与波段需要的量价特征。"""
from __future__ import annotations

import statistics as st
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import requests

UA = {"User-Agent": "Mozilla/5.0 (stock-intel personal research)"}


@lru_cache(maxsize=2048)
def daily(ticker: str, rng: str = "6mo") -> tuple[tuple[str, float, float, float, float, float], ...]:
    """[(date, open, high, low, close, volume)],按日期升序;缺值的交易日跳过。"""
    r = requests.get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
        params={"range": rng, "interval": "1d", "includePrePost": "false"},
        headers=UA,
        timeout=30,
    )
    r.raise_for_status()
    res = (r.json().get("chart") or {}).get("result") or []
    if not res or not res[0].get("timestamp"):
        return ()
    res = res[0]
    q = res["indicators"]["quote"][0]
    tz_off = (res.get("meta") or {}).get("gmtoffset", -4 * 3600)
    rows = []
    for i, ts in enumerate(res["timestamp"]):
        o, h, lo, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, lo, c):
            continue
        d = datetime.fromtimestamp(ts + tz_off, tz=timezone.utc).date().isoformat()
        rows.append((d, float(o), float(h), float(lo), float(c), float(v or 0)))
    return tuple(rows)


def features(ticker: str, spy: tuple | None = None) -> dict[str, Any] | None:
    """最近一个完整交易日的量价特征。数据不足 60 天返回 None。"""
    return features_from_rows(daily(ticker), spy if spy is not None else daily("SPY"))


def features_from_rows(rows: tuple | list, spy: tuple | list) -> dict[str, Any] | None:
    """rows 的最后一根就是「当天」;回测时传截断到信号日的 rows / spy。"""
    if len(rows) < 60:
        return None
    closes = [r[4] for r in rows]
    vols = [r[5] for r in rows]
    c = closes[-1]
    trs = [
        max(rows[i][2] - rows[i][3], abs(rows[i][2] - closes[i - 1]), abs(rows[i][3] - closes[i - 1]))
        for i in range(len(rows) - 14, len(rows))
    ]
    atr = sum(trs) / len(trs)
    avg_vol20 = st.mean(vols[-21:-1]) or 1
    sma20 = st.mean(closes[-20:])
    sma50 = st.mean(closes[-50:])
    high20_prev = max(r[2] for r in rows[-21:-1])
    f: dict[str, Any] = {
        "date": rows[-1][0],
        "close": round(c, 4),
        "ret1": c / closes[-2] - 1,
        "ret5": c / closes[-6] - 1,
        "ret20": c / closes[-21] - 1,
        "atr": round(atr, 4),
        "atr_pct": atr / c,
        "vol_ratio": vols[-1] / avg_vol20,
        "dollar_vol20": st.mean(v * p for v, p in zip(vols[-20:], closes[-20:])),
        "above_sma20": c > sma20,
        "above_sma50": c > sma50,
        "breakout20": c > high20_prev,
        "high20_prev": round(high20_prev, 4),
    }
    if len(spy) >= 21:
        sc = [r[4] for r in spy]
        f["rs20"] = f["ret20"] - (sc[-1] / sc[-21] - 1)
        f["rs5"] = f["ret5"] - (sc[-1] / sc[-6] - 1)
    return f
