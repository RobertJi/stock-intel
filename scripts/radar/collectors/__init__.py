"""Signal collectors. Each returns list[dict] shaped like radar_signals rows."""
from __future__ import annotations

import hashlib
from typing import Any


def make_signal(
    source_kind: str,
    source_name: str,
    title: str,
    *,
    content: str = "",
    url: str = "",
    published_at: str | None = None,
    entities: list[str] | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    hash_input = f"{source_name}|{title}|{url}".encode()
    return {
        "source_kind": source_kind,
        "source_name": source_name,
        "title": title[:500],
        "content": content[:4000],
        "url": url,
        "published_at": published_at,
        "entities": entities or [],
        "raw": raw or {},
        "content_hash": hashlib.sha256(hash_input).hexdigest(),
    }
