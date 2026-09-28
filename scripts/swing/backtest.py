"""回测:用 Adanos 90 天 Reddit 日度提及 + Yahoo 日线,检验信号规则。

    python -m scripts.swing.backtest ATT_JSONL PRICE_CACHE_DIR

ATT_JSONL 每行 {t, subs, daily:[{date, mentions, ...}]},由全市场(SEC 上市股票列表,不按当前热度挑)拉取。
时间对齐:D 日(UTC)的提及在美东 D 日 20:00 后才完整 → 用 D 日及以前的最后一个收盘算量价特征,
下一个交易日开盘入场。固定持有期收益也从次日开盘算起。
"""
from __future__ import annotations

import json
import os
import statistics as st
import sys
import time
from collections import defaultdict
from typing import Any

from . import market, signal

TODAY = time.strftime("%Y-%m-%d", time.gmtime())


def load_att(path: str) -> dict[str, dict[str, Any]]:
    out = {}
    for line in open(path):
        d = json.loads(line)
        daily = sorted([x for x in d.get("daily") or [] if x.get("date") and x["date"] < TODAY], key=lambda x: x["date"])
        if daily:
            out[d["t"]] = {"subs": d.get("subs"), "daily": daily, "total": d.get("total") or 0}
    return out


def prices(ticker: str, cache: str) -> list[tuple]:
    p = os.path.join(cache, f"{ticker}.json")
    if os.path.exists(p):
        return [tuple(r) for r in json.load(open(p))]
    try:
        market.daily.cache_clear()
        rows = list(market.daily(ticker.replace(".", "-"), "1y"))
    except Exception:  # noqa: BLE001
        rows = []
    json.dump(rows, open(p, "w"))
    time.sleep(0.15)
    return rows


def forward(bars: list[tuple], spy_by: dict[str, tuple], h: int) -> dict[str, float] | None:
    """次日开盘买入,持有到第 h 根收盘;同期 SPY 同样口径。"""
    if len(bars) < h:
        return None
    o, c = bars[0][1], bars[h - 1][4]
    s0, s1 = spy_by.get(bars[0][0]), spy_by.get(bars[h - 1][0])
    if not (s0 and s1) or o <= 0:
        return None
    ret = c / o - 1
    return {"ret": ret, "excess": ret - (s1[4] / s0[1] - 1)}


def run(att_path: str, cache: str, loose_accel: float = 2.0, loose_min: float = 10) -> list[dict[str, Any]]:
    os.makedirs(cache, exist_ok=True)
    att = load_att(att_path)
    spy = prices("SPY", cache)
    spy_by = {r[0]: r for r in spy}
    events: list[dict[str, Any]] = []
    for t, a in att.items():
        if t in signal.NOT_STOCKS or t in signal.CRYPTO_SYMBOLS:
            continue
        daily = a["daily"]
        cand_days = []
        for i in range(8, len(daily)):
            m = signal.attention_metrics(daily[: i + 1], a["subs"])
            if m and m["mentions"] >= loose_min and m["accel"] >= loose_accel:
                cand_days.append(m)
        if not cand_days:
            continue
        rows = prices(t, cache)
        if len(rows) < 80:
            continue
        for m in cand_days:
            k = max((j for j, r in enumerate(rows) if r[0] <= m["date"]), default=-1)
            if k < 60:
                continue
            spy_k = [r for r in spy if r[0] <= rows[k][0]]
            mkt = market.features_from_rows(rows[: k + 1], spy_k)
            bars = rows[k + 1:]
            res = signal.classify(t, m, mkt, None)
            ev = {"t": t, "date": m["date"], "att": m, "mkt": mkt, "kind": res["kind"] if res else None,
                  "score": res["score"] if res else None}
            for h in (1, 3, 5, 10):
                ev[f"f{h}"] = forward(bars, spy_by, h)
            if res and res["kind"] == "rebound":
                ev["trade"] = signal.simulate(res["plan"], bars, {**{r[0]: r[4] for r in spy}, **{f"open:{r[0]}": r[1] for r in spy}})
            events.append(ev)
    return events


def summarize(events: list[dict[str, Any]], label: str) -> str:
    lines = [f"### {label}（{len(events)} 个信号，{len({e['t'] for e in events})} 只股票）"]
    for h in (1, 3, 5, 10):
        v = [e[f"f{h}"]["excess"] for e in events if e.get(f"f{h}")]
        if len(v) >= 5:
            lines.append(f"T+{h:<2} n={len(v):4}  超额均值 {st.mean(v)*100:+.2f}%  中位 {st.median(v)*100:+.2f}%  跑赢大盘 {100*sum(x>0 for x in v)/len(v):.0f}%")
    tr = [e["trade"] for e in events if e.get("trade") and e["trade"].get("status") in ("stop", "target", "time")]
    if tr:
        rets = [x["ret"] for x in tr]
        wins = [r for r in rets if r > 0]
        loss = [-r for r in rets if r <= 0]
        pf = (sum(wins) / sum(loss)) if loss and sum(loss) > 0 else float("inf")
        by = defaultdict(int)
        for x in tr:
            by[x["status"]] += 1
        exc = [x["excess"] for x in tr if x.get("excess") is not None]
        lines.append(
            f"按计划交易 n={len(tr)}：胜率 {100*len(wins)/len(rets):.0f}%，每笔均值 {st.mean(rets)*100:+.2f}%，"
            f"超额 {st.mean(exc)*100 if exc else 0:+.2f}%，盈亏比(总盈/总亏) {pf:.2f}，出场 {dict(by)}"
        )
    missed = sum(1 for e in events if (e.get("trade") or {}).get("status") == "missed")
    if missed:
        lines.append(f"高开超过入场上沿放弃 {missed} 次")
    return "\n".join(lines)


def main() -> None:
    att_path, cache = sys.argv[1], sys.argv[2]
    ev = run(att_path, cache)
    json.dump(ev, open(os.path.join(cache, "..", "events.json"), "w"), default=str)
    print(summarize(ev, "所有热度放大（≥2 倍、≥10 次，未过滤）"))
    for k in ("rebound", "hot"):
        print(summarize([e for e in ev if e["kind"] == k], k))
    print(summarize([e for e in ev if e["kind"] is None], "其余热度放大（无信号）"))


if __name__ == "__main__":
    main()
