"""v4 value pipeline: SEC fundamentals → quality / red flags / valuation → snapshots, sealed calls, alerts.

Usage:
    python -m scripts.value.run [--dry-run] [TICKER ...]

Universe = watchlist ∪ positions ∪ value_companies. Non-US tickers are recorded as
unsupported until a data source for them is connected.
"""
from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from ..radar import db, notify
from . import edgar, model

MAX_ALERT_AGE_DAYS = 7


def universe() -> list[str]:
    tickers: list[str] = []
    for table in ("watchlist", "positions", "value_companies"):
        try:
            tickers += [r["ticker"] for r in db.get(table, "select=ticker")]
        except Exception as e:  # noqa: BLE001
            print(f"  universe: {table} unavailable ({e})")
    seen, out = set(), []
    for t in tickers:
        t = t.strip().upper()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def price_and_history(ticker: str) -> tuple[float | None, list[list[float]]]:
    sym = ticker.replace(".", "-") if not any(ticker.endswith(s) for s in (".KS", ".HK", ".T", ".SS", ".SZ", ".TW")) else ticker
    r = requests.get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=5y&interval=1wk",
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    price = res["meta"].get("regularMarketPrice")
    closes = res["indicators"]["quote"][0]["close"]
    hist = [[ts, round(c, 4)] for ts, c in zip(res.get("timestamp") or [], closes) if c is not None]
    return price, hist


def _fmt_money(x: float | None) -> str:
    return "—" if x is None else f"${x:,.2f}"


def process(ticker: str, today: str, dry_run: bool) -> dict[str, Any]:
    info = edgar.lookup(ticker)
    if not info:
        reason = "暂不支持：不是在 SEC 申报的美股公司（港股、A 股、日韩台需要接入 FMP / Tushare）"
        if not dry_run:
            db.insert("value_companies", [{"ticker": ticker, "supported": False, "unsupported_reason": reason}], upsert_on="ticker")
            db.update("value_companies", f"ticker=eq.{ticker}", {"supported": False, "unsupported_reason": reason,
                                                                  "updated_at": datetime.now(timezone.utc).isoformat()})
        return {"ticker": ticker, "status": "unsupported"}

    cik = info["cik"]
    facts = edgar.company_facts(cik)
    sub = edgar.submissions(cik)
    sic = int(sub.get("sic") or 0) or None
    annual = edgar.annual_financials(facts, 12)
    if len(annual) < 3:
        raise RuntimeError(f"only {len(annual)} fiscal years of XBRL data")
    shares, shares_asof, shares_src = edgar.shares_outstanding(facts, annual)
    price, hist = price_and_history(ticker)
    analysis = model.analyze(annual, price, shares, sic)
    if shares is None:
        analysis["notes"].append("SEC 数据里拿不到可靠的总股本（多类股结构），估值暂缺，接入 FMP 后补齐。")
    filings = edgar.latest_filings(cik)
    latest = filings[0] if filings else {}

    company = {
        "ticker": ticker, "cik": cik, "name": sub.get("name") or info["name"], "sic": sic, "market": "US",
        "supported": True, "unsupported_reason": None, "latest_filing": latest,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    snap = {
        "ticker": ticker, "as_of": today, "price": price, "shares": shares, "shares_source": shares_src,
        "analysis": analysis, "financials": annual, "price_history": hist,
    }
    v = analysis["valuation"]
    summary = {
        "ticker": ticker, "price": price, "zone": analysis["zone"], "base": v.get("base"), "buy": v.get("buy_price"),
        "unc": v.get("uncertainty"), "q": analysis["quality_score"], "flags": [f["key"] for f in analysis["flags"] if f["flag"]],
    }
    if dry_run:
        print(json.dumps(summary, ensure_ascii=False))
        return {"ticker": ticker, "status": "ok", **summary}

    prev_company = db.get("value_companies", f"select=latest_filing&ticker=eq.{ticker}&limit=1")
    prev_snap = db.get("value_snapshots", f"select=as_of,price,analysis&ticker=eq.{ticker}&as_of=lt.{today}&order=as_of.desc&limit=1")

    db.insert("value_companies", [company], upsert_on="ticker")
    db.update("value_companies", f"ticker=eq.{ticker}", company)
    existing = db.get("value_snapshots", f"select=id&ticker=eq.{ticker}&as_of=eq.{today}&limit=1")
    if existing:
        db.update("value_snapshots", f"id=eq.{existing[0]['id']}", snap)
    else:
        db.insert("value_snapshots", [snap])

    # seal one call per filing × model version (append-only)
    if v.get("base") is not None:
        db.insert("value_calls", [{
            "ticker": ticker, "model_version": model.MODEL_VERSION, "filing_accn": latest.get("accn"),
            "price": price, "bear": v.get("bear"), "base": v.get("base"), "bull": v.get("bull"),
            "buy_price": v.get("buy_price"), "uncertainty": v.get("uncertainty"), "zone": analysis["zone"],
            "implied_return": v.get("implied_return"),
        }], upsert_on="ticker,filing_accn,model_version")

    alerts = []
    name = company["name"]
    prev_filing = (prev_company[0]["latest_filing"] if prev_company else {}) or {}
    if prev_filing.get("accn") and latest.get("accn") and latest["accn"] != prev_filing["accn"]:
        prev_base = ((prev_snap[0]["analysis"] or {}).get("valuation") or {}).get("base") if prev_snap else None
        alerts.append(("new_filing", latest["accn"],
                       f"📄 {ticker} {name} 发布了新{latest['form']}（{latest.get('period') or ''}），估值已重算\n"
                       f"基准价值 {_fmt_money(prev_base)} → {_fmt_money(v.get('base'))}，买入价 {_fmt_money(v.get('buy_price'))}，现价 {_fmt_money(price)}\n"
                       f"{latest.get('url', '')}"))
    prev_zone = ((prev_snap[0]["analysis"] or {}).get("zone")) if prev_snap else None
    if analysis["zone"] == "buy" and prev_zone != "buy":
        alerts.append(("entered_buy_zone", today,
                       f"🟢 {ticker} {name} 进入买入区间\n现价 {_fmt_money(price)} ≤ 买入价 {_fmt_money(v.get('buy_price'))}"
                       f"（基准价值 {_fmt_money(v.get('base'))}，{v.get('uncertainty_label', '?')}不确定性要求 {int((v.get('required_discount') or 0) * 100)}% 折扣）\n"
                       "这是模型信号，不是买入建议：请先看公司档案里的假设和排雷项。"))
    prev_flags = {f["key"] for f in ((prev_snap[0]["analysis"] or {}).get("flags") or []) if f.get("flag")} if prev_snap else set()
    for f in analysis["flags"]:
        if f["flag"] and f["key"] not in prev_flags and prev_snap:
            alerts.append(("red_flag", f"{f['key']}:{latest.get('accn', today)}",
                           f"⚠️ {ticker} {name} 触发排雷项：{f['label']}\n{f['rule']}，当前 {f['value']:.2f}。{f.get('note') or ''}"))
    for kind, key, msg in alerts:
        db.insert("value_alerts", [{"ticker": ticker, "kind": kind, "dedupe_key": key, "message": msg}],
                  upsert_on="ticker,kind,dedupe_key")
    return {"ticker": ticker, "status": "ok", **summary, "alerts": len(alerts)}


def deliver(dry_run: bool) -> int:
    if dry_run:
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_ALERT_AGE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    db.update("value_alerts", f"delivered=eq.false&created_at=lt.{cutoff}&select=id", {"delivered": True})
    pending = db.get("value_alerts", "select=id,message&delivered=eq.false&order=created_at.asc&limit=20")
    if not pending or not notify.configured():
        return 0
    sent = 0
    for a in pending:
        if notify.send(a["message"]):
            db.update("value_alerts", f"id=eq.{a['id']}", {"delivered": True})
            sent += 1
    return sent


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    args = [a.upper() for a in sys.argv[1:] if not a.startswith("--")]
    if not dry_run:
        db.require_env()
    tickers = args or universe()
    today = datetime.now(timezone.utc).date().isoformat()
    print(f"value: {len(tickers)} tickers → {', '.join(tickers)}")
    results, failed = [], []
    for t in tickers:
        try:
            results.append(process(t, today, dry_run))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            failed.append(f"{t}: {str(e)[:160]}")
    sent = deliver(dry_run)
    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"value: {ok} analyzed, {len(results) - ok} unsupported, {len(failed)} failed, {sent} alerts delivered")
    if failed:
        if not dry_run:
            notify.send("⚠️ stock-intel 价值管道部分失败\n" + "\n".join(f"· {x}" for x in failed))
        if not ok:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
