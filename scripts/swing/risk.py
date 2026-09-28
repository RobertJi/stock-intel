"""排雷:借用价值模块的 SEC 数据,给波段候选打风险标签。

热门小票最常见的坑是「热度一起来就增发」,所以重点看近 30 天有没有融资类申报(S-1/S-3/424B/F-1/F-3)。
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ..value import edgar, model

OFFERING_FORMS = ("S-1", "S-1/A", "S-3", "S-3/A", "S-3ASR", "424B1", "424B2", "424B3", "424B4", "424B5", "F-1", "F-3", "F-3ASR")


def check(ticker: str, price: float | None) -> list[dict[str, Any]]:
    """返回风险标签列表 [{key, label, severity(high|medium|info), detail}]。查不到 SEC 数据时返回 info 级提示。"""
    flags: list[dict[str, Any]] = []
    info = edgar.lookup(ticker)
    if not info:
        return [{"key": "no_sec", "label": "未排雷", "severity": "info", "detail": "SEC 查不到这家公司（可能是 ADR 或非美股）"}]
    cik = info["cik"]
    try:
        sub = edgar.submissions(cik)
        recent = sub.get("filings", {}).get("recent", {})
        cutoff = (date.today() - timedelta(days=30)).isoformat()
        hits = [
            (recent["form"][i], recent["filingDate"][i])
            for i in range(len(recent.get("form", [])))
            if recent["form"][i] in OFFERING_FORMS and recent["filingDate"][i] >= cutoff
        ]
        if hits:
            forms = "、".join(sorted({f for f, _ in hits}))
            flags.append({
                "key": "recent_offering", "label": "近 30 天有融资申报", "severity": "high",
                "detail": f"{forms}（最近 {max(d for _, d in hits)}），热度期间增发会砸盘",
            })
    except Exception as e:  # noqa: BLE001
        flags.append({"key": "sec_error", "label": "排雷失败", "severity": "info", "detail": str(e)[:120]})
        return flags
    try:
        facts = edgar.company_facts(cik)
        annual = edgar.annual_financials(facts, 6)
        if len(annual) < 3:
            flags.append({"key": "short_history", "label": "财报历史不足 3 年", "severity": "medium", "detail": "新上市或刚转板，基本面无法体检"})
            return flags
        shares, _, _ = edgar.shares_outstanding(facts, annual)
        a = model.analyze(annual, price, shares, int(sub.get("sic") or 0) or None)
        sev: dict[str, str] = {}  # 长期财务问题对 5 天波段只作提示;只有「近期融资申报」算高风险
        for f in a["flags"]:
            if f["flag"]:
                val = f"{f['value']*100:.1f}%" if f["key"] in ("issuance", "accruals") else f"{f['value']:.2f}"
                flags.append({"key": f["key"], "label": f["label"], "severity": sev.get(f["key"], "medium"), "detail": f"{f['rule']}，当前 {val}"})
        last = annual[-1]
        if (last.get("net_income") or 0) < 0 and (last.get("cfo") or 0) < 0:
            flags.append({"key": "cash_burn", "label": "亏损且经营现金流为负", "severity": "medium", "detail": f"最近财年 {last.get('fy_end')}"})
    except Exception as e:  # noqa: BLE001
        flags.append({"key": "fundamentals_error", "label": "基本面体检失败", "severity": "info", "detail": str(e)[:120]})
    return flags
