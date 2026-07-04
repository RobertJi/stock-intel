"""Bridge existing Signal events/form4 rows into radar signals."""
from __future__ import annotations

from typing import Any

from .. import db
from . import make_signal


def collect() -> list[dict[str, Any]]:
    try:
        rows = db.get("events", "select=ticker,type,title,description,link,date&order=date.desc&limit=60")
    except Exception as e:  # noqa: BLE001
        print(f"  events_bridge failed: {e}")
        return []
    out = []
    for row in rows:
        title = row.get("title") or f"{row.get('ticker')} {row.get('type')}"
        out.append(
            make_signal(
                "filing",
                "events_bridge",
                f"[{row.get('ticker')}] {title}",
                content=(row.get("description") or "")[:2000],
                url=row.get("link") or "",
                published_at=row.get("date"),
                entities=[row.get("ticker")] if row.get("ticker") else [],
                raw={"event_type": row.get("type")},
            )
        )
    return out
