#!/usr/bin/env python3
"""Fetch market news for watchlist tickers via Yahoo Finance (no API key needed)."""

import json
import time
import urllib.request
from datetime import datetime, timezone

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]
NEWS_PER_TICKER = 5


def fetch_news_for_ticker(ticker: str) -> list[dict]:
    url = (
        f"https://query1.finance.yahoo.com/v1/finance/search"
        f"?q={ticker}&newsCount={NEWS_PER_TICKER}&enableFuzzyQuery=false"
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"  [news] {ticker} fetch error: {e}")
        return []

    results = []
    for item in data.get("news", []):
        ts = item.get("providerPublishTime", 0)
        if not ts:
            continue
        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        results.append({
            "ticker": ticker,
            "type": "MARKET_NEWS",
            "title": item.get("title", "").strip(),
            "date": date_str,
            "source": item.get("publisher", "Yahoo Finance"),
            "link": item.get("link") or item.get("url") or "",
            "impact": "NEUTRAL",
            "description": "",
            "published_ts": ts,
        })
    return results


def fetch_all_news() -> list[dict]:
    all_news = []
    for ticker in WATCHLIST:
        items = fetch_news_for_ticker(ticker)
        all_news.extend(items)
        print(f"  [news] {ticker}: {len(items)} articles")
        time.sleep(0.3)
    return all_news
