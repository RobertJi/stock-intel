"""信号规则(纯函数,实盘与回测共用)。

2026-07-01 至 09-26 全市场回测(7132 只美股,Adanos Reddit 日度提及)得出的结论:
- 热度放大 + 价格已经大涨(当日 > +5% 或 5 日 > +15%),之后 5–10 天平均跑输大盘 2–5% → 「过热,别追」
- 热度放大 + 当日大跌 ≥ 5% 的流动性好的股票,之后 5 个交易日平均跑赢大盘约 3.5%,胜率约 65%
  (7、8、9 三个月分别都为正;没有热度放大的大跌股同期只有 +1%) → 「恐慌反弹」
- 热度放大本身、或热度放大 + 放量突破,没有超额收益
阈值集中在 PARAMS。
"""
from __future__ import annotations

import statistics as st
from typing import Any

MODEL_VERSION = "v5.0"

PARAMS: dict[str, float] = {
    "min_mentions": 10,        # 信号日 Reddit 提及下限
    "accel_min": 2.0,          # 信号日提及 / 前 7 天中位数
    "base_floor": 3,           # 基线下限,防止冷门票 1→5 被当成 5 倍
    "trading_share_min": 0.5,  # 提及来自炒股类版块的占比下限(过滤代码撞名)
    "min_price": 5.0,
    "min_dollar_vol": 100e6,   # 20 日平均成交额;回测里 1 亿美元以下的反弹信号没有超额
    "rebound_ret1": -0.05,     # 恐慌反弹:信号日跌幅
    "hot_ret1": 0.05,          # 过热:信号日涨幅
    "hot_ret5": 0.15,          # 过热:5 日涨幅
    "hold_days": 5,            # 回测里 5 天最好(3 天 +1.1%,5 天 +3.6%,10 天 +3.0%)
    "stop_atr": 3.0,           # 只防极端情况的宽止损;回测里 1.5–3 倍 ATR 差别不大
}

TRADING_SUBS = {
    s.lower()
    for s in (
        "wallstreetbets", "stocks", "investing", "options", "stockmarket", "pennystocks", "smallstreetbets",
        "daytrading", "swingtrading", "shortsqueeze", "thetagang", "valueinvesting", "securityanalysis",
        "wallstreetbetsger", "wallstreetbetselite", "wallstreetbetsnew", "theraceto10million",
        "stocksandtrading", "investingforbeginners", "dividends", "robinhood", "trading", "algotrading",
        "stock_picks", "biotechplays", "weedstocks", "spacs", "vitards", "uraniumsqueeze", "semiconductors",
        "nvda_stock", "amd_stock", "teslainvestorsclub", "superstonk", "amcstock", "gme", "ultrafinancial",
        "stocksinsights", "wallstreetbets2", "wsbafterhours", "mauerstrassenwetten", "finanzen",
    )
}

# 常见加密货币符号:与美股代码撞名时,X / Reddit 上的讨论多半在说币
CRYPTO_SYMBOLS = {
    "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK", "QNT", "ATOM", "LTC", "BCH", "XLM",
    "NEAR", "APT", "ARB", "OP", "SUI", "SEI", "TIA", "INJ", "RNDR", "FET", "PEPE", "SHIB", "BONK", "WIF",
    "TON", "TRX", "HBAR", "ICP", "FIL", "ALGO", "EGLD", "SAND", "MANA", "AXS", "IMX", "GRT", "AAVE", "UNI",
    "MKR", "CRV", "LDO", "RUNE", "KAS", "TAO", "ONDO", "JUP", "PYTH", "ENA", "HYPE", "VET", "XMR",
}

NOT_STOCKS = {"SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "TQQQ", "SQQQ", "SOXL", "SOXS", "UVXY", "VIX", "TLT", "GLD", "SLV", "ARKK"}


def attention_metrics(daily: list[dict[str, Any]], top_subs: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
    """daily: 按日期升序、只含已走完的日子 [{date, mentions, sentiment_score, bullish_pct, bearish_pct}]。"""
    if len(daily) < 8:
        return None
    m = [float(x.get("mentions") or 0) for x in daily]
    today = m[-1]
    prior = m[-8:-1]
    base = max(st.median(prior), PARAMS["base_floor"])
    window = m[-30:]
    last = daily[-1]
    out: dict[str, Any] = {
        "date": last["date"],
        "mentions": today,
        "base7": st.median(prior),
        "accel": today / base,
        "prev_accel": (m[-2] / max(st.median(m[-9:-2]), PARAMS["base_floor"])) if len(m) >= 9 else None,
        "peak30": today >= max(window),
        "days_elevated": sum(1 for x in m[-5:] if x >= 2 * base),
        "sentiment": last.get("sentiment_score"),
        "bullish_pct": last.get("bullish_pct"),
        "bearish_pct": last.get("bearish_pct"),
    }
    if top_subs:
        total = sum(float(s.get("mentions") or 0) for s in top_subs) or 1
        trading = sum(float(s.get("mentions") or 0) for s in top_subs if s.get("subreddit", "").lower() in TRADING_SUBS)
        out["trading_share"] = trading / total
        out["top_sub"] = top_subs[0].get("subreddit")
    return out


def classify(ticker: str, att: dict[str, Any], mkt: dict[str, Any] | None, x_att: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """返回 {kind: rebound|hot, score, reasons, plan} 或 None(不构成信号)。"""
    p = PARAMS
    if ticker in NOT_STOCKS or ticker in CRYPTO_SYMBOLS:
        return None
    if att["mentions"] < p["min_mentions"] or att["accel"] < p["accel_min"]:
        return None
    if att.get("trading_share") is not None and att["trading_share"] < p["trading_share_min"]:
        return None
    if not mkt or mkt["close"] < p["min_price"]:
        return None

    reasons = [f"Reddit 提及 {att['mentions']:.0f} 次，是前 7 天中位数的 {att['accel']:.1f} 倍"]
    if x_att and x_att.get("accel", 0) >= 2:
        reasons.append(f"X 上同步放大 {x_att['accel']:.1f} 倍")

    if mkt["ret1"] <= p["rebound_ret1"] and mkt["dollar_vol20"] >= p["min_dollar_vol"]:
        reasons.append(f"当日下跌 {abs(mkt['ret1'])*100:.1f}%")
        if mkt["ret20"] <= -0.2:
            reasons.append(f"20 日累计 {mkt['ret20']*100:.0f}%")
        # 排序:跌得越多、讨论越多、之前跌得越深,回测里反弹越强
        score = -mkt["ret1"] * 300 + min(att["mentions"], 300) / 10 + max(-mkt["ret20"], 0) * 50 + min(att["accel"], 10)
        return {"kind": "rebound", "score": round(score, 1), "reasons": reasons, "plan": plan(mkt)}
    if mkt["ret1"] >= p["hot_ret1"] or mkt["ret5"] >= p["hot_ret5"]:
        reasons.append(f"当日 {mkt['ret1']*100:+.1f}%，5 日 {mkt['ret5']*100:+.1f}%")
        score = min(att["accel"], 10) * 4 + max(mkt["ret5"], mkt["ret1"]) * 100
        return {"kind": "hot", "score": round(score, 1), "reasons": reasons, "plan": {}}
    return None


def plan(mkt: dict[str, Any]) -> dict[str, Any]:
    c, atr = mkt["close"], mkt["atr"]
    stop = c - PARAMS["stop_atr"] * atr
    return {
        "ref_close": round(c, 2),
        "entry": "次日开盘",
        "stop": round(stop, 2),
        "hold_days": int(PARAMS["hold_days"]),
        "exit": f"第 {int(PARAMS['hold_days'])} 个交易日收盘",
        "risk_pct": round((c - stop) / c, 4),
    }


def simulate(plan_: dict[str, Any], bars: list[tuple], spy: dict[str, float]) -> dict[str, Any] | None:
    """bars: 信号日之后的日线 [(date, o, h, l, c, v)]。次日开盘买入;跌破止损出场;否则持有到第 N 天收盘。"""
    if not bars:
        return None
    d0, entry = bars[0][0], bars[0][1]
    stop, n = plan_["stop"], plan_["hold_days"]
    for i, (d, o, h, lo, c, _v) in enumerate(bars[:n]):
        if i > 0 and o <= stop:
            return _res("stop", entry, o, d0, d, spy, i)
        if lo <= stop:
            return _res("stop", entry, min(stop, o), d0, d, spy, i)
    if len(bars) < n:
        last = bars[-1]
        return {"status": "entered", "entry": round(entry, 4), "entry_date": d0, "last": last[4], "days": len(bars),
                "ret": last[4] / entry - 1}
    return _res("time", entry, bars[n - 1][4], d0, bars[n - 1][0], spy, n - 1)


def _res(status: str, entry: float, exit_: float, d0: str, d1: str, spy: dict[str, float], i: int) -> dict[str, Any]:
    ret = exit_ / entry - 1
    s0, s1 = _spy_open(spy, d0), spy.get(d1)
    spy_ret = (s1 / s0 - 1) if s0 and s1 else None
    return {
        "status": status,
        "entry": round(entry, 4),
        "entry_date": d0,
        "exit": round(exit_, 4),
        "exit_date": d1,
        "days": i + 1,
        "ret": ret,
        "spy_ret": spy_ret,
        "excess": ret - spy_ret if spy_ret is not None else None,
    }


def _spy_open(spy: dict[str, float], d: str) -> float | None:
    return spy.get(f"open:{d}") or spy.get(d)
