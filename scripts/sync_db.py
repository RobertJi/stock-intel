#!/usr/bin/env python3
"""Background sync: fetch stock prices and SEC events, write to Supabase."""

import json
import os
import sys
import time

import requests

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

def _load_watchlist() -> list[dict]:
    """Fetch watchlist from Supabase. Fallback to hardcoded list on error."""
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/watchlist?select=ticker,cik,aliases&order=added_at.asc",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data:
            print(f"  Watchlist loaded from Supabase: {[r['ticker'] for r in data]}")
            return data
    except Exception as exc:
        print(f"  WARN: could not load watchlist from Supabase ({exc}), using fallback", file=sys.stderr)
    return [
        {"ticker": "META", "cik": "0001326801"},
        {"ticker": "NFLX", "cik": "0001065280"},
        {"ticker": "NVDA", "cik": "0001045810"},
        {"ticker": "OXY",  "cik": "0000797468"},
    ]

_wl_data = _load_watchlist()
WATCHLIST = [row["ticker"] for row in _wl_data]
TICKER_CIK = {row["ticker"]: row["cik"] for row in _wl_data if row.get("cik")}


def supa_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
    }


def supa_upsert(table: str, rows: list[dict], on_conflict: str = ""):
    """Upsert rows into a Supabase table via REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supa_headers()
    if on_conflict:
        headers["Prefer"] = f"resolution=merge-duplicates,return=minimal"
        url += f"?on_conflict={on_conflict}"
    resp = requests.post(url, headers=headers, json=rows, timeout=30)
    resp.raise_for_status()
    return resp


def supa_insert_ignore(table: str, rows: list[dict]):
    """Insert rows, ignoring duplicates (on_conflict = do nothing)."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supa_headers()
    headers["Prefer"] = "resolution=ignore-duplicates,return=minimal"
    # Insert in batches to avoid hitting payload limits
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        resp = requests.post(url, headers=headers, json=batch, timeout=30)
        if resp.status_code == 409:
            # Conflict on batch — insert one by one
            for row in batch:
                r = requests.post(url, headers=headers, json=[row], timeout=30)
                if r.status_code not in (200, 201, 409):
                    r.raise_for_status()
        elif resp.status_code not in (200, 201):
            resp.raise_for_status()


def log_sync(type_: str, status: str, message: str):
    supa_insert_ignore("sync_log", [{
        "type": type_, "status": status, "message": message,
        "ran_at": int(time.time()),
    }])


def translate_to_chinese(text: str) -> str:
    """Use OpenRouter to translate SEC filings to Chinese."""
    if not OPENROUTER_API_KEY or not text or len(text.strip()) < 10:
        return text
    try:
        resp = requests.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            json={
                "model": "deepseek/deepseek-chat",
                "max_tokens": 300,
                "messages": [{
                    "role": "user",
                    "content": f"将以下美股SEC公告翻译成简洁中文（80字以内），只返回翻译，不加解释：\n\n{text[:600]}"
                }]
            },
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=30
        )
        choices = resp.json().get("choices", [])
        if choices:
            translated = choices[0].get("message", {}).get("content", "").strip()
            if translated:
                return translated
    except Exception as e:
        print(f"  translate error: {e}", file=sys.stderr)
    return text


def sync_prices():
    try:
        import yfinance as yf
        rows = []
        for ticker in WATCHLIST:
            try:
                stock = yf.Ticker(ticker)
                info = stock.fast_info
                hist = stock.history(period="30d", interval="1d")
                price = round(float(info.get("lastPrice", 0)), 2)
                prev_close = round(float(info.get("previousClose", price)), 2)
                change_amt = round(price - prev_close, 2)
                change_pct = round((change_amt / prev_close * 100) if prev_close else 0, 2)
                history = [
                    {"date": date.strftime("%Y-%m-%d"), "close": round(float(row["Close"]), 2)}
                    for date, row in hist.iterrows()
                ]
                rows.append({
                    "ticker": ticker,
                    "price": price,
                    "change_pct": change_pct,
                    "change_amt": change_amt,
                    "prev_close": prev_close,
                    "history": history,
                    "updated_at": int(time.time()),
                })
                print(f"  OK {ticker}: ${price} ({change_pct:+.2f}%)")
            except Exception as exc:
                print(f"  ERR {ticker}: {exc}", file=sys.stderr)

        if rows:
            supa_upsert("stocks", rows, on_conflict="ticker")
        log_sync("prices", "ok", f"Synced {len(rows)} tickers")
    except Exception as exc:
        log_sync("prices", "error", str(exc))
        raise


def sync_events():
    import importlib.util, os as _os
    spec = importlib.util.spec_from_file_location(
        "get_events", _os.path.join(_os.path.dirname(__file__), "get_events.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    new_count = 0
    rows = []
    for ticker, cik in TICKER_CIK.items():
        events = mod.fetch_8k_filings(cik, ticker, limit=8)
        for ev in events:
            if ev.get("error"):
                continue
            raw_desc = ev.get("description", "")
            zh_desc = translate_to_chinese(raw_desc) if raw_desc else ""
            rows.append({
                "ticker": ev["ticker"],
                "type": ev["type"],
                "title": ev["title"],
                "date": ev["date"],
                "source": ev.get("source", "edgar"),
                "link": ev.get("link", ""),
                "impact": ev.get("impact", "NEUTRAL"),
                "description": raw_desc,
                "description_zh": zh_desc,
                "metadata": ev.get("metadata", {}),
            })
        print(f"  OK {ticker} events fetched")
        time.sleep(0.5)

    if rows:
        supa_insert_ignore("events", rows)
        new_count = len(rows)

    log_sync("events", "ok", f"Processed {new_count} events")


def sync_form4():
    import importlib.util, os as _os
    spec = importlib.util.spec_from_file_location(
        "get_form4", _os.path.join(_os.path.dirname(__file__), "get_form4.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    rows = []
    for ticker, cik in TICKER_CIK.items():
        events = mod.fetch_form4_filings(cik, ticker, limit=10)
        for ev in events:
            if ev.get("error"):
                continue
            raw_desc = ev.get("description", "")
            zh_desc = translate_to_chinese(raw_desc) if raw_desc else ""
            rows.append({
                "ticker": ev["ticker"],
                "type": ev["type"],
                "title": ev["title"],
                "date": ev["date"],
                "source": ev.get("source", "edgar_form4"),
                "link": ev.get("link", ""),
                "impact": ev.get("impact", "NEUTRAL"),
                "description": raw_desc,
                "description_zh": zh_desc,
                "metadata": ev.get("metadata", {}),
            })
        print(f"  OK {ticker} form4 fetched")
        time.sleep(0.5)

    if rows:
        supa_insert_ignore("events", rows)

    log_sync("form4", "ok", f"Processed {len(rows)} form4 events")


def sync_news():
    import importlib.util, os as _os
    spec = importlib.util.spec_from_file_location(
        "get_news", _os.path.join(_os.path.dirname(__file__), "get_news.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    articles = mod.fetch_all_news()
    rows = []
    for item in articles:
        raw_title = item["title"]
        zh_title = translate_to_chinese(raw_title) if raw_title else ""
        metadata = item.get("metadata", {}) or {}
        metadata.update({
            "publishedTs": item.get("published_ts", 0),
            "primaryTicker": item["ticker"],
        })
        rows.append({
            "ticker": item["ticker"],
            "type": "MARKET_NEWS",
            "title": raw_title,
            "date": item["date"],
            "source": item.get("source", "Yahoo Finance"),
            "link": item.get("link", ""),
            "impact": "NEUTRAL",
            "description": "",
            "description_zh": zh_title,
            "metadata": metadata,
        })

    if rows:
        supa_insert_ignore("events", rows)

    log_sync("news", "ok", f"Processed {len(rows)} news articles")
    print(f"  News sync done: {len(rows)} articles")


if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("all", "prices"):
        print("Syncing prices...")
        sync_prices()
    if mode in ("all", "events"):
        print("Syncing events...")
        sync_events()
    if mode in ("all", "form4"):
        print("Syncing Form 4 insider trades...")
        sync_form4()
    if mode in ("all", "news"):
        print("Syncing market news...")
        sync_news()
    print("Done.")
