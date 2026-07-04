"""Thin Supabase REST wrapper for the radar pipeline."""
from __future__ import annotations

import json
from typing import Any

import requests

from . import config


def _headers(prefer: str | None = None) -> dict[str, str]:
    h = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def require_env() -> None:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_KEY not set")


def get(table: str, query: str = "") -> list[dict[str, Any]]:
    url = f"{config.SUPABASE_URL}/rest/v1/{table}"
    if query:
        url += f"?{query}"
    r = requests.get(url, headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def insert(table: str, rows: list[dict[str, Any]], upsert_on: str | None = None) -> list[dict[str, Any]]:
    if not rows:
        return []
    prefer = "return=representation"
    url = f"{config.SUPABASE_URL}/rest/v1/{table}"
    if upsert_on:
        prefer += ",resolution=ignore-duplicates"
        url += f"?on_conflict={upsert_on}"
    r = requests.post(url, headers=_headers(prefer), data=json.dumps(rows), timeout=30)
    r.raise_for_status()
    return r.json() if r.text else []


def update(table: str, query: str, patch: dict[str, Any]) -> list[dict[str, Any]]:
    url = f"{config.SUPABASE_URL}/rest/v1/{table}?{query}"
    r = requests.patch(url, headers=_headers("return=representation"), data=json.dumps(patch), timeout=30)
    r.raise_for_status()
    return r.json() if r.text else []
