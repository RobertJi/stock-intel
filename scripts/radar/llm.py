"""LLM chat helper with strict-JSON output. Supports Replicate and OpenRouter."""
from __future__ import annotations

import json
import re
import time
from typing import Any

import requests

from . import config


def chat_json(model: str, system: str, user: str, max_tokens: int = 4000, retries: int = 2) -> Any:
    """Call the configured provider and parse a JSON object/array from the reply."""
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            if config.LLM_PROVIDER == "replicate":
                text = _replicate_chat(model, system, user, max_tokens)
            else:
                text = _openrouter_chat(model, system, user, max_tokens)
            return _extract_json(text)
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


def _replicate_chat(model: str, system: str, user: str, max_tokens: int) -> str:
    headers = {
        "Authorization": f"Bearer {config.REPLICATE_API_TOKEN}",
        "Content-Type": "application/json",
        "Prefer": "wait=60",
    }
    r = requests.post(
        f"https://api.replicate.com/v1/models/{model}/predictions",
        headers=headers,
        json={"input": {"prompt": user, "system_prompt": system, "max_tokens": max(max_tokens, 1024)}},
        timeout=90,
    )
    if not r.ok:
        raise RuntimeError(f"Replicate HTTP {r.status_code}: {r.text[:500]}")
    pred = r.json()
    deadline = time.time() + 180
    while pred.get("status") in ("starting", "processing"):
        if time.time() > deadline:
            raise RuntimeError("Replicate prediction timed out")
        time.sleep(2)
        pr = requests.get(pred["urls"]["get"], headers=headers, timeout=30)
        pr.raise_for_status()
        pred = pr.json()
    if pred.get("status") != "succeeded":
        raise RuntimeError(f"Replicate prediction {pred.get('status')}: {str(pred.get('error'))[:300]}")
    output = pred.get("output")
    return "".join(output) if isinstance(output, list) else str(output or "")


def _openrouter_chat(model: str, system: str, user: str, max_tokens: int) -> str:
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
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
    if not r.ok:
        raise RuntimeError(f"OpenRouter HTTP {r.status_code}: {r.text[:500]}")
    return r.json()["choices"][0]["message"]["content"]


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
