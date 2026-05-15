# Signal Market Radar Design

Last updated: 2026-05-15

## 1. Product Direction

Signal should evolve from a stock news and event dashboard into a market opportunity radar.

The product is not trying to be another feed reader. The core job is to turn fragmented market information into structured, comparable, and auditable investment signals.

The product loop is:

1. Collect intelligence from multiple source types.
2. Normalize raw content into one common item layer.
3. Extract structured insights from each item.
4. Link insights to themes, sectors, and tickers.
5. Generate opportunities only when the evidence is strong enough.
6. Track outcomes and invalidation conditions so the system can learn which signals worked.

This matters because the input layer will become messy quickly. SEC filings, Form 4 transactions, Yahoo news, X accounts, niche websites, RSS feeds, and user-written theses all have different shapes. The system needs one common intelligence pipeline instead of one-off logic for every source.

## 2. Product Positioning

Signal is a personal market intelligence OS.

It should help Robert answer:

- What market opportunities are emerging today?
- Which themes are warming up before they become obvious?
- Which tickers, sectors, or ETFs are connected to those themes?
- What evidence supports this opportunity?
- What evidence weakens or invalidates it?
- What should be watched next?
- Did yesterday's opportunity actually work?

The product should feel closer to a living investment memo system than a news list.

## 3. Core Principles

### Keep Raw Content Separate From Judgement

Never collapse source content, AI extraction, and final opportunity judgement into one row.

Each layer has a different job:

- Raw item: what was observed.
- Extracted insight: what the system thinks the item means.
- Theme mapping: what broader idea the insight belongs to.
- Opportunity: what may be actionable.
- Outcome: whether the opportunity later proved useful.

This separation makes the system debuggable. If an opportunity is bad, we can inspect whether the raw source was bad, the extraction was wrong, the theme mapping was weak, or the scoring logic overreacted.

### Make Every Score Auditable

Opportunity scores should not be black-box AI numbers.

Every score must be explainable through component dimensions:

- Source quality
- Novelty
- Relevance
- Market impact
- Evidence count
- Momentum
- Risk penalty

The final score can be a 0-100 number, but the UI must let the user see why the number exists.

### Support Both Discovery And User-Led Research

Signal should discover opportunities from the market, but it should also let the user ask the system to watch a thesis.

Example:

> I want to track humanoid robotics, especially Tesla Optimus suppliers.

The system should transform that into a durable research object:

- Theme names
- Seed tickers
- Keywords
- Related sectors
- Evidence needed
- Invalidation conditions
- Sources to monitor

This is the key product difference. The user is not just passively consuming news. He is maintaining market hypotheses and asking Signal to continuously search for supporting and contradicting evidence.

### Treat Contradiction As A First-Class Feature

The system must avoid only confirming the user's thesis.

Every thesis and opportunity should have:

- Supporting evidence
- Weakening evidence
- Invalidation condition
- Risk notes
- Last reviewed time

If a thesis is losing evidence, the product should say so plainly.

## 4. Intelligence Source Types

Signal should support three source categories.

### System Sources

These are built into the product and maintained by the app.

Initial system sources:

- Watchlist tickers
- Stock prices from yfinance
- SEC 8-K filings
- Form 4 insider transactions
- Yahoo Finance news
- Existing translated event summaries

Future system sources:

- Earnings calendar
- Analyst changes
- ETF and sector performance
- Macro calendar
- Options activity
- Short interest
- GitHub or technical adoption signals for software companies

### User-Configured Sources

These are sources Robert adds manually.

Initial user source types:

- Website or RSS feed
- Keyword query
- Manually pasted article
- Manually pasted tweet or X thread

Future user source types:

- X account monitoring
- X list monitoring
- YouTube channel monitoring
- Email/newsletter ingestion
- PDF/report upload
- Notion page ingestion

X should not block the first version. API access is expensive and fragile. The first version should reserve the data model and allow pasted tweet/text ingestion before automating account monitoring.

### Manual Thesis Sources

Manual theses are not ordinary content sources. They are research instructions created by the user.

Examples:

- Humanoid robotics supply chain
- Nuclear power revival
- AI data center power demand
- GLP-1 second-order impacts
- Japan defense spending
- Copper shortage

Each manual thesis should produce a structured tracking plan:

- Primary theme
- Alternate names
- Keywords
- Seed tickers
- Related sectors
- Relevant source types
- Evidence needed
- Invalidation condition
- Monitoring frequency
- Priority

## 5. Data Model

The first schema should add a new intelligence layer beside the existing watchlist, stocks, events, and sync_log tables.

### intelligence_sources

Stores each configured source.

Suggested columns:

- id
- name
- source_type
- status
- url
- handle
- query
- description
- scope
- priority
- credibility_score
- polling_interval_minutes
- last_checked_at
- metadata
- created_at
- updated_at

Source type examples:

- system_sec_8k
- system_form4
- system_yahoo_news
- website
- rss
- x_account
- x_list
- manual_text
- manual_thesis
- keyword

Scope examples:

- global
- watchlist
- ticker
- sector
- theme
- macro

### source_items

Stores raw content from any source.

Suggested columns:

- id
- source_id
- external_id
- item_type
- title
- body
- url
- author
- published_at
- collected_at
- language
- tickers
- raw_payload
- content_hash
- created_at

Item type examples:

- sec_filing
- form4_transaction
- news_article
- rss_article
- tweet
- manual_note
- thesis_seed
- webpage

Important rule: this table preserves the original observable object. Do not overwrite or summarize away the raw content.

### extracted_insights

Stores AI or rules-based extraction from source_items.

Suggested columns:

- id
- source_item_id
- insight_type
- title
- summary
- sentiment
- direction
- impact_score
- confidence
- time_horizon
- tickers
- sectors
- themes
- evidence
- reasoning
- risks
- extracted_by
- extracted_at
- metadata

Insight type examples:

- catalyst
- risk
- insider_activity
- management_change
- demand_signal
- supply_signal
- regulatory_signal
- financing_signal
- earnings_signal
- product_signal
- narrative_signal

Sentiment examples:

- positive
- negative
- mixed
- neutral

Direction examples:

- bullish
- bearish
- watch
- unknown

### themes

Stores durable market themes.

Suggested columns:

- id
- slug
- name
- description
- status
- origin
- priority
- parent_theme_id
- keywords
- seed_tickers
- related_tickers
- related_sectors
- invalidation_condition
- metadata
- created_at
- updated_at

Origin examples:

- system_discovered
- user_manual
- ai_suggested

Status examples:

- active
- watching
- cooled
- invalidated
- archived

### theme_signals

Links insights to themes.

Suggested columns:

- id
- theme_id
- insight_id
- relation
- strength
- rationale
- created_at

Relation examples:

- supports
- weakens
- contradicts
- related

### opportunities

Stores generated market opportunities.

Suggested columns:

- id
- title
- opportunity_type
- status
- direction
- ticker
- sector
- theme_id
- score
- score_breakdown
- confidence
- time_horizon
- why_now
- evidence_chain
- catalysts
- risks
- invalidation_condition
- next_watch_items
- generated_at
- last_reviewed_at
- expires_at
- metadata

Opportunity type examples:

- ticker
- sector
- theme
- pair_trade
- macro

Status examples:

- watching
- active
- cooled
- invalidated
- closed

### opportunity_insights

Links opportunities to their supporting or weakening insights.

Suggested columns:

- id
- opportunity_id
- insight_id
- relation
- weight
- created_at

Relation examples:

- primary_evidence
- supporting_evidence
- weakening_evidence
- risk_evidence

### signal_outcomes

Stores later outcome tracking.

Suggested columns:

- id
- opportunity_id
- measured_at
- horizon
- ticker
- start_price
- current_price
- return_pct
- benchmark_return_pct
- outcome_label
- notes
- metadata

Outcome labels:

- worked
- failed
- inconclusive
- still_open

This table is important for long-term learning. Without outcomes, Signal becomes a confident narrative machine instead of a self-correcting system.

## 6. Processing Pipeline

### Stage 1: Collect

Input sources produce source_items.

Existing events can be backfilled into source_items:

- SEC 8-K event -> source_item item_type = sec_filing
- Form 4 event -> source_item item_type = form4_transaction
- Yahoo news event -> source_item item_type = news_article

New website/RSS/X/manual inputs should also land in source_items.

### Stage 2: Extract

Each source_item is converted into one or more extracted_insights.

For the first version, extraction can combine rules and LLM output.

Rules are useful for known event types:

- INSIDER_BUY -> insider_activity, bullish direction
- INSIDER_SELL -> insider_activity, bearish or neutral depending on size and context
- MARKET_NEWS -> narrative_signal or catalyst
- SEC 8-K -> catalyst/risk/management_change depending on event type

LLM extraction is useful for:

- Summary
- Theme detection
- Risk detection
- Time horizon
- Market impact explanation
- Contradiction detection

### Stage 3: Link To Themes

Insights are linked to existing themes when possible.

Matching signals:

- Explicit theme tags from the LLM
- Keyword match
- Related ticker match
- Sector match
- Manual thesis keywords

When no theme exists, the engine can either:

- Leave the insight unthemed
- Suggest a new theme
- Attach it only to the ticker

For MVP, avoid fully automatic theme creation unless confidence is high. Suggested themes can be reviewed later.

### Stage 4: Generate Opportunities

The opportunity engine groups recent insights by:

- Ticker
- Theme
- Sector
- Direction
- Time horizon

It then decides whether a group is strong enough to become an opportunity.

Initial opportunity threshold:

- At least one high-impact insight, or
- Multiple medium-impact insights within a short window, or
- A user thesis receives new supporting or weakening evidence, or
- A price move aligns with a fresh catalyst

### Stage 5: Score

Initial score breakdown:

- source_quality: 0-20
- novelty: 0-15
- relevance: 0-15
- market_impact: 0-20
- evidence_count: 0-10
- momentum: 0-10
- risk_penalty: 0 to -20

Suggested formula:

score = source_quality + novelty + relevance + market_impact + evidence_count + momentum - risk_penalty

Then clamp to 0-100.

Risk penalty should increase when:

- Evidence is single-source and weak
- The source is low credibility
- The claim is speculative
- Price has already moved too far
- The event has unclear financial impact
- There is direct contradicting evidence

### Stage 6: Review Outcomes

For ticker opportunities, the system should measure returns at:

- 1 day
- 3 days
- 1 week
- 1 month

Outcome tracking should compare against:

- The ticker's own starting price
- SPY or QQQ
- Sector ETF where available

This will later help tune source quality and scoring weights.

## 7. Manual Thesis Flow

Manual Thesis should be the first differentiating feature after the core schema is in place.

### User Input

The user enters:

> I want to follow humanoid robotics, especially Tesla Optimus suppliers.

### System Transformation

Signal creates or updates a theme:

- name: Humanoid Robotics
- aliases: Tesla Optimus, robotics supply chain, humanoid robots
- seed tickers: TSLA, NVDA, possible suppliers
- keywords: Optimus, humanoid, actuator, servo, robotics supplier, robot hand, embodied AI
- sectors: autos, semiconductors, industrial automation
- evidence needed: supplier wins, capex, customer contracts, production milestones, margin impact
- invalidation condition: no commercial orders, delayed production, weak supplier revenue read-through, hype without financial confirmation

### Daily Monitoring

Every sync cycle:

1. Fetch new system and user source items.
2. Extract insights.
3. Check whether insights support, weaken, or relate to the thesis.
4. Generate thesis update.
5. Promote to opportunity only if evidence passes the score threshold.

### UI Output

Each thesis page should show:

- Current thesis status
- Supporting evidence
- Weakening evidence
- Relevant tickers
- Recent source items
- Open questions
- Invalidation condition
- Opportunities generated from the thesis

## 8. Website And RSS Flow

Website/RSS should come after Manual Thesis.

### MVP Support

The first version should support:

- Add RSS URL
- Add website URL and try to detect RSS
- Poll new articles
- Store raw article in source_items
- Extract insights from article title and summary

Avoid complex browser scraping in MVP. It will create reliability problems early.

### Later Support

Later versions can add:

- Full article extraction
- JavaScript-rendered pages
- Paywall-aware manual clipping
- Site-specific parsing rules
- Source health monitoring

## 9. X Account Flow

X is valuable but should not block the product.

### Phase 1

Support manual paste:

- Tweet URL
- Tweet text
- X thread text

Store as source_item with item_type = tweet or manual_note.

### Phase 2

Support third-party X data provider or scraping service.

### Phase 3

Support account and list monitoring:

- Account source
- List source
- Keyword source
- Deduped tweet ingestion
- Author credibility scoring

The data model should be ready for X from the start, but implementation should wait until core value is proven.

## 10. UI Direction

The homepage should shift from a watchlist/news dashboard to a market radar.

Priority sections:

1. Today's Opportunities
2. Heating Themes
3. My Theses
4. New Evidence
5. Risk And Invalidation Alerts
6. Yesterday's Outcome Review

The old events feed can remain, but it should become a supporting view rather than the primary product surface.

### Opportunity Card

Each opportunity card should show:

- Title
- Direction
- Ticker/theme/sector
- Score
- Time horizon
- Why now
- Top evidence
- Main risk
- Status

### Opportunity Detail Page

The detail page should read like an investment memo:

- Conclusion
- Target ticker/theme/sector
- Why now
- Evidence chain
- Related source items
- Catalysts
- Risks
- Invalidation condition
- Next watch items
- Outcome history

## 11. MVP Implementation Plan

### MVP 1: Data Foundation

Goal: create the shared intelligence pipeline without changing the full UI yet.

Deliverables:

- Add database migration for intelligence_sources, source_items, extracted_insights, themes, theme_signals, opportunities, opportunity_insights, signal_outcomes.
- Add source backfill script that converts existing events into source_items.
- Add extraction script for basic insights from existing event rows.
- Add opportunity engine script that creates first opportunities from extracted insights.
- Add sync_db entrypoint so opportunity generation can run after events/news/form4.

Success criteria:

- Existing events continue to work.
- New tables can be populated from existing data.
- At least a few opportunities are generated from current watchlist data.
- Each opportunity has score_breakdown and evidence_chain.

### MVP 2: Radar UI

Goal: show opportunities as the main surface.

Deliverables:

- Add getOpportunities data access function.
- Add Today's Opportunities section to homepage.
- Add Heating Themes section.
- Add opportunity detail page.
- Keep existing Events & News below the radar sections.

Success criteria:

- Homepage immediately answers what matters today.
- User can open an opportunity and inspect why it exists.
- Evidence links back to source items or existing event links.

### MVP 3: Manual Thesis

Goal: let the user create a research hypothesis.

Deliverables:

- Add thesis creation UI.
- Store thesis as a user_manual theme plus source record.
- Generate keywords, seed tickers, evidence_needed, and invalidation_condition.
- Link future insights to the thesis.
- Show thesis page.

Success criteria:

- User can enter a topic like humanoid robotics.
- Signal tracks new evidence for or against it.
- Opportunities can be generated from thesis evidence.

### MVP 4: Website/RSS

Goal: let user add outside sources.

Deliverables:

- Add source management UI.
- Add RSS ingestion.
- Add basic website RSS discovery.
- Add source health and last checked state.

Success criteria:

- User can add a site or feed.
- New articles become source_items.
- Extracted insights flow into existing themes and opportunities.

### MVP 5: X

Goal: support social intelligence after core product works.

Deliverables:

- Manual tweet/thread ingestion.
- Later automated account/list monitoring.
- Author credibility scoring.
- Social momentum component.

Success criteria:

- X data enters the same source_items and extracted_insights pipeline.
- The opportunity engine does not need special-case X logic.

## 12. Initial Engineering Notes

### Existing Project

Current repo:

- Path: /home/claw/dev/stock-intel/app
- App: signals.robertji.com
- Stack: Next.js + Supabase + Python sync scripts
- Existing tables inferred from code: watchlist, stocks, events, sync_log
- Existing sync entrypoint: scripts/sync_db.py

### Suggested File Additions

Near-term files:

- docs/market-radar-design.md
- supabase/migrations/001_market_radar.sql
- scripts/opportunity_engine.py
- scripts/backfill_source_items.py
- src/lib/opportunities.ts
- src/components/OpportunityRadar.tsx
- src/app/opportunity/[id]/page.tsx

### Integration Strategy

Do not rewrite the existing event system immediately.

Instead:

1. Keep events as the current UI-compatible event layer.
2. Mirror or backfill events into source_items.
3. Generate insights and opportunities from source_items.
4. Gradually move the homepage toward opportunities.
5. Keep Events & News available as evidence and debugging context.

This reduces risk because existing watchlist and event UI remain functional while the new radar layer is built.

## 13. Open Decisions

These can be decided during implementation:

- Whether to use Supabase migrations folder or plain SQL docs first.
- Whether themes should be globally unique or user-scoped from day one.
- Whether opportunities should be generated synchronously during sync_db.py or as a separate scheduled job.
- Which model to use for extraction: cheap model for routine extraction, stronger model for thesis creation and memo generation.
- Whether to use pgvector later for theme/source semantic matching.

Initial recommendation:

- Keep v1 single-user and simple.
- Use JSONB fields where flexibility matters.
- Avoid pgvector in the first migration.
- Run opportunity generation as a separate mode in sync_db.py, for example python scripts/sync_db.py opportunities.
- Add it to the scheduled workflow only after manual runs look stable.

## 14. Near-Term Build Order

Recommended next build sequence:

1. Add SQL migration for the new intelligence tables.
2. Add event-to-source_item backfill.
3. Add basic rule-based insight extraction from existing events.
4. Add opportunity scoring and generation.
5. Add read API/data access for opportunities.
6. Add homepage radar section.
7. Add manual thesis creation.

This order gives us a working opportunity layer before touching harder source ingestion.

