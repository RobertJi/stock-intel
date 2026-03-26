#!/usr/bin/env python3
"""Fetch SEC EDGAR 8-K events with item-level content extraction."""
import sys, json, time, re
from urllib.request import urlopen, Request
from urllib.error import URLError
import xml.etree.ElementTree as ET

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]

TICKER_CIK = {
    "META": "0001326801",
    "NFLX": "0001065280",
    "NVDA": "0001045810",
    "OXY":  "0000797468",
}

ITEM_MAP = {
    "1.01": ("MATERIAL_AGREEMENT",   "NEUTRAL",  "Material Definitive Agreement"),
    "1.02": ("AGREEMENT_TERMINATED", "BEARISH",  "Agreement Terminated"),
    "1.03": ("BANKRUPTCY",           "BEARISH",  "Bankruptcy or Receivership"),
    "2.01": ("ACQUISITION",          "BULLISH",  "Acquisition / Disposition of Assets"),
    "2.02": ("EARNINGS",             "NEUTRAL",  "Earnings / Financial Results"),
    "2.03": ("DEBT_OBLIGATION",      "BEARISH",  "Direct Financial Obligation Created"),
    "2.05": ("COST_REDUCTION",       "BULLISH",  "Exit or Disposal Activities"),
    "2.06": ("IMPAIRMENT",           "BEARISH",  "Material Impairment"),
    "3.01": ("DELISTING",            "BEARISH",  "Delisting from Exchange"),
    "3.02": ("UNREGISTERED_SALE",    "NEUTRAL",  "Unregistered Sale of Equity"),
    "4.01": ("AUDITOR_CHANGE",       "NEUTRAL",  "Auditor Change"),
    "4.02": ("RESTATEMENT",          "BEARISH",  "Financial Restatement"),
    "5.01": ("OWNERSHIP_CHANGE",     "NEUTRAL",  "Change in Control"),
    "5.02": ("EXECUTIVE_CHANGE",     "NEUTRAL",  "Director / Officer Change"),
    "5.03": ("CHARTER_AMENDMENT",    "NEUTRAL",  "Charter Amendment"),
    "5.07": ("SHAREHOLDER_VOTE",     "NEUTRAL",  "Shareholder Vote"),
    "7.01": ("REGULATION_FD",        "NEUTRAL",  "Regulation FD Disclosure"),
    "8.01": ("OTHER_EVENTS",         "NEUTRAL",  "Other Events"),
    "9.01": ("FINANCIAL_EXHIBITS",   "NEUTRAL",  "Financial Exhibits"),
}

HEADERS = {"User-Agent": "StockIntel research@example.com"}

def fetch_url(url, timeout=10):
    req = Request(url, headers=HEADERS)
    return urlopen(req, timeout=timeout)

def clean_text(html: str) -> str:
    """Strip HTML tags, decode entities, and collapse whitespace."""
    from html import unescape
    text = re.sub(r'<[^>]+>', ' ', html)
    text = unescape(text)
    text = re.sub(r'[\xa0\u200b\u200c]', ' ', text)  # nbsp and zero-width
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def get_full_submission_url(index_url: str) -> str | None:
    """From index URL, derive the full submission .txt URL."""
    # index URL pattern: /Archives/edgar/data/{cik}/{folder}/{accession}-index.htm
    # accession in folder may be without hyphens; in filename has hyphens
    m = re.search(r'/Archives/edgar/data/(\d+)/(\d+)/([0-9-]+)-index\.htm', index_url)
    if m:
        cik, folder, accession = m.group(1), m.group(2), m.group(3)
        return f"https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{accession}.txt"
    return None

def extract_item_content(index_url: str, item_num: str, max_chars=400) -> str:
    """Fetch full 8-K submission text and extract content under the specified item."""
    txt_url = get_full_submission_url(index_url)
    if not txt_url:
        return ""
    try:
        raw = fetch_url(txt_url, timeout=12).read().decode("utf-8", errors="replace")
        escaped = re.escape(item_num)
        pattern = re.compile(
            r'[Ii]tem\s+' + escaped + r'(.*?)(?=[Ii]tem\s+\d+\.\d+|SIGNATURES?)',
            re.DOTALL | re.IGNORECASE
        )
        m = pattern.search(raw)
        if m:
            text = re.sub(r'<[^>]+>', ' ', m.group(1))
            text = re.sub(r'&[a-z]+;', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            # Remove leading long header (everything up to 2nd period + uppercase word)
            text = re.sub(r'^(?:[^.]+\.){1,3}\s*', '', text).strip()
            return text[:max_chars].rsplit(' ', 1)[0] + '…' if len(text) > max_chars else text
    except Exception:
        pass
    return ""

def parse_items_from_index(index_url: str) -> list:
    """
    Fetch 8-K index page, detect items, try to get content from the filing doc.
    Returns list of dicts with item_num, event_type, impact, label, content.
    """
    try:
        html = fetch_url(index_url, timeout=8).read().decode("utf-8", errors="replace")
        item_pattern = re.compile(r'[Ii]tem\s+(\d+\.\d+)', re.IGNORECASE)
        found_nums = list(dict.fromkeys(item_pattern.findall(html)))  # preserve order, deduplicate

        items = []
        for item_num in found_nums:
            if item_num in ITEM_MAP:
                event_type, impact, label = ITEM_MAP[item_num]
                items.append({
                    "item_num": item_num,
                    "event_type": event_type,
                    "impact": impact,
                    "label": label,
                    "content": "",
                })

        # Filter out 9.01 if other items exist
        meaningful = [x for x in items if x["item_num"] != "9.01"]
        items = meaningful if meaningful else items[:3]

        # Try to fetch actual content from the full submission text
        if items:
            time.sleep(0.3)
            for item in items:
                content = extract_item_content(index_url, item["item_num"])
                item["content"] = content

        return items
    except Exception:
        return []


def fetch_8k_filings(cik: str, ticker: str, limit=8):
    url = (
        f"https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcompany&CIK={cik}&type=8-K"
        f"&dateb=&owner=include&count={limit}&search_text=&output=atom"
    )
    events = []
    try:
        tree = ET.parse(fetch_url(url, timeout=10))
        root = tree.getroot()
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        for entry in root.findall("atom:entry", ns):
            updated_el = entry.find("atom:updated", ns)
            link_el = entry.find("atom:link", ns)
            date_str = (updated_el.text or "")[:10] if updated_el is not None else ""
            link = link_el.get("href", "") if link_el is not None else ""

            items = []
            if link:
                time.sleep(0.3)
                items = parse_items_from_index(link)

            if items:
                for item in items:
                    desc = item["content"] or f"Item {item['item_num']} — {item['label']}. Filed with the SEC."
                    events.append({
                        "ticker": ticker,
                        "type": item["event_type"],
                        "item_num": item["item_num"],
                        "title": item["label"],
                        "date": date_str,
                        "source": "edgar",
                        "link": link,
                        "impact": item["impact"],
                        "description": desc,
                    })
            else:
                events.append({
                    "ticker": ticker,
                    "type": "SEC_8K",
                    "item_num": "",
                    "title": "8-K Current Report",
                    "date": date_str,
                    "source": "edgar",
                    "link": link,
                    "impact": "NEUTRAL",
                    "description": f"{ticker} filed an 8-K report with the SEC.",
                })

        return events
    except Exception as e:
        return [{"ticker": ticker, "error": str(e), "type": "SEC_8K", "date": "", "title": f"Fetch error"}]


def get_events():
    all_events = []
    for ticker, cik in TICKER_CIK.items():
        events = fetch_8k_filings(cik, ticker)
        all_events.extend(events)
        time.sleep(0.5)
    all_events.sort(key=lambda x: x.get("date", ""), reverse=True)
    print(json.dumps(all_events[:40]))

if __name__ == "__main__":
    get_events()
