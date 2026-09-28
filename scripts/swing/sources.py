"""热度数据源:ApeWisdom(免费,Reddit 提及排行)+ Adanos(Reddit / X / 新闻,按股票代码)。"""
from __future__ import annotations

import html
import os
import time
from typing import Any

import requests

from ..radar import config  # noqa: F401  加载 .env / .env.local

ADANOS_KEY = os.environ.get("ADANOS_API_KEY", "")
ADANOS_BASE = "https://api.adanos.org"
UA = {"User-Agent": "stock-intel/5.0 (personal research)"}

quota: dict[str, Any] = {"used": 0, "remaining": None}


def apewisdom(max_pages: int = 8) -> list[dict[str, Any]]:
    """ApeWisdom 全部股票的 24h 提及数与 24h 前对比。免费、无需 key,约每 30 分钟更新。"""
    out: list[dict[str, Any]] = []
    page = 1
    while page <= max_pages:
        d = _get_json(f"https://apewisdom.io/api/v1.0/filter/all-stocks/page/{page}")
        for x in d.get("results", []):
            out.append(
                {
                    "ticker": x["ticker"].upper(),
                    "name": html.unescape(x.get("name") or ""),
                    "mentions": _num(x.get("mentions")),
                    "mentions_prev": _num(x.get("mentions_24h_ago")),
                    "upvotes": _num(x.get("upvotes")),
                    "rank": _int(x.get("rank")),
                    "rank_prev": _int(x.get("rank_24h_ago")),
                }
            )
        if page >= int(d.get("pages") or 1):
            break
        page += 1
        time.sleep(0.5)
    return out


def _get_json(url: str, tries: int = 4) -> Any:
    """偶发的连接重置(GitHub Actions 出口)重试几次。"""
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            return r.json()
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError):
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


def adanos_enabled() -> bool:
    return bool(ADANOS_KEY)


def adanos(path: str, **params: Any) -> Any:
    """GET https://api.adanos.org/{path}。记录月度额度,额度不足时抛错让调用方跳过。"""
    if not ADANOS_KEY:
        raise RuntimeError("ADANOS_API_KEY 未配置")
    for attempt in range(3):
        r = requests.get(f"{ADANOS_BASE}/{path}", params=params, headers={"X-API-Key": ADANOS_KEY, **UA}, timeout=30)
        quota["used"] += 1
        rem = r.headers.get("x-ratelimit-remaining-monthly")
        if rem is not None:
            quota["remaining"] = int(rem)
        if r.status_code == 429 and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"adanos {path} {r.status_code}: {r.text[:200]}")
        return r.json()
    raise RuntimeError(f"adanos {path}: rate limited")


def adanos_trending(source: str, limit: int = 100) -> list[dict[str, Any]]:
    """source: reddit | x | news。返回按 buzz 排序的股票列表(含近 7 天 buzz 走势)。"""
    return adanos(f"{source}/stocks/v1/trending", limit=limit, type="stock")


def adanos_stock(source: str, ticker: str, days: int = 30) -> dict[str, Any]:
    """单只股票近 N 天:daily_trend(每日提及/情绪)、top_subreddits 等。"""
    return adanos(f"{source}/stocks/v1/stock/{ticker}", days=days)


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
