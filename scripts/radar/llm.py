"""LLM chat helper with strict-JSON output and provider failover.

Providers are tried in config.LLM_PROVIDERS order (DeepSeek → OpenRouter → Replicate by
default, only those with a key configured). A provider that answers 402 / 401 is skipped
for the rest of the run, so one exhausted account can no longer take the pipeline down.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

import requests

from . import config

# 本次运行的用量统计,run.py 会写入 pipeline_runs
USAGE: dict[str, dict[str, float]] = {}
# 本次运行中已判定不可用(余额不足/鉴权失败)的通道
_DEAD: set[str] = set()

# 美元 / 百万 token(按高峰价估算上限),仅用于成本展示
_PRICE = {
    "deepseek": (0.30, 1.20),
    "openrouter": (1.0, 5.0),
    "replicate": (1.0, 5.0),
}


class ProviderDown(RuntimeError):
    """Non-retryable provider failure (no credit, bad key)."""


def chat_json(model: str, system: str, user: str, max_tokens: int = 4000, retries: int = 1) -> Any:
    """Call the first healthy provider and parse a JSON object/array from the reply.

    `model` is a tier ("triage" / "reason"); any other value is passed through as an
    explicit model id for the primary provider.
    """
    providers = [p for p in config.LLM_PROVIDERS if p not in _DEAD]
    if not providers:
        raise RuntimeError("no LLM provider available (set DEEPSEEK_API_KEY)")
    errors: list[str] = []
    for provider in providers:
        model_id = _resolve_model(provider, model)
        for attempt in range(retries + 1):
            try:
                text = _call(provider, model_id, model, system, user, max_tokens)
                return _extract_json(text)
            except ProviderDown as e:
                _DEAD.add(provider)
                _bump(provider, failures=1)
                errors.append(f"{provider}: {e}")
                print(f"  llm: {provider} unavailable, failing over ({e})")
                break
            except Exception as e:  # noqa: BLE001
                _bump(provider, failures=1)
                errors.append(f"{provider}#{attempt}: {e}")
                time.sleep(2 * (attempt + 1))
    raise RuntimeError("LLM call failed on all providers: " + " | ".join(errors)[:800])


def usage_summary() -> dict[str, Any]:
    total = 0.0
    for provider, u in USAGE.items():
        pin, pout = _PRICE.get(provider, (1.0, 5.0))
        u["est_usd"] = round(u.get("prompt_tokens", 0) / 1e6 * pin + u.get("completion_tokens", 0) / 1e6 * pout, 4)
        total += u["est_usd"]
    return {"providers": USAGE, "est_usd": round(total, 4), "dead": sorted(_DEAD)}


def _resolve_model(provider: str, tier: str) -> str:
    triage, reason = config.PROVIDER_MODELS.get(provider, (tier, tier))
    if tier == config.TRIAGE_MODEL:
        return triage
    if tier == config.REASON_MODEL:
        return reason
    return tier


def _bump(provider: str, **kv: float) -> None:
    u = USAGE.setdefault(provider, {"calls": 0, "failures": 0, "prompt_tokens": 0, "completion_tokens": 0})
    for k, v in kv.items():
        u[k] = u.get(k, 0) + v


def _check(r: requests.Response, provider: str) -> None:
    if r.ok:
        return
    body = r.text[:400]
    if r.status_code in (401, 402, 403) or "insufficient" in body.lower() or "balance" in body.lower():
        raise ProviderDown(f"HTTP {r.status_code}: {body}")
    raise RuntimeError(f"{provider} HTTP {r.status_code}: {body}")


def _call(provider: str, model_id: str, tier: str, system: str, user: str, max_tokens: int) -> str:
    if provider == "deepseek":
        return _openai_compatible(
            provider,
            f"{config.DEEPSEEK_BASE_URL}/chat/completions",
            config.DEEPSEEK_API_KEY,
            model_id,
            system,
            user,
            max_tokens,
            # 分诊不需要思考链:关掉省钱省时;推理保留思考,并给思考留出预算
            extra={"thinking": {"type": "disabled"}} if tier == config.TRIAGE_MODEL else {},
            thinking_budget=0 if tier == config.TRIAGE_MODEL else 16000,
        )
    if provider == "openrouter":
        return _openai_compatible(
            provider,
            f"{config.OPENROUTER_BASE_URL}/chat/completions",
            config.OPENROUTER_API_KEY,
            model_id,
            system,
            user,
            max_tokens,
        )
    if provider == "replicate":
        return _replicate_chat(model_id, system, user, max_tokens)
    raise RuntimeError(f"unknown provider {provider}")


def _openai_compatible(
    provider: str,
    url: str,
    key: str,
    model_id: str,
    system: str,
    user: str,
    max_tokens: int,
    extra: dict[str, Any] | None = None,
    thinking_budget: int = 0,
) -> str:
    payload: dict[str, Any] = {
        "model": model_id,
        "max_tokens": max_tokens + thinking_budget,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        **(extra or {}),
    }
    r = requests.post(url, headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=240)
    _check(r, provider)
    data = r.json()
    usage = data.get("usage") or {}
    _bump(
        provider,
        calls=1,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
    )
    content = data["choices"][0]["message"].get("content") or ""
    if not content.strip():
        raise RuntimeError(f"{provider} returned empty content (finish={data['choices'][0].get('finish_reason')})")
    return content


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
    _check(r, "replicate")
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
    _bump("replicate", calls=1)
    output = pred.get("output")
    return "".join(output) if isinstance(output, list) else str(output or "")


def _extract_json(text: str) -> Any:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start_candidates = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not start_candidates:
        raise ValueError(f"no JSON in LLM reply: {text[:200]}")
    # raw_decode 容忍 JSON 之后的多余文字
    obj, _ = json.JSONDecoder().raw_decode(text[min(start_candidates):])
    return obj
