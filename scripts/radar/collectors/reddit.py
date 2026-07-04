"""Hot posts from finance/tech subreddits via RSS (JSON API blocks datacenter IPs)."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

import requests

from .. import config
from . import make_signal

ATOM = "{http://www.w3.org/2005/Atom}"


def collect() -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for sub in config.REDDIT_SUBS:
        try:
            signals.extend(_fetch_sub(sub))
        except Exception as e:  # noqa: BLE001
            print(f"  reddit[{sub}] failed: {e}")
    return signals


def _fetch_sub(sub: str, limit: int = 10) -> list[dict[str, Any]]:
    r = requests.get(
        f"https://www.reddit.com/r/{sub}/hot/.rss?limit={limit}",
        timeout=20,
        headers={"User-Agent": "Mozilla/5.0 (sector-radar personal research)"},
    )
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out = []
    for entry in root.iter(f"{ATOM}entry"):
        title = (entry.findtext(f"{ATOM}title") or "").strip()
        link_el = entry.find(f"{ATOM}link")
        url = link_el.get("href") if link_el is not None else ""
        published = entry.findtext(f"{ATOM}published")
        if not title:
            continue
        out.append(
            make_signal(
                "social",
                "reddit",
                f"[r/{sub}] {title}",
                url=url or "",
                published_at=published,
                raw={"subreddit": sub},
            )
        )
        if len(out) >= limit:
            break
    return out
