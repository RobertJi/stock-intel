"""Quality metrics, red-flag checks and scenario valuation from standardized annual data.

Everything here is deterministic arithmetic on reported numbers — no LLM. Every
threshold is a named constant so the UI can show exactly why a check passed/failed.

Methodology (see docs/value-methodology.md):
- Quality: ROIC level & persistence, gross-margin stability, cash conversion, leverage,
  dilution (Novy-Marx 2013; AQR QMJ; Mauboussin "Measuring the Moat").
- Value: EBIT/EV, owner-earnings yield, net shareholder yield (Loughran-Wellman 2011;
  Boudoukh et al. 2007).
- Red flags: Beneish M-score, Altman Z (Beneish-Lee-Nichols 2013; Campbell et al. 2008).
- Valuation: three-scenario DCF on owner earnings (FCF − SBC) with growth anchored half
  to the company's history and half to a size-based base rate, explicit-period length
  set by a ROIC-persistence moat proxy (Morningstar methodology); EPV as a no-growth
  floor (Greenwald); reverse DCF for the growth the price implies (Mauboussin-Rappaport).
- Buy price: base value × (1 − required discount), discount rising with uncertainty
  (Morningstar-style margin of safety; the exact steps are this system's convention).
"""
from __future__ import annotations

import math
import statistics as st
from typing import Any

MODEL_VERSION = "v4.0"

DISCOUNT_RATE = 0.09
TERMINAL_GROWTH = 0.025
DEFAULT_TAX = 0.21
REQUIRED_DISCOUNT = {"low": 0.20, "medium": 0.30, "high": 0.40, "very_high": 0.50}
UNCERTAINTY_LABEL = {"low": "低", "medium": "中", "high": "高", "very_high": "极高"}

# Size-based base rate for nominal revenue growth, years 1–5. System convention that
# follows the direction of Mauboussin et al., "The Base Rate Book" (2016): the larger
# the company, the lower and tighter the achievable growth distribution.
def base_rate_growth(revenue: float) -> float:
    b = revenue / 1e9
    if b < 1:
        return 0.10
    if b < 5:
        return 0.08
    if b < 20:
        return 0.06
    if b < 50:
        return 0.05
    return 0.04


def _safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _cagr(first: float | None, last: float | None, years: float) -> float | None:
    if not first or not last or first <= 0 or last <= 0 or years <= 0:
        return None
    return (last / first) ** (1 / years) - 1


SPLIT_RATIOS = (2, 3, 4, 5, 8, 10, 15, 20, 25, 50)


def split_adjusted_shares(years: list[dict[str, Any]]) -> list[float | None]:
    """Diluted share counts restated to today's share basis.

    XBRL keeps pre-split counts in older filings. A year-over-year jump close to a
    common split ratio (2:1 … 50:1, or the reverse) is treated as a split and all
    earlier years are rescaled.
    """
    raw = [y.get("diluted_shares") for y in years]
    adj = list(raw)
    factor = 1.0
    for i in range(len(raw) - 1, 0, -1):
        cur, prev = raw[i], raw[i - 1]
        if cur and prev:
            ratio = cur / prev
            for k in SPLIT_RATIOS:
                if abs(ratio / k - 1) < 0.12:
                    factor *= k
                    break
                if abs(ratio * k - 1) < 0.12:
                    factor /= k
                    break
        if prev is not None:
            adj[i - 1] = prev * factor
    return adj


def yearly_metrics(years: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    adj_shares = split_adjusted_shares(years)
    prev = None
    for y in years:
        pretax, tax = y.get("pretax_income"), y.get("income_tax")
        t = _safe_div(tax, pretax) if pretax and pretax > 0 else None
        t = DEFAULT_TAX if t is None else min(max(t, 0.0), 0.35)
        debt = (y.get("long_term_debt") or 0) + (y.get("current_debt") or 0)
        cash = (y.get("cash") or 0) + (y.get("short_investments") or 0)
        ic = None
        if y.get("equity") is not None:
            ic = y["equity"] + debt - cash
        ic_prev = None
        if prev is not None and prev.get("equity") is not None:
            ic_prev = prev["equity"] + (prev.get("long_term_debt") or 0) + (prev.get("current_debt") or 0) - (
                (prev.get("cash") or 0) + (prev.get("short_investments") or 0)
            )
        ic_avg = (ic + ic_prev) / 2 if ic is not None and ic_prev is not None else ic
        op = y.get("operating_income")
        nopat = op * (1 - t) if op is not None else None
        roic = _safe_div(nopat, ic_avg) if ic_avg and ic_avg > 0 else None
        fcf = y["cfo"] - y["capex"] if y.get("cfo") is not None and y.get("capex") is not None else None
        oe = fcf - (y.get("sbc") or 0) if fcf is not None else None
        rev = y.get("revenue")
        ebitda = op + (y.get("dna") or 0) if op is not None else None
        out.append({
            "fy_end": y["fy_end"],
            "revenue": rev,
            "gross_margin": _safe_div(y.get("gross_profit"), rev),
            "op_margin": _safe_div(op, rev),
            "net_income": y.get("net_income"),
            "fcf": fcf,
            "owner_earnings": oe,
            "oe_margin": _safe_div(oe, rev),
            "roic": roic,
            "gp_assets": _safe_div(y.get("gross_profit"), y.get("total_assets")),
            "tax_rate": t,
            "debt": debt,
            "cash": cash,
            "net_debt": debt - cash,
            "ebitda": ebitda,
            "ebit": op,
            "diluted_shares": adj_shares[len(out)],
            "shareholder_payout": (y.get("dividends") or 0) + (y.get("buybacks") or 0) - (y.get("issuance") or 0),
        })
        prev = y
    return out


def beneish_m(cur: dict[str, Any], prev: dict[str, Any]) -> tuple[float | None, list[str]]:
    """Beneish (1999) 8-variable M-score. Missing inputs are set to neutral (1 or 0) and listed."""
    missing = []

    def ratio(fn, name, neutral=1.0):
        try:
            v = fn()
            if v is None or not math.isfinite(v):
                raise ValueError
            return v
        except Exception:  # noqa: BLE001
            missing.append(name)
            return neutral

    s1, s0 = cur.get("revenue"), prev.get("revenue")
    if not s1 or not s0:
        return None, ["revenue"]
    dsri = ratio(lambda: (cur["receivables"] / s1) / (prev["receivables"] / s0), "DSRI")
    gmi = ratio(lambda: (prev["gross_profit"] / s0) / (cur["gross_profit"] / s1), "GMI")
    aqi = ratio(
        lambda: (1 - (cur["current_assets"] + cur["ppe"]) / cur["total_assets"])
        / (1 - (prev["current_assets"] + prev["ppe"]) / prev["total_assets"]),
        "AQI",
    )
    sgi = s1 / s0
    depi = ratio(
        lambda: (prev["dna"] / (prev["dna"] + prev["ppe"])) / (cur["dna"] / (cur["dna"] + cur["ppe"])),
        "DEPI",
    )
    sgai = ratio(lambda: (cur["sga"] / s1) / (prev["sga"] / s0), "SGAI")
    lvgi = ratio(
        lambda: ((cur["current_liabilities"] + cur["long_term_debt"]) / cur["total_assets"])
        / ((prev["current_liabilities"] + prev["long_term_debt"]) / prev["total_assets"]),
        "LVGI",
    )
    tata = ratio(lambda: (cur["net_income"] - cur["cfo"]) / cur["total_assets"], "TATA", 0.0)
    m = (
        -4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi
        - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi
    )
    return m, missing


def altman_z(y: dict[str, Any], market_cap: float | None) -> float | None:
    ta = y.get("total_assets")
    if not ta or market_cap is None or not y.get("total_liabilities"):
        return None
    try:
        wc = y["current_assets"] - y["current_liabilities"]
        return (
            1.2 * wc / ta
            + 1.4 * (y.get("retained_earnings") or 0) / ta
            + 3.3 * y["operating_income"] / ta
            + 0.6 * market_cap / y["total_liabilities"]
            + 1.0 * y["revenue"] / ta
        )
    except (TypeError, KeyError, ZeroDivisionError):
        return None


def _dcf_per_share(oe0: float, g1: float, years: int, margin_factor: float, net_cash: float, shares: float,
                   r: float = DISCOUNT_RATE, gt: float = TERMINAL_GROWTH) -> float:
    """Owner earnings grow at g1 in years 1–5, then fade linearly to gt by `years`; Gordon terminal."""
    fcf = oe0 * margin_factor
    pv = 0.0
    for t in range(1, years + 1):
        if t <= 5 or years <= 5:
            g = g1
        else:
            g = g1 + (gt - g1) * (t - 5) / (years - 5)
        fcf *= 1 + g
        pv += fcf / (1 + r) ** t
    tv = fcf * (1 + gt) / (r - gt)
    pv += tv / (1 + r) ** years
    return (pv + net_cash) / shares


def _solve(fn, lo: float, hi: float, target: float, iters: int = 80) -> float | None:
    flo, fhi = fn(lo) - target, fn(hi) - target
    if flo * fhi > 0:
        return None
    for _ in range(iters):
        mid = (lo + hi) / 2
        fm = fn(mid) - target
        if flo * fm <= 0:
            hi, fhi = mid, fm
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2


def analyze(years: list[dict[str, Any]], price: float | None, shares: float | None, sic: int | None = None) -> dict[str, Any]:
    ym = yearly_metrics(years)
    last, last_raw = ym[-1], years[-1]
    n = len(ym)
    recent10 = ym[-10:]
    roics = [m["roic"] for m in recent10 if m["roic"] is not None]
    gms = [m["gross_margin"] for m in recent10 if m["gross_margin"] is not None]
    opms = [m["op_margin"] for m in ym[-5:] if m["op_margin"] is not None]
    market_cap = price * shares if price and shares else None
    ev = market_cap + last["net_debt"] if market_cap is not None else None

    is_financial = sic is not None and 6000 <= sic <= 6799
    notes: list[str] = []
    if is_financial:
        notes.append("金融类公司（银行、保险等）：自由现金流和 ROIC 口径不适用，估值结果仅供参考。")

    # ---- growth & dilution
    k = min(5, n - 1)
    rev_cagr = _cagr(ym[-1 - k]["revenue"], last["revenue"], k) if k >= 3 else None
    sh_cagr = _cagr(ym[-1 - k]["diluted_shares"], last["diluted_shares"], k) if k >= 3 else None

    # ---- quality checks
    oe3 = [m["owner_earnings"] for m in ym[-3:] if m["owner_earnings"] is not None]
    ni3 = [m["net_income"] for m in ym[-3:] if m["net_income"] is not None]
    cash_conv = _safe_div(sum(oe3), sum(ni3)) if len(oe3) == 3 and len(ni3) == 3 and sum(ni3) > 0 else None
    nd_ebitda = _safe_div(last["net_debt"], last["ebitda"]) if last["ebitda"] and last["ebitda"] > 0 else None
    roic_years_above = sum(1 for x in roics if x >= 0.10)

    def chk(key, label, value, passed, rule, fmt="pct"):
        return {"key": key, "label": label, "value": value, "pass": passed, "rule": rule, "fmt": fmt}

    quality = [
        chk("roic_median", f"近 {len(roics)} 年 ROIC 中位数", st.median(roics) if roics else None,
            (st.median(roics) >= 0.15) if roics else None, "≥ 15%"),
        chk("roic_min", f"近 {len(roics)} 年 ROIC 最低值", min(roics) if roics else None,
            (min(roics) >= 0.08) if roics else None, "≥ 8%"),
        chk("gm_stability", "毛利率波动（标准差）", st.pstdev(gms) if len(gms) >= 3 else None,
            (st.pstdev(gms) <= 0.05) if len(gms) >= 3 else None, "≤ 5 个百分点", "pp"),
        chk("cash_conversion", "近 3 年利润含金量（所有者盈余 / 净利润）", cash_conv,
            (cash_conv >= 0.8) if cash_conv is not None else None, "≥ 80%"),
        chk("leverage", "净负债 / EBITDA", nd_ebitda if nd_ebitda is not None else (None if last["net_debt"] > 0 else -1.0),
            (nd_ebitda <= 2.0) if nd_ebitda is not None else (True if last["net_debt"] <= 0 else None), "≤ 2 倍（净现金即通过）", "x"),
        chk("dilution", f"近 {k} 年稀释后股本年化变化", sh_cagr, (sh_cagr <= 0.01) if sh_cagr is not None else None, "≤ +1%/年"),
    ]

    # ---- moat proxy (ROIC persistence, Mauboussin "Measuring the Moat")
    if len(roics) >= 5:
        share = roic_years_above / len(roics)
        med = st.median(roics)
        moat = "wide" if share >= 0.8 and med >= 0.15 else "narrow" if share >= 0.6 else "none"
    else:
        moat = "unknown"
    stage_years = {"wide": 15, "narrow": 10, "none": 7, "unknown": 7}[moat]

    # ---- red flags
    flags = []
    if n >= 2:
        m_score, m_missing = beneish_m(last_raw, years[-2])
        if m_score is not None:
            flags.append({
                "key": "beneish", "label": "Beneish M-score（财务操纵风险）", "value": m_score,
                "flag": m_score > -1.78, "rule": "> −1.78 视为警示",
                "note": ("高速增长公司容易误报，需要人工看应收和应计。" if (rev_cagr or 0) > 0.25 else "")
                + (f" 缺失项按中性处理：{', '.join(m_missing)}" if m_missing else ""),
            })
    z = altman_z(last_raw, market_cap)
    if z is not None and not is_financial:
        flags.append({"key": "altman", "label": "Altman Z（财务困境）", "value": z, "flag": z < 1.81, "rule": "< 1.81 视为困境区", "note": ""})
    if sh_cagr is not None:
        flags.append({"key": "issuance", "label": "持续增发", "value": sh_cagr, "flag": sh_cagr > 0.03, "rule": "股本年增 > 3%", "note": ""})
    tata = _safe_div((last_raw.get("net_income") or 0) - (last_raw.get("cfo") or 0), last_raw.get("total_assets"))
    if tata is not None:
        flags.append({"key": "accruals", "label": "应计利润占总资产", "value": tata, "flag": tata > 0.10, "rule": "> 10% 视为利润质量警示", "note": ""})

    # ---- valuation
    valuation: dict[str, Any] = {"model_version": MODEL_VERSION, "discount_rate": DISCOUNT_RATE, "terminal_growth": TERMINAL_GROWTH,
                                 "moat_proxy": moat, "stage_years": stage_years}
    # Normalized owner earnings: median owner-earnings margin of the last 5 years × latest
    # revenue, so one abnormal year (tax deposits, one-off payments) doesn't drive value.
    oe_margins = [m["oe_margin"] for m in ym[-5:] if m["oe_margin"] is not None]
    oe_latest = last["owner_earnings"]
    oe0 = st.median(oe_margins) * last["revenue"] if len(oe_margins) >= 3 and last["revenue"] else oe_latest
    net_cash = -last["net_debt"]
    growths = [
        ym[i]["revenue"] / ym[i - 1]["revenue"] - 1
        for i in range(max(1, n - 5), n)
        if ym[i]["revenue"] and ym[i - 1]["revenue"]
    ]
    vol_g = min(st.pstdev(growths), 0.25) if len(growths) >= 3 else 0.10
    vol_m = min(st.pstdev(oe_margins), 0.15) if len(oe_margins) >= 3 else 0.05
    if shares and oe0 and oe0 > 0 and last["revenue"]:
        g_br = base_rate_growth(last["revenue"])
        g_hist = min(max(rev_cagr, -0.10), 0.40) if rev_cagr is not None else g_br
        g_base = 0.5 * g_hist + 0.5 * g_br
        # scenario width scales with the company's own growth and margin volatility
        scen = {
            "bear": {"g": max(g_base - (0.02 + 0.5 * vol_g), -0.08), "margin": 1 - (0.05 + 1.0 * vol_m),
                     "years": max(stage_years - 3, 5)},
            "base": {"g": g_base, "margin": 1.0, "years": stage_years},
            "bull": {"g": g_base + (0.015 + 0.4 * vol_g), "margin": 1 + (0.03 + 0.5 * vol_m), "years": stage_years},
        }
        for s in scen.values():
            s["value"] = _dcf_per_share(oe0, s["g"], s["years"], s["margin"], net_cash, shares)
        bear, base, bull = scen["bear"]["value"], scen["base"]["value"], scen["bull"]["value"]
        spread = (bull - bear) / base if base > 0 else 9
        vol = vol_m
        if spread <= 0.6:
            unc = "low"
        elif spread <= 1.0:
            unc = "medium"
        elif spread <= 1.6:
            unc = "high"
        else:
            unc = "very_high"
        # hyper-growth or erratic cash flow can never be "low" uncertainty
        order = ["low", "medium", "high", "very_high"]
        if (rev_cagr or 0) > 0.30 or vol > 0.10:
            unc = order[max(order.index(unc), 2)]
        elif (rev_cagr or 0) > 0.15 or vol > 0.05:
            unc = order[max(order.index(unc), 1)]
        if is_financial:
            unc = "very_high"
        disc = REQUIRED_DISCOUNT[unc]
        buy = base * (1 - disc)

        def value_at(g):
            return _dcf_per_share(oe0, g, stage_years, 1.0, net_cash, shares)

        implied_g = _solve(value_at, -0.30, 1.0, price) if price else None
        implied_r = None
        if price:
            implied_r = _solve(lambda r: _dcf_per_share(oe0, g_base, stage_years, 1.0, net_cash, shares, r=r), 0.03, 0.40, price)
        valuation.update({
            "method": "三情景 DCF（所有者盈余 = 经营现金流 − 资本开支 − 股权激励）",
            "owner_earnings_base": oe0,
            "owner_earnings_latest": oe_latest,
            "growth_volatility": vol_g,
            "margin_volatility": vol_m,
            "growth_hist": rev_cagr,
            "growth_base_rate": g_br,
            "scenarios": scen,
            "bear": bear, "base": base, "bull": bull,
            "uncertainty": unc,
            "uncertainty_label": UNCERTAINTY_LABEL[unc],
            "required_discount": disc,
            "buy_price": buy,
            "implied_growth": implied_g,
            "implied_return": implied_r,
        })
    else:
        valuation["method"] = "不适用"
        notes.append("最近一年所有者盈余为负或数据不足，DCF 不适用，只看 EPV 和质量指标。")

    # EPV floor (Greenwald): normalized EBIT × (1 − t) / r + net cash
    if shares and opms and last["revenue"]:
        norm_ebit = st.median(opms) * last["revenue"]
        epv = (norm_ebit * (1 - last["tax_rate"]) / DISCOUNT_RATE + net_cash) / shares
        valuation["epv"] = epv

    # ---- value checks (need price)
    ebit_ev = _safe_div(last["ebit"], ev) if ev and ev > 0 else None
    oe_yield = _safe_div(oe0, market_cap) if market_cap and oe0 is not None else None
    sh_yield = _safe_div(last["shareholder_payout"], market_cap) if market_cap else None
    base_v = valuation.get("base")
    buy = valuation.get("buy_price")
    value = [
        chk("ebit_ev", "EBIT / 企业价值", ebit_ev, (ebit_ev >= 0.06) if ebit_ev is not None else None, "≥ 6%"),
        chk("oe_yield", "所有者盈余收益率", oe_yield, (oe_yield >= 0.04) if oe_yield is not None else None, "≥ 4%"),
        chk("sh_yield", "净股东收益率（分红 + 回购 − 增发）", sh_yield, (sh_yield >= 0.02) if sh_yield is not None else None, "≥ 2%"),
        chk("below_base", "股价 ≤ 基准情景价值", _safe_div(price, base_v), (price <= base_v) if price and base_v else None, "价格 / 价值 ≤ 1", "x"),
        chk("below_buy", "股价 ≤ 买入价", _safe_div(price, buy), (price <= buy) if price and buy else None,
            f"按{UNCERTAINTY_LABEL.get(valuation.get('uncertainty', ''), '?')}不确定性要求 {int(valuation.get('required_discount', 0) * 100)}% 折扣", "x"),
    ]

    def score(checks):
        known = [c for c in checks if c["pass"] is not None]
        return {"passed": sum(1 for c in known if c["pass"]), "total": len(known)}

    zone = None
    if price and base_v:
        if buy and price <= buy:
            zone = "buy"
        elif price <= base_v:
            zone = "fair_low"
        elif valuation.get("bull") and price >= valuation["bull"]:
            zone = "expensive"
        else:
            zone = "fair_high"

    return {
        "model_version": MODEL_VERSION,
        "years": ym,
        "market_cap": market_cap,
        "enterprise_value": ev,
        "revenue_cagr": rev_cagr,
        "moat_proxy": moat,
        "roic_years_above_10": roic_years_above,
        "roic_years_counted": len(roics),
        "quality": quality,
        "quality_score": score(quality),
        "value": value,
        "value_score": score(value),
        "flags": flags,
        "valuation": valuation,
        "zone": zone,
        "is_financial": is_financial,
        "notes": notes,
    }
