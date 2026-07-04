"""Track newly trending AI models on HuggingFace (free API) as benchmark-ish signals."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from . import make_signal


def collect() -> list[dict[str, Any]]:
    try:
        r = requests.get(
            "https://huggingface.co/api/models?sort=trendingScore&limit=10",
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        r.raise_for_status()
        models = r.json()
    except Exception as e:  # noqa: BLE001
        print(f"  benchmarks failed: {e}")
        return []
    out = []
    week = datetime.now(timezone.utc).strftime("%Y-W%W")
    for m in models[:10]:
        model_id = m.get("modelId") or m.get("id") or ""
        if not model_id:
            continue
        out.append(
            make_signal(
                "benchmark",
                "hf_trending",
                f"HF trending model: {model_id} ({week})",  # week in hash -> re-signal weekly if still hot
                content=f"downloads={m.get('downloads')}, likes={m.get('likes')}, pipeline={m.get('pipeline_tag')}",
                url=f"https://huggingface.co/{model_id}",
                published_at=datetime.now(timezone.utc).isoformat(),
                entities=[model_id.split("/")[0]],
                raw={"model_id": model_id, "trending_score": m.get("trendingScore")},
            )
        )
    return out
