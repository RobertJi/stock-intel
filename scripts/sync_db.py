#!/usr/bin/env python3
"""Background sync: fetch stock prices and SEC events, write to SQLite DB."""

import json
import os
import sqlite3
import sys
import time
from pathlib import Path


OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

def translate_to_chinese(text: str) -> str:
    """Use OpenRouter to translate SEC filings to Chinese."""
    if not text or len(text.strip()) < 10:
        return text
    try:
        import requests as _req
        resp = _req.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            json={
                "model": "openai/gpt-4o-mini",
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
        data = resp.json()
        choices = data.get("choices", [])
        if choices:
            translated = choices[0].get("message", {}).get("content", "").strip()
            if translated:
                return translated
        return text
    except Exception as e:
        print(f"  translate error: {e}", file=sys.stderr)
        return text

DB_PATH = Path(__file__).parent.parent / "data" / "stock-intel.db"
DB_PATH.parent.mkdir(exist_ok=True)

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]
TICKER_CIK = {
    "META": "0001326801",
    "NFLX": "0001065280",
    "NVDA": "0001045810",
    "OXY": "0000797468",
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS stocks (
          ticker TEXT PRIMARY KEY,
          price REAL NOT NULL,
          change_pct REAL NOT NULL DEFAULT 0,
          change_amt REAL NOT NULL DEFAULT 0,
          prev_close REAL NOT NULL DEFAULT 0,
          history TEXT NOT NULL DEFAULT '[]',
          updated_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'edgar',
          link TEXT,
          impact TEXT NOT NULL DEFAULT 'NEUTRAL',
          description TEXT,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_events_ticker ON events(ticker);
        CREATE INDEX IF NOT EXISTS idx_events_date ON events(date DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup ON events(ticker, title, date, source);

        CREATE TABLE IF NOT EXISTS sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          ran_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        """
    )
    return conn


def sync_prices(conn):
    try:
        import yfinance as yf

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
                conn.execute(
                    """
                    INSERT OR REPLACE INTO stocks
                    (ticker, price, change_pct, change_amt, prev_close, history, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (ticker, price, change_pct, change_amt, prev_close, json.dumps(history), int(time.time())),
                )
                print(f"  OK {ticker}: ${price} ({change_pct:+.2f}%)")
            except Exception as exc:
                print(f"  ERR {ticker}: {exc}", file=sys.stderr)
        conn.commit()
        conn.execute(
            "INSERT INTO sync_log (type, status, message) VALUES ('prices', 'ok', ?)",
            (f"Synced {len(WATCHLIST)} tickers",),
        )
        conn.commit()
    except Exception as exc:
        conn.execute(
            "INSERT INTO sync_log (type, status, message) VALUES ('prices', 'error', ?)",
            (str(exc),),
        )
        conn.commit()
        raise


def sync_events(conn):
    """Fetch 8-K events using item-level parsing from get_events.py logic."""
    import importlib.util, os
    spec = importlib.util.spec_from_file_location(
        "get_events",
        os.path.join(os.path.dirname(__file__), "get_events.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    new_count = 0
    for ticker, cik in TICKER_CIK.items():
        events = mod.fetch_8k_filings(cik, ticker, limit=8)
        for ev in events:
            if ev.get("error"):
                continue
            try:
                raw_desc = ev.get("description", "")
                # Translate to Chinese if API key available, else leave blank
                zh_desc = translate_to_chinese(raw_desc) if raw_desc else ""
                conn.execute(
                    """
                    INSERT OR IGNORE INTO events
                    (ticker, type, title, date, source, link, impact, description, description_zh)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ev["ticker"], ev["type"], ev["title"], ev["date"],
                        ev.get("source", "edgar"), ev.get("link", ""),
                        ev.get("impact", "NEUTRAL"), raw_desc, zh_desc,
                    ),
                )
                new_count += conn.execute("SELECT changes()").fetchone()[0]
            except Exception:
                pass
        print(f"  OK {ticker} events fetched")
        time.sleep(0.5)

    conn.commit()
    conn.execute(
        "INSERT INTO sync_log (type, status, message) VALUES ('events', 'ok', ?)",
        (f"Inserted {new_count} new events",),
    )
    conn.commit()


def sync_form4(conn):
    """Fetch Form 4 insider trading filings."""
    import importlib.util, os as _os
    spec = importlib.util.spec_from_file_location(
        "get_form4", _os.path.join(_os.path.dirname(__file__), "get_form4.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    new_count = 0
    for ticker, cik in TICKER_CIK.items():
        events = mod.fetch_form4_filings(cik, ticker, limit=10)
        for ev in events:
            if ev.get("error"):
                continue
            try:
                raw_desc = ev.get("description", "")
                zh_desc = translate_to_chinese(raw_desc) if raw_desc else ""
                meta = json.dumps(ev.get("metadata", {}))
                conn.execute(
                    """
                    INSERT OR IGNORE INTO events
                    (ticker, type, title, date, source, link, impact, description, description_zh, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ev["ticker"], ev["type"], ev["title"], ev["date"],
                        ev.get("source", "edgar_form4"), ev.get("link", ""),
                        ev.get("impact", "NEUTRAL"), raw_desc, zh_desc, meta,
                    ),
                )
                new_count += conn.execute("SELECT changes()").fetchone()[0]
            except Exception:
                pass
        print(f"  OK {ticker} form4 fetched")
        time.sleep(0.5)

    conn.commit()
    conn.execute(
        "INSERT INTO sync_log (type, status, message) VALUES ('form4', 'ok', ?)",
        (f"Inserted {new_count} new form4 events",),
    )
    conn.commit()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    connection = get_conn()
    if mode in ("all", "prices"):
        print("Syncing prices...")
        sync_prices(connection)
    if mode in ("all", "events"):
        print("Syncing events...")
        sync_events(connection)
    if mode in ("all", "form4"):
        print("Syncing Form 4 insider trades...")
        sync_form4(connection)
    connection.close()
    print("Done.")
