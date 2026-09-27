"""SEC EDGAR XBRL companyfacts → standardized annual financials.

Free, official, and point-in-time capable: every fact carries the filing it came from
(`accn`) and the date it was filed. We keep, for each fiscal year, the value as last
reported (restated if the company restated) plus the date it was first filed.

Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
SEC asks for a descriptive User-Agent and ≤10 requests/second.
"""
from __future__ import annotations

import json
import os
import time
from datetime import date
from functools import lru_cache
from typing import Any

import requests

UA = os.environ.get("SEC_USER_AGENT") or "stock-intel-research research@stock-intel.app"
_last_call = 0.0


def _get(url: str) -> Any:
    global _last_call
    wait = 0.15 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    for attempt in range(3):
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"}, timeout=60)
        _last_call = time.time()
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()


@lru_cache(maxsize=1)
def ticker_map() -> dict[str, dict[str, Any]]:
    data = _get("https://www.sec.gov/files/company_tickers.json")
    out = {}
    for row in data.values():
        out[row["ticker"].upper()] = {"cik": int(row["cik_str"]), "name": row["title"]}
    return out


def lookup(ticker: str) -> dict[str, Any] | None:
    t = ticker.upper().replace(".", "-")
    return ticker_map().get(t)


def company_facts(cik: int) -> dict[str, Any]:
    return _get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")


def submissions(cik: int) -> dict[str, Any]:
    return _get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")


# Standardized line items → ordered list of us-gaap concepts to try.
# "flow" items are summed over the fiscal year (duration ≈ 1y); "stock" items are
# balances at fiscal year end.
FLOW = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueGoodsNet",
    ],
    "cogs": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"],
    "gross_profit": ["GrossProfit"],
    "sga": ["SellingGeneralAndAdministrativeExpense"],
    "operating_income": ["OperatingIncomeLoss"],
    "pretax_income": [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
    ],
    "income_tax": ["IncomeTaxExpenseBenefit"],
    "interest_expense": ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
    "net_income": ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
    "dna": [
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
        "DepreciationAmortizationAndAccretionNet",
        "Depreciation",
    ],
    "cfo": [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "sbc": ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
    "dividends": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    "buybacks": ["PaymentsForRepurchaseOfCommonStock"],
    "issuance": ["ProceedsFromIssuanceOfCommonStock", "ProceedsFromStockOptionsExercised"],
    "diluted_shares": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "eps_diluted": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
}
STOCK = {
    "total_assets": ["Assets"],
    "current_assets": ["AssetsCurrent"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "total_liabilities": ["Liabilities"],
    "equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments", "Cash"],
    "short_investments": ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "long_term_debt": [
        "LongTermDebtNoncurrent",
        "LongTermDebt",
        "LongTermDebtAndCapitalLeaseObligations",
        "LongTermNotesPayable",
    ],
    "current_debt": ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper"],
    "receivables": ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
    "ppe": ["PropertyPlantAndEquipmentNet"],
    "retained_earnings": ["RetainedEarningsAccumulatedDeficit"],
}

# Items where a missing value is better treated as 0 than as unknown.
ZERO_OK = {"dividends", "buybacks", "issuance", "short_investments", "current_debt", "interest_expense", "sbc"}


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _annual_series(units: dict[str, list[dict[str, Any]]], flow: bool) -> dict[str, dict[str, Any]]:
    """fiscal-year-end date → {value, filed (first), accn (latest)} using 10-K facts only."""
    rows = units.get("USD") or units.get("shares") or units.get("USD/shares") or []
    by_end: dict[str, dict[str, Any]] = {}
    for f in rows:
        if f.get("form") not in ("10-K", "10-K/A", "20-F", "40-F"):
            continue
        end = f.get("end")
        if not end:
            continue
        if flow:
            start = f.get("start")
            if not start or not (340 <= _days(start, end) <= 390):
                continue
        cur = by_end.get(end)
        if cur is None:
            by_end[end] = {"value": f["val"], "filed": f["filed"], "last_filed": f["filed"], "accn": f["accn"]}
        else:
            # latest filing wins for the value (restatements); keep earliest filed date for PIT
            if f["filed"] >= cur["last_filed"]:
                cur.update(value=f["val"], last_filed=f["filed"], accn=f["accn"])
            if f["filed"] < cur["filed"]:
                cur["filed"] = f["filed"]
    return by_end


def annual_financials(facts: dict[str, Any], years: int = 15) -> list[dict[str, Any]]:
    """Return a list of fiscal years (oldest→newest) with standardized items.

    Each year: {"fy_end": "2025-01-26", "filed": "2025-02-26", "accn": "...", <item>: value | None,
                "_src": {item: concept}}
    """
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    series: dict[str, dict[str, dict[str, Any]]] = {}
    source: dict[str, str] = {}
    for items, flow in ((FLOW, True), (STOCK, False)):
        for item, concepts in items.items():
            merged: dict[str, dict[str, Any]] = {}
            # earlier concept in the list has priority, later ones fill gaps (tag renames over time)
            for concept in concepts:
                node = gaap.get(concept)
                if not node:
                    continue
                s = _annual_series(node.get("units") or {}, flow)
                for end, v in s.items():
                    if end not in merged:
                        merged[end] = {**v, "concept": concept}
                if concept not in source.values() and s:
                    source.setdefault(item, concept)
            series[item] = merged

    # fiscal years are defined by net income / revenue / assets period ends
    anchor = set(series.get("net_income", {})) | set(series.get("revenue", {}))
    ends = sorted(e for e in anchor if e in series.get("total_assets", {}) or e in series.get("net_income", {}))
    # collapse near-duplicate ends (52/53-week years report slightly different dates)
    fy_ends: list[str] = []
    for e in ends:
        if fy_ends and _days(fy_ends[-1], e) < 300:
            fy_ends[-1] = e
        else:
            fy_ends.append(e)
    fy_ends = fy_ends[-years:]

    out = []
    for end in fy_ends:
        row: dict[str, Any] = {"fy_end": end, "_src": {}}
        filed, accn = None, None
        for item in list(FLOW) + list(STOCK):
            hit = _nearest(series.get(item, {}), end)
            if hit is None:
                row[item] = 0.0 if item in ZERO_OK else None
                continue
            row[item] = float(hit["value"])
            row["_src"][item] = hit["concept"]
            if item in ("net_income", "revenue") and (filed is None or hit["filed"] < filed):
                filed, accn = hit["filed"], hit["accn"]
        if row.get("gross_profit") is None and row.get("revenue") is not None and row.get("cogs") is not None:
            row["gross_profit"] = row["revenue"] - row["cogs"]
        if row.get("operating_income") is None and row.get("pretax_income") is not None:
            # some issuers (e.g. oil & gas, conglomerates) don't tag operating income: EBIT ≈ pretax + interest
            row["operating_income"] = row["pretax_income"] + (row.get("interest_expense") or 0)
            row["_src"]["operating_income"] = "pretax_income+interest_expense"
        if row.get("diluted_shares") is None and row.get("net_income") and row.get("eps_diluted"):
            # multi-class issuers (e.g. Visa) don't tag a single diluted share count: NI / diluted EPS
            row["diluted_shares"] = row["net_income"] / row["eps_diluted"]
            row["_src"]["diluted_shares"] = "net_income/eps_diluted"
        row["filed"] = filed
        row["accn"] = accn
        out.append(row)
    return out


def _nearest(s: dict[str, dict[str, Any]], end: str, tol: int = 10) -> dict[str, Any] | None:
    if end in s:
        return s[end]
    for e, v in s.items():
        if abs(_days(e, end)) <= tol:
            return v
    return None


def shares_outstanding(facts: dict[str, Any], annual: list[dict[str, Any]] | None = None) -> tuple[float | None, str | None, str | None]:
    """Most recent share count: (value, as-of date, source). A source older than ~15 months
    before the latest fiscal year end is ignored as stale.

    1. dei cover-page count (sums share classes reported on the same date)
    2. latest diluted weighted-average shares from any 10-Q/10-K
    3. latest fiscal year's net income / diluted EPS (works for multi-class issuers)
    4. latest us-gaap CommonStockSharesOutstanding
    """
    latest_fy = annual[-1]["fy_end"] if annual else None

    def fresh(end: str) -> bool:
        return latest_fy is None or _days(end, latest_fy) <= 460

    dei = (facts.get("facts") or {}).get("dei") or {}
    rows = (dei.get("EntityCommonStockSharesOutstanding") or {}).get("units", {}).get("shares", [])
    if rows:
        latest_filed = max(r["filed"] for r in rows)
        same = [r for r in rows if r["filed"] == latest_filed]
        latest_end = max(r["end"] for r in same)
        if fresh(latest_end):
            return float(sum(r["val"] for r in same if r["end"] == latest_end)), latest_end, "dei:cover"
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    rows = (gaap.get("WeightedAverageNumberOfDilutedSharesOutstanding") or {}).get("units", {}).get("shares", [])
    rows = [r for r in rows if r.get("form") in ("10-Q", "10-K", "20-F", "40-F")]
    if rows:
        r = max(rows, key=lambda r: (r["end"], r["filed"]))
        if fresh(r["end"]):
            return float(r["val"]), r["end"], "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding"
    if annual and annual[-1].get("diluted_shares"):
        return float(annual[-1]["diluted_shares"]), annual[-1]["fy_end"], annual[-1]["_src"].get("diluted_shares", "diluted_shares")
    rows = (gaap.get("CommonStockSharesOutstanding") or {}).get("units", {}).get("shares", [])
    if rows:
        r = max(rows, key=lambda r: (r["end"], r["filed"]))
        if fresh(r["end"]):
            return float(r["val"]), r["end"], "us-gaap:CommonStockSharesOutstanding"
    return None, None, None


def latest_filings(cik: int, forms: tuple[str, ...] = ("10-K", "10-Q", "20-F")) -> list[dict[str, Any]]:
    sub = submissions(cik)
    recent = sub.get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(recent.get("form", [])):
        if form in forms:
            accn = recent["accessionNumber"][i]
            out.append({
                "form": form,
                "accn": accn,
                "filed": recent["filingDate"][i],
                "period": recent.get("reportDate", [None] * (i + 1))[i],
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn.replace('-', '')}/{recent['primaryDocument'][i]}",
            })
    return out


if __name__ == "__main__":  # quick manual check: python -m scripts.value.edgar NVDA
    import sys

    info = lookup(sys.argv[1])
    facts = company_facts(info["cik"])
    for y in annual_financials(facts, 6):
        print(json.dumps({k: y[k] for k in ("fy_end", "filed", "revenue", "operating_income", "net_income", "cfo", "capex", "sbc", "equity", "cash", "long_term_debt")}))
    print(shares_outstanding(facts, annual_financials(facts, 6)))
