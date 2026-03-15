#!/usr/bin/env python3
"""Fetch recent SEC EDGAR 8-K events for watchlist stocks."""
import sys, json, re
from datetime import datetime, timezone
from urllib.request import urlopen
from urllib.error import URLError
import xml.etree.ElementTree as ET

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]

# Map ticker → CIK (SEC company identifier)
TICKER_CIK = {
    "META":  "0001326801",
    "NFLX":  "0001065280",
    "NVDA":  "0001045810",
    "OXY":   "0000797468",
}

EVENT_TYPE_MAP = {
    "1.01": "AGREEMENT",
    "1.02": "TERMINATION",
    "2.01": "ACQUISITION",
    "2.02": "EARNINGS",
    "3.01": "DELISTING",
    "3.02": "UNREGISTERED_SALE",
    "4.01": "AUDITOR_CHANGE",
    "4.02": "FINANCIAL_RESTATEMENT",
    "5.02": "CEO_CHANGE",
    "5.03": "AMENDMENT",
    "7.01": "REGULATION_FD",
    "8.01": "OTHER",
    "9.01": "FINANCIAL_STATEMENTS",
}

def fetch_8k_filings(cik: str, ticker: str, limit=5):
    url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K&dateb=&owner=include&count={limit}&search_text=&output=atom"
    try:
        from urllib.request import Request
        req = urlopen(Request(url, headers={"User-Agent": "StockIntel research@example.com"}), timeout=10)
        tree = ET.parse(req)
        root = tree.getroot()
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        events = []
        for entry in root.findall("atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            updated_el = entry.find("atom:updated", ns)
            link_el = entry.find("atom:link", ns)

            title = title_el.text if title_el is not None else "8-K Filing"
            date_str = updated_el.text[:10] if updated_el is not None else ""
            link = link_el.get("href", "") if link_el is not None else ""

            events.append({
                "ticker": ticker,
                "type": "SEC_8K",
                "title": title.strip(),
                "date": date_str,
                "link": link,
                "impact": "NEUTRAL",
                "description": f"{ticker} filed an 8-K report with the SEC.",
            })
        return events
    except Exception as e:
        return [{"ticker": ticker, "error": str(e), "type": "SEC_8K", "date": "", "title": "Fetch error"}]

def get_events():
    all_events = []
    for ticker, cik in TICKER_CIK.items():
        events = fetch_8k_filings(cik, ticker)
        all_events.extend(events)

    # Sort by date desc
    all_events.sort(key=lambda x: x.get("date", ""), reverse=True)
    print(json.dumps(all_events[:20]))

if __name__ == "__main__":
    get_events()
