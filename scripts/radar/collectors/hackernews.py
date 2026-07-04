"""High-score Hacker News stories via Algolia API (open, no key). Good early tech signal."""
from __future__ import annotations

from typing import Any

import requests

from .. import config
from . import make_signal


def collect() -> list[dict[str, Any]]:
    try:
        r = requests.get(
            "https://hn.algolia.com/api/v1/search_by_date"
            f"?tags=story&numericFilters=points>{config.HN_MIN_POINTS}&hitsPerPage=30",
            timeout=20,
        )
        r.raise_for_status()
        hits = r.json().get("hits", [])
    except Exception as e:  # noqa: BLE001
        print(f"  hackernews failed: {e}")
        return []
    out = []
    for h in hits:
        title = (h.get("title") or "").strip()
        if not title:
            continue
        out.append(
            make_signal(
                "social",
                "hackernews",
                f"[HN] {title}",
                url=h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                published_at=h.get("created_at"),
                raw={"points": h.get("points"), "num_comments": h.get("num_comments")},
            )
        )
    return out
