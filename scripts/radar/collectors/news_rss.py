"""Google News RSS per sector topic. No API key, minute-level freshness."""
from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any

import requests

from .. import config
from . import make_signal


def collect() -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for sector, query in config.NEWS_TOPICS.items():
        try:
            signals.extend(_fetch_topic(sector, query))
        except Exception as e:  # noqa: BLE001
            print(f"  news_rss[{sector}] failed: {e}")
    return signals


def _fetch_topic(sector: str, query: str, limit: int = 15) -> list[dict[str, Any]]:
    q = urllib.parse.quote(f"{query} when:1d")
    url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate")
        published = None
        if pub:
            try:
                published = parsedate_to_datetime(pub).isoformat()
            except Exception:  # noqa: BLE001
                pass
        if not title:
            continue
        out.append(
            make_signal(
                "news",
                "google_news_rss",
                title,
                url=link,
                published_at=published,
                raw={"topic_sector": sector, "query": query},
            )
        )
        if len(out) >= limit:
            break
    return out
