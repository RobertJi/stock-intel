"""OpenRouter chat helper with strict-JSON output."""
from __future__ import annotations

import json
import re
import time
from typing import Any

import requests

from . import config


def chat_json(model: str, system: str, user: str, max_tokens: int = 4000, retries: int = 2) -> Any:
    """Call an OpenRouter model and parse a JSON object/array from the reply."""
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(
                f"{config.OPENROUTER_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.OPENROUTER_API_KEY}"},
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": 0.2,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
                timeout=120,
            )
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            return _extract_json(text)
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


def _extract_json(text: str) -> Any:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start_candidates = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not start_candidates:
        raise ValueError(f"no JSON in LLM reply: {text[:200]}")
    start = min(start_candidates)
    return json.loads(text[start:])
