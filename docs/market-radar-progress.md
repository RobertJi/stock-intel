# Signal Market Radar Progress

Last updated: 2026-05-15 13:35 UTC

This document tracks implementation progress for the Market Radar work described in docs/market-radar-design.md.

## Current Status

Implementation is currently in MVP 1: Data Foundation.

The core intelligence pipeline has been created and tested once against production Signal data:

events -> source_items -> extracted_insights -> opportunities

The first real run processed existing Signal events into the new intelligence layer:

- 160 source_items
- 160 extracted_insights
- 3 opportunities
- 15 opportunity_insights

The first visible UI slice has been added. The homepage now shows Today's Opportunities above the existing watchlist and events/news surface.

## Completed Work

### 1. Product Design

Status: completed

File:

- docs/market-radar-design.md

Commit:

- d0f2287 docs: add market radar design

Completed:

- Defined Signal's positioning as a personal market intelligence OS.
- Defined the intelligence pipeline.
- Defined system, user-configured, and manual thesis source types.
- Defined core data entities and MVP sequence.
- Defined UI direction for homepage radar and opportunity detail pages.

### 2. Database Foundation

Status: completed

File:

- supabase/migrations/001_market_radar.sql

Commit:

- 1797a6c feat: add market radar engine foundation

Production database:

- Applied to Signal Supabase project nnexdhkvmizarpzychex.

Tables added:

- intelligence_sources
- source_items
- extracted_insights
- themes
- theme_signals
- opportunities
- opportunity_insights
- signal_outcomes

Notes:

- The migration only adds new tables, indexes, read policies, and relationships.
- It does not alter existing watchlist, stocks, events, or sync_log tables.
- Existing product behavior remains unchanged.

### 3. Opportunity Engine Foundation

Status: completed

Files:

- scripts/opportunity_engine.py
- scripts/sync_db.py
- .github/workflows/sync.yml

Commit:

- 1797a6c feat: add market radar engine foundation

Completed:

- Added a first rule-based Market Radar engine.
- Added system source registration for SEC 8-K, SEC Form 4, and Yahoo Finance news.
- Added conversion from existing events rows into source_items.
- Added rule-based extraction from events into extracted_insights.
- Added opportunity generation grouped by ticker and direction.
- Added score breakdown fields: source_quality, novelty, relevance, market_impact, evidence_count, momentum, risk_penalty.
- Added opportunity_insights links from opportunities back to supporting insights.
- Added manual sync modes: opportunities and radar.

Important behavior:

- opportunities is currently a manual sync mode.
- It is not included in all yet.
- It is not included in scheduled GitHub Actions yet.
- This is intentional, to avoid automatic production writes before the output quality is reviewed.

### 4. Production Data Run

Status: completed

Date:

- 2026-05-15

Command:

- python scripts/sync_db.py opportunities

Result:

- 160 source_items
- 160 extracted_insights
- 3 opportunities
- 15 opportunity_insights

Generated opportunities:

- Radar watch: NVDA, score 66, confidence 85
- Radar watch: META, score 66, confidence 85
- Radar watch: NFLX, score 66, confidence 85

Interpretation:

- These are observation opportunities, not buy/sell calls.
- The first engine intentionally promotes worth-watching situations from noisy event/news flow.
- Bullish and bearish opportunities will become more meaningful after better extraction, theme linking, and source weighting are added.

## Verification Performed

Passed:

- python3 -m py_compile scripts/opportunity_engine.py scripts/sync_db.py
- python3 scripts/opportunity_engine.py --dry-run --limit 160
- npm run build
- git diff --check

Production table counts after real sync:

- intelligence_sources: 3
- source_items: 160
- extracted_insights: 160
- opportunities: 3
- opportunity_insights: 15

## Known Issues And Lessons

### Supabase Project Ref

Issue:

- Workspace notes originally only had the Tarot Universe Supabase project ref.
- Signal uses a different Supabase project.

Correct Signal project:

- nnexdhkvmizarpzychex

Action taken:

- Added Stock Intel / Signal project ref to workspace TOOLS.md.
- Logged the mistake in workspace .learnings/ERRORS.md.

Rule going forward:

- Before any Supabase schema or data operation, derive the project ref from the target repo's .env / .env.local.
- Do not reuse project refs from another project.

### Engine Quality

Current limitation:

- The first opportunity engine is rule-based and simple.
- Most generated opportunities are watch, not directional investment calls.
- themes exists, but theme_signals is not actively populated yet.
- signal_outcomes exists, but outcome measurement is not implemented yet.

Why this is acceptable for this stage:

- MVP 1 is about creating the data foundation and proving the pipeline works.
- Quality should improve after UI review, theme linking, and outcome feedback are added.

## MVP Progress

### MVP 1: Data Foundation

Status: in progress, core pipeline working

Completed:

- Design doc
- Database migration
- Production migration applied
- Existing events converted to source_items
- Rule-based insights generated
- First opportunities generated
- Manual sync mode added
- Build and dry-run verified

Remaining:

- Add real theme linking into theme_signals.
- Add first outcome measurement script for signal_outcomes.
- Review opportunity quality and scoring thresholds.
- Decide when to add opportunities to scheduled GitHub Actions.

### MVP 2: Radar UI

Status: first visible slice completed

Completed:

- Added getOpportunities() to src/lib/db.ts.
- Added fetchOpportunities() to src/lib/server-data.ts.
- Added src/components/OpportunityRadar.tsx.
- Added Today's Opportunities above the existing watchlist on the homepage.
- Verified desktop and mobile rendering locally.

Current UI scope:

- Show opportunity title, ticker, direction, score, confidence, why_now, top evidence, and main risk.
- Keep current Watchlist and Events & News sections below it.
- Do not redesign the entire app yet.

Suggested files:

- src/lib/db.ts
- src/lib/server-data.ts
- src/components/OpportunityRadar.tsx
- src/app/page.tsx

Remaining:

- Add opportunity detail page.
- Add clickable drill-down from each opportunity to evidence.
- Add theme-level opportunities once theme_signals is populated.
- Improve wording once the engine generates stronger directional opportunities.

### MVP 3: Manual Thesis

Status: not started

Planned scope:

- Let user create a theme/thesis manually.
- Convert thesis into keywords, seed tickers, evidence needs, and invalidation conditions.
- Link future insights to the thesis.

### MVP 4: Website/RSS Sources

Status: not started

Planned scope:

- Add source management UI.
- Add RSS ingestion.
- Add basic website RSS discovery.

### MVP 5: X Sources

Status: not started

Planned scope:

- Start with manual tweet/thread paste.
- Add automated account/list monitoring later.

## Recommended Next Step

Build the next MVP 2 slice:

1. Add an opportunity detail page.
2. Link opportunity cards to the detail page.
3. Show evidence_chain, score_breakdown, risks, invalidation_condition, and next_watch_items.
4. Add a basic outcome placeholder section.

Why this next:

- The homepage now proves the radar surface.
- The next value is inspectability: the user should be able to open an opportunity and see why it exists.
