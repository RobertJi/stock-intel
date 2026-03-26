#!/usr/bin/env python3
"""
Fetch SEC Form 4 insider trading filings for watchlist stocks.
Form 4 = insiders (officers/directors) reporting purchases/sales of their own company's stock.
This is HIGH signal data — when insiders buy with their own money, it's worth paying attention.
"""
import sys, json, re, time
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

HEADERS = {"User-Agent": "StockIntel research@example.com"}

TRANSACTION_CODES = {
    "P": "Open Market Purchase",
    "S": "Open Market Sale",
    "A": "Grant/Award",
    "D": "Disposition to Company",
    "F": "Tax Withholding",
    "G": "Gift",
    "M": "Option Exercise",
    "X": "Option Exercise (In-the-Money)",
    "C": "Conversion of Derivative",
    "W": "Warrant Exercise",
}

# Transactions that signal actual conviction (exclude automatic plan sales, grants)
SIGNAL_CODES = {"P", "S"}  # Open market buys and sells


def fetch_url(url, timeout=10):
    req = Request(url, headers=HEADERS)
    return urlopen(req, timeout=timeout)


def parse_form4_xml(xml_url: str) -> dict | None:
    """Parse a Form 4 XML filing for transaction details."""
    try:
        tree = ET.parse(fetch_url(xml_url, timeout=10))
        root = tree.getroot()

        # Reporter (insider) info
        reporter = root.find(".//reportingOwner")
        insider_name = ""
        insider_title = ""
        if reporter is not None:
            name_el = reporter.find(".//rptOwnerName")
            title_el = reporter.find(".//officerTitle")
            insider_name = name_el.text.strip() if name_el is not None and name_el.text else ""
            insider_title = title_el.text.strip() if title_el is not None and title_el.text else ""

        # Non-derivative transactions (actual stock buys/sells)
        transactions = []
        for txn in root.findall(".//nonDerivativeTransaction"):
            code_el = txn.find(".//transactionCode")
            shares_el = txn.find(".//transactionShares/value")
            price_el = txn.find(".//transactionPricePerShare/value")
            date_el = txn.find(".//transactionDate/value")
            shares_owned_el = txn.find(".//sharesOwnedFollowingTransaction/value")

            code = code_el.text.strip() if code_el is not None and code_el.text else ""
            if code not in SIGNAL_CODES:
                continue

            shares = float(shares_el.text) if shares_el is not None and shares_el.text else 0
            price = float(price_el.text) if price_el is not None and price_el.text else 0
            date = date_el.text.strip() if date_el is not None and date_el.text else ""
            shares_owned = float(shares_owned_el.text) if shares_owned_el is not None and shares_owned_el.text else 0

            transactions.append({
                "code": code,
                "type": TRANSACTION_CODES.get(code, code),
                "shares": int(shares),
                "price": round(price, 2),
                "value": round(shares * price),
                "date": date,
                "sharesOwned": int(shares_owned),
            })

        if not transactions:
            return None

        return {
            "insiderName": insider_name,
            "insiderTitle": insider_title,
            "transactions": transactions,
        }
    except Exception:
        return None


def fetch_form4_filings(cik: str, ticker: str, limit=10) -> list:
    """Fetch recent Form 4 filings for a company."""
    url = (
        f"https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcompany&CIK={cik}&type=4"
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
            index_url = link_el.get("href", "") if link_el is not None else ""

            # Get the XML filing from the index
            if not index_url:
                continue

            time.sleep(0.3)
            try:
                index_html = fetch_url(index_url, timeout=8).read().decode("utf-8", errors="replace")
                # Find the Form 4 XML file (prefer non-xsl version)
                xml_matches = re.findall(r'href="(/Archives/edgar/data/[^"]+\.xml)"', index_html)
                xml_url = None
                for m in xml_matches:
                    if "xsl" not in m.lower() and "xsd" not in m.lower():
                        xml_url = "https://www.sec.gov" + m
                        break
                if not xml_url:
                    continue

                time.sleep(0.2)
                parsed = parse_form4_xml(xml_url)
                if not parsed or not parsed["transactions"]:
                    continue

                for txn in parsed["transactions"]:
                    is_buy = txn["code"] == "P"
                    impact = "BULLISH" if is_buy else "BEARISH"
                    value_str = f"${txn['value']:,}" if txn['value'] > 0 else "N/A"
                    action = "bought" if is_buy else "sold"

                    events.append({
                        "ticker": ticker,
                        "type": "INSIDER_BUY" if is_buy else "INSIDER_SELL",
                        "title": f"Insider {txn['type']}: {txn['shares']:,} shares",
                        "date": txn["date"] or date_str,
                        "source": "edgar_form4",
                        "link": index_url,
                        "impact": impact,
                        "description": (
                            f"{parsed['insiderName']} ({parsed['insiderTitle'] or 'Insider'}) "
                            f"{action} {txn['shares']:,} shares at ${txn['price']} "
                            f"({value_str} total). Now owns {txn['sharesOwned']:,} shares."
                        ),
                        "metadata": {
                            "insiderName": parsed["insiderName"],
                            "insiderTitle": parsed["insiderTitle"],
                            "shares": txn["shares"],
                            "price": txn["price"],
                            "value": txn["value"],
                            "sharesOwned": txn["sharesOwned"],
                            "transactionCode": txn["code"],
                        }
                    })
            except Exception:
                continue

        return events
    except Exception as e:
        return [{"ticker": ticker, "error": str(e), "type": "INSIDER", "date": "", "title": "Fetch error"}]


def get_form4_events():
    all_events = []
    for ticker, cik in TICKER_CIK.items():
        events = fetch_form4_filings(cik, ticker)
        all_events.extend(events)
        time.sleep(0.5)
    all_events.sort(key=lambda x: x.get("date", ""), reverse=True)
    print(json.dumps(all_events[:40]))


if __name__ == "__main__":
    get_form4_events()
