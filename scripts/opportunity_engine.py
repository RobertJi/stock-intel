#!/usr/bin/env python3
"""Generate Market Radar source items, insights, and opportunities from events.

This is the first conservative engine: it reuses the current events table and
creates the new intelligence-layer rows after the Market Radar migration is
applied.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

SYSTEM_SOURCES = {
    "system_sec_8k": {
        "name": "SEC 8-K Filings",
        "description": "Company 8-K filings from SEC EDGAR.",
        "credibility_score": 90,
        "scope": "watchlist",
    },
    "system_form4": {
        "name": "SEC Form 4 Insider Transactions",
        "description": "Insider transaction disclosures from SEC EDGAR.",
        "credibility_score": 85,
        "scope": "watchlist",
    },
    "system_yahoo_news": {
        "name": "Yahoo Finance News",
        "description": "Market and company news from Yahoo Finance search.",
        "credibility_score": 65,
        "scope": "watchlist",
    },
}

EVENT_TO_SOURCE_TYPE = {
    "MARKET_NEWS": "system_yahoo_news",
    "INSIDER_BUY": "system_form4",
    "INSIDER_SELL": "system_form4",
}

EVENT_TO_ITEM_TYPE = {
    "MARKET_NEWS": "news_article",
    "INSIDER_BUY": "form4_transaction",
    "INSIDER_SELL": "form4_transaction",
}

BULLISH_EVENT_TYPES = {
    "INSIDER_BUY",
    "BUYBACK",
    "EARNINGS_BEAT",
    "ANALYST_UPGRADE",
    "MATERIAL_AGREEMENT",
    "ACQUISITION",
    "COST_REDUCTION",
}

BEARISH_EVENT_TYPES = {
    "INSIDER_SELL",
    "ANALYST_DOWNGRADE",
    "AGREEMENT_TERMINATED",
    "BANKRUPTCY",
    "DELISTING",
    "IMPAIRMENT",
    "RESTATEMENT",
}

EVENT_THEMES = {
    "INSIDER_BUY": ["insider buying", "management conviction"],
    "INSIDER_SELL": ["insider selling", "management signal"],
    "MARKET_NEWS": ["market narrative"],
    "MATERIAL_AGREEMENT": ["corporate catalyst"],
    "ACQUISITION": ["m&a"],
    "EARNINGS": ["earnings"],
    "EXECUTIVE_CHANGE": ["management change"],
    "COST_REDUCTION": ["margin improvement"],
    "BANKRUPTCY": ["distress"],
    "DELISTING": ["distress"],
}


def require_env() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise SystemExit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")


def headers(prefer: str | None = None) -> dict[str, str]:
    out = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        out["Prefer"] = prefer
    return out


def rest_get(table: str, query: str = "") -> list[dict[str, Any]]:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}{query}",
        headers=headers(),
        timeout=30,
    )
    if resp.status_code == 404:
        raise RuntimeError(
            f"Table '{table}' is missing. Apply supabase/migrations/001_market_radar.sql first."
        )
    resp.raise_for_status()
    return resp.json()


def rest_post(
    table: str,
    rows: list[dict[str, Any]],
    *,
    on_conflict: str = "",
    return_rows: bool = False,
) -> list[dict[str, Any]]:
    if not rows:
        return []
    prefer = "resolution=merge-duplicates"
    prefer += ",return=representation" if return_rows else ",return=minimal"
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={quote(on_conflict)}"
    resp = requests.post(url, headers=headers(prefer), json=rows, timeout=30)
    if resp.status_code == 404:
        raise RuntimeError(
            f"Table '{table}' is missing. Apply supabase/migrations/001_market_radar.sql first."
        )
    resp.raise_for_status()
    return resp.json() if return_rows and resp.text else []


def content_hash(parts: list[Any]) -> str:
    raw = json.dumps(parts, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def published_at_from_date(date_value: str | None) -> str | None:
    if not date_value:
        return None
    try:
        return datetime.fromisoformat(date_value[:10]).replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def load_recent_events(limit: int) -> list[dict[str, Any]]:
    query = (
        "?select=id,ticker,type,title,date,source,link,impact,description,description_zh,metadata"
        "&order=date.desc&order=id.desc"
        f"&limit={limit}"
    )
    return rest_get("events", query)


def ensure_system_sources() -> dict[str, str]:
    rows = []
    for source_type, config in SYSTEM_SOURCES.items():
        rows.append({
            "source_type": source_type,
            "name": config["name"],
            "description": config["description"],
            "scope": config["scope"],
            "credibility_score": config["credibility_score"],
            "status": "active",
            "metadata": {"managedBy": "opportunity_engine.py"},
        })
    rest_post("intelligence_sources", rows, on_conflict="source_type")
    sources = rest_get(
        "intelligence_sources",
        "?select=id,source_type&source_type=in.(system_sec_8k,system_form4,system_yahoo_news)",
    )
    return {row["source_type"]: row["id"] for row in sources}


def event_source_type(event: dict[str, Any]) -> str:
    event_type = event.get("type") or ""
    if event_type in EVENT_TO_SOURCE_TYPE:
        return EVENT_TO_SOURCE_TYPE[event_type]
    return "system_sec_8k"


def event_item_type(event: dict[str, Any]) -> str:
    event_type = event.get("type") or ""
    if event_type in EVENT_TO_ITEM_TYPE:
        return EVENT_TO_ITEM_TYPE[event_type]
    return "sec_filing"


def event_to_source_item(event: dict[str, Any], source_ids: dict[str, str]) -> dict[str, Any]:
    event_id = event["id"]
    source_type = event_source_type(event)
    ticker = event.get("ticker")
    body = event.get("description") or event.get("description_zh") or ""
    hash_value = content_hash([
        "event",
        event_id,
        ticker,
        event.get("type"),
        event.get("link") or "",
        event.get("title") or "",
        event.get("date") or "",
    ])
    return {
        "source_id": source_ids[source_type],
        "external_id": f"event:{event_id}",
        "item_type": event_item_type(event),
        "title": event.get("title") or "",
        "body": body,
        "url": event.get("link") or None,
        "author": event.get("source") or None,
        "published_at": published_at_from_date(event.get("date")),
        "language": "en",
        "tickers": [ticker] if ticker and ticker != "MARKET" else [],
        "raw_payload": {"event": event},
        "content_hash": hash_value,
    }


def upsert_source_item(row: dict[str, Any]) -> dict[str, Any]:
    result = rest_post("source_items", [row], on_conflict="external_id", return_rows=True)
    if result:
        return result[0]
    external_id = quote(row["external_id"])
    found = rest_get("source_items", f"?select=*&external_id=eq.{external_id}&limit=1")
    if not found:
        raise RuntimeError(f"Could not upsert source item {row['external_id']}")
    return found[0]


def direction_for_event(event: dict[str, Any]) -> str:
    event_type = event.get("type") or ""
    impact = event.get("impact") or "NEUTRAL"
    if impact == "BULLISH" or event_type in BULLISH_EVENT_TYPES:
        return "bullish"
    if impact == "BEARISH" or event_type in BEARISH_EVENT_TYPES:
        return "bearish"
    return "watch"


def sentiment_for_direction(direction: str) -> str:
    if direction == "bullish":
        return "positive"
    if direction == "bearish":
        return "negative"
    return "neutral"


def insight_type_for_event(event: dict[str, Any]) -> str:
    event_type = event.get("type") or ""
    if event_type in ("INSIDER_BUY", "INSIDER_SELL"):
        return "insider_activity"
    if event_type == "MARKET_NEWS":
        return "narrative_signal"
    if event_type == "EXECUTIVE_CHANGE":
        return "management_change"
    if event_type in ("BANKRUPTCY", "DELISTING", "IMPAIRMENT", "RESTATEMENT"):
        return "risk"
    if event_type in ("MATERIAL_AGREEMENT", "ACQUISITION", "COST_REDUCTION"):
        return "catalyst"
    return "corporate_event"


def impact_score_for_event(event: dict[str, Any], direction: str) -> int:
    event_type = event.get("type") or ""
    if event_type == "MARKET_NEWS":
        metadata = event.get("metadata") or {}
        score = 42 + int(metadata.get("newsScore") or 0)
        return min(score, 60)
    if event_type in ("INSIDER_BUY", "INSIDER_SELL"):
        metadata = event.get("metadata") or {}
        value = float(metadata.get("value") or 0)
        if value >= 1_000_000:
            return 72
        if value >= 100_000:
            return 64
        return 56
    if direction in ("bullish", "bearish"):
        return 68
    return 50


def event_themes(event: dict[str, Any]) -> list[str]:
    event_type = event.get("type") or ""
    themes = EVENT_THEMES.get(event_type, [])
    metadata = event.get("metadata") or {}
    scope = metadata.get("newsScope") or metadata.get("newsBucket")
    if scope == "ecosystem":
        themes = [*themes, "ecosystem read-through"]
    return sorted(set(themes))


def event_summary(event: dict[str, Any]) -> str:
    zh = event.get("description_zh") or ""
    desc = event.get("description") or ""
    title = event.get("title") or ""
    return zh or desc or title


def build_insight(event: dict[str, Any], source_item: dict[str, Any]) -> dict[str, Any]:
    direction = direction_for_event(event)
    ticker = event.get("ticker")
    summary = event_summary(event)
    insight_type = insight_type_for_event(event)
    title = f"{ticker}: {event.get('title') or event.get('type')}"
    return {
        "source_item_id": source_item["id"],
        "insight_type": insight_type,
        "title": title[:240],
        "summary": summary[:1200],
        "sentiment": sentiment_for_direction(direction),
        "direction": direction,
        "impact_score": impact_score_for_event(event, direction),
        "confidence": 65 if event.get("type") != "MARKET_NEWS" else 50,
        "time_horizon": "days" if event.get("type") == "MARKET_NEWS" else "weeks",
        "tickers": [ticker] if ticker and ticker != "MARKET" else [],
        "sectors": [],
        "themes": event_themes(event),
        "evidence": [{
            "event_id": event.get("id"),
            "title": event.get("title"),
            "link": event.get("link"),
            "source": event.get("source"),
            "date": event.get("date"),
        }],
        "reasoning": "Rule-based extraction from existing Signal event stream.",
        "risks": default_risks(event, direction),
        "extracted_by": "rule_v1",
        "metadata": {
            "eventId": event.get("id"),
            "eventType": event.get("type"),
            "eventImpact": event.get("impact"),
        },
    }


def default_risks(event: dict[str, Any], direction: str) -> list[str]:
    event_type = event.get("type") or ""
    if event_type == "MARKET_NEWS":
        return ["News may be broad, already priced in, or not financially material."]
    if event_type == "INSIDER_BUY":
        return ["Single insider purchases can be symbolic and may not predict operating results."]
    if event_type == "INSIDER_SELL":
        return ["Insider sales can be routine diversification rather than negative information."]
    if direction == "bullish":
        return ["Catalyst may already be reflected in price or lack follow-through."]
    if direction == "bearish":
        return ["Negative event may be temporary or already discounted."]
    return ["Impact is unclear and needs confirming evidence."]


def upsert_insight(row: dict[str, Any]) -> dict[str, Any]:
    result = rest_post(
        "extracted_insights",
        [row],
        on_conflict="source_item_id,insight_type,title",
        return_rows=True,
    )
    if result:
        return result[0]
    return rest_get(
        "extracted_insights",
        (
            f"?select=*&source_item_id=eq.{row['source_item_id']}"
            f"&insight_type=eq.{quote(row['insight_type'])}"
            f"&title=eq.{quote(row['title'])}&limit=1"
        ),
    )[0]


def score_opportunity(insights: list[dict[str, Any]]) -> dict[str, int]:
    source_quality = 14
    novelty = 11
    relevance = 12
    market_impact = min(20, max(int(i.get("impact_score") or 0) for i in insights) // 4)
    evidence_count = min(10, len(insights) * 3)
    momentum = min(10, max(0, len(insights) - 1) * 3)
    risk_penalty = 5 if len(insights) == 1 else 2
    return {
        "source_quality": source_quality,
        "novelty": novelty,
        "relevance": relevance,
        "market_impact": market_impact,
        "evidence_count": evidence_count,
        "momentum": momentum,
        "risk_penalty": risk_penalty,
    }


def final_score(breakdown: dict[str, int]) -> int:
    score = (
        breakdown["source_quality"]
        + breakdown["novelty"]
        + breakdown["relevance"]
        + breakdown["market_impact"]
        + breakdown["evidence_count"]
        + breakdown["momentum"]
        - breakdown["risk_penalty"]
    )
    return max(0, min(100, score))


def opportunity_signature(ticker: str, direction: str, day: str) -> str:
    return content_hash(["opportunity", ticker, direction, day])[:32]


def build_opportunities(insights: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for insight in insights:
        tickers = insight.get("tickers") or []
        if not tickers:
            continue
        direction = insight.get("direction") or "watch"
        grouped[(tickers[0], direction)].append(insight)

    today = datetime.now(timezone.utc).date().isoformat()
    opportunities = []
    for (ticker, direction), items in grouped.items():
        items.sort(key=lambda row: (row.get("impact_score") or 0, row.get("confidence") or 0), reverse=True)
        top_items = items[:5]
        breakdown = score_opportunity(top_items)
        score = final_score(breakdown)
        if score < 45:
            continue

        if direction == "bullish":
            direction_label = "Bullish"
        elif direction == "bearish":
            direction_label = "Bearish"
        else:
            direction_label = "Radar"
        evidence_chain = []
        catalysts = []
        risks = []
        for item in top_items:
            evidence_chain.append({
                "insight_id": item["id"],
                "title": item["title"],
                "summary": item.get("summary"),
                "impact_score": item.get("impact_score"),
                "confidence": item.get("confidence"),
            })
            if item.get("summary"):
                catalysts.append(str(item["summary"])[:180])
            for risk in item.get("risks") or []:
                if risk not in risks:
                    risks.append(risk)

        opportunity = {
            "title": f"{direction_label} watch: {ticker}",
            "opportunity_type": "ticker",
            "status": "watching",
            "direction": direction,
            "ticker": ticker,
            "score": score,
            "score_breakdown": breakdown,
            "confidence": min(85, 45 + len(top_items) * 8),
            "time_horizon": "days_to_weeks",
            "why_now": top_items[0].get("summary") or top_items[0].get("title"),
            "evidence_chain": evidence_chain,
            "catalysts": catalysts[:5],
            "risks": risks[:5],
            "invalidation_condition": invalidation_for_direction(direction),
            "next_watch_items": next_watch_items(direction),
            "last_reviewed_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "engine": "rule_v1",
                "insightCount": len(top_items),
            },
            "signature": opportunity_signature(ticker, direction, today),
        }
        opportunities.append((opportunity, top_items))
    return opportunities


def invalidation_for_direction(direction: str) -> str:
    if direction == "bullish":
        return "Invalidate if follow-up news, price action, or company filings fail to confirm the catalyst."
    if direction == "watch":
        return "Invalidate if follow-up sources do not confirm materiality or the signal remains broad market noise."
    return "Invalidate if the company provides credible clarification or price action quickly absorbs the negative signal."


def next_watch_items(direction: str) -> list[str]:
    if direction == "bullish":
        return [
            "Check whether follow-up sources confirm the catalyst.",
            "Watch next trading sessions for volume-backed price confirmation.",
            "Look for related sector or supplier read-through.",
        ]
    if direction == "watch":
        return [
            "Check whether the narrative becomes company-specific.",
            "Look for confirming evidence from filings, management commentary, or price/volume action.",
            "Watch if related tickers or sectors start moving together.",
        ]
    return [
        "Check whether the company issues clarification.",
        "Watch for analyst or market reaction in the next trading sessions.",
        "Look for repeated evidence from independent sources.",
    ]


def upsert_opportunity(row: dict[str, Any]) -> dict[str, Any]:
    result = rest_post("opportunities", [row], on_conflict="signature", return_rows=True)
    if result:
        return result[0]
    return rest_get("opportunities", f"?select=*&signature=eq.{quote(row['signature'])}&limit=1")[0]


def link_opportunity_insights(opportunity: dict[str, Any], insights: list[dict[str, Any]]) -> None:
    rows = []
    for index, insight in enumerate(insights):
        rows.append({
            "opportunity_id": opportunity["id"],
            "insight_id": insight["id"],
            "relation": "primary_evidence" if index == 0 else "supporting_evidence",
            "weight": max(10, 80 - index * 10),
        })
    rest_post("opportunity_insights", rows, on_conflict="opportunity_id,insight_id,relation")


def log_sync(status: str, message: str) -> None:
    rest_post(
        "sync_log",
        [{
            "type": "opportunities",
            "status": status,
            "message": message,
            "ran_at": int(time.time()),
        }],
    )


def run(limit: int, dry_run: bool = False) -> dict[str, int]:
    require_env()
    source_ids = (
        {
            "system_sec_8k": "dry-source-sec-8k",
            "system_form4": "dry-source-form4",
            "system_yahoo_news": "dry-source-yahoo-news",
        }
        if dry_run
        else ensure_system_sources()
    )
    events = load_recent_events(limit)
    source_item_count = 0
    insight_rows = []

    for event in events:
        item_row = event_to_source_item(event, source_ids)
        if dry_run:
            source_item = {"id": f"dry:{item_row['external_id']}"}
        else:
            source_item = upsert_source_item(item_row)
        source_item_count += 1
        insight = build_insight(event, source_item)
        if dry_run:
            insight["id"] = f"dry-insight:{event['id']}"
        else:
            insight = upsert_insight(insight)
        insight_rows.append(insight)

    opportunities = build_opportunities(insight_rows)
    opportunity_count = 0
    if not dry_run:
        for opportunity_row, linked_insights in opportunities:
            opportunity = upsert_opportunity(opportunity_row)
            link_opportunity_insights(opportunity, linked_insights)
            opportunity_count += 1
        log_sync("ok", f"Processed {source_item_count} source items, {len(insight_rows)} insights, {opportunity_count} opportunities")
    else:
        opportunity_count = len(opportunities)

    return {
        "events": len(events),
        "source_items": source_item_count,
        "insights": len(insight_rows),
        "opportunities": opportunity_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=120)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        result = run(limit=args.limit, dry_run=args.dry_run)
    except Exception as exc:
        if not args.dry_run:
            try:
                log_sync("error", str(exc))
            except Exception:
                pass
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
