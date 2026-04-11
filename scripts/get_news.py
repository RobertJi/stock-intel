#!/usr/bin/env python3
"""Fetch market news for watchlist tickers via Yahoo Finance (no API key needed)."""

import json
import time
import urllib.request
from datetime import datetime, timezone

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]
NEWS_PER_TICKER = 8

COMPANY_ALIASES = {
    "META": ["meta", "facebook", "instagram", "whatsapp", "threads"],
    "NFLX": ["netflix", "nflx"],
    "NVDA": ["nvidia", "nvda", "geforce", "cuda", "jensen huang"],
    "OXY": ["occidental", "occidental petroleum", "oxy"],
}

GENERIC_PATTERNS = [
    "stock market today",
    "dow jones",
    "s&p 500",
    "nasdaq",
    "best stocks",
    "millionaire",
    "dividend",
    "buying opportunity",
    "etf",
    "bitcoin",
    "ethereum",
    "cryptocurrency",
    "market dip",
    "bull case",
]


def classify_news_relevance(ticker: str, title: str, related_tickers: list[str]) -> dict:
    title_lower = (title or "").lower()
    aliases = COMPANY_ALIASES.get(ticker, [])
    alias_hit = any(alias in title_lower for alias in aliases)
    generic_hit = any(pattern in title_lower for pattern in GENERIC_PATTERNS)
    related_hit = ticker in related_tickers
    narrow_related = related_hit and len(related_tickers) <= 2

    score = 0
    if alias_hit:
        score += 5
    if related_hit:
        score += 1
    if narrow_related:
        score += 1
    if generic_hit and not alias_hit:
        score -= 3

    scope = "direct" if alias_hit else "related" if score >= 2 else "broad"
    detail_eligible = alias_hit
    return {
        "score": score,
        "scope": scope,
        "detailEligible": detail_eligible,
        "aliasHit": alias_hit,
        "genericHit": generic_hit,
    }


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
        thumb = ""
        resolutions = ((item.get("thumbnail") or {}).get("resolutions") or [])
        if resolutions:
            thumb = resolutions[-1].get("url", "") or resolutions[0].get("url", "")

        title = item.get("title", "").strip()
        related_tickers = item.get("relatedTickers", [])
        relevance = classify_news_relevance(ticker, title, related_tickers)

        results.append({
            "ticker": ticker,
            "type": "MARKET_NEWS",
            "title": title,
            "date": date_str,
            "source": item.get("publisher", "Yahoo Finance"),
            "link": item.get("link") or item.get("url") or "",
            "impact": "NEUTRAL",
            "description": "",
            "published_ts": ts,
            "metadata": {
                "uuid": item.get("uuid", ""),
                "publisher": item.get("publisher", "Yahoo Finance"),
                "relatedTickers": related_tickers,
                "thumbnail": thumb,
                "newsScope": relevance["scope"],
                "newsScore": relevance["score"],
                "detailEligible": relevance["detailEligible"],
                "aliasHit": relevance["aliasHit"],
                "genericHit": relevance["genericHit"],
            },
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
