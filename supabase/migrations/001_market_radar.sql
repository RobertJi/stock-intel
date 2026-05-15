-- Market Radar intelligence layer.
-- Apply this migration before running: python scripts/sync_db.py opportunities

create extension if not exists pgcrypto;

create table if not exists public.intelligence_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null,
  status text not null default 'active',
  url text,
  handle text,
  query text,
  description text,
  scope text not null default 'global',
  priority integer not null default 50,
  credibility_score integer not null default 70,
  polling_interval_minutes integer,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intelligence_sources_source_type_key unique (source_type)
);

create table if not exists public.source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.intelligence_sources(id) on delete set null,
  external_id text,
  item_type text not null,
  title text,
  body text,
  url text,
  author text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  language text not null default 'en',
  tickers text[] not null default '{}'::text[],
  raw_payload jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint source_items_external_id_key unique (external_id),
  constraint source_items_content_hash_key unique (content_hash)
);

create table if not exists public.extracted_insights (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items(id) on delete cascade,
  insight_type text not null,
  title text not null,
  summary text,
  sentiment text not null default 'neutral',
  direction text not null default 'watch',
  impact_score integer not null default 50,
  confidence integer not null default 50,
  time_horizon text not null default 'days',
  tickers text[] not null default '{}'::text[],
  sectors text[] not null default '{}'::text[],
  themes text[] not null default '{}'::text[],
  evidence jsonb not null default '[]'::jsonb,
  reasoning text,
  risks text[] not null default '{}'::text[],
  extracted_by text not null default 'rule_v1',
  extracted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint extracted_insights_unique_item_type_title unique (source_item_id, insight_type, title)
);

create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'watching',
  origin text not null default 'system_discovered',
  priority integer not null default 50,
  parent_theme_id uuid references public.themes(id) on delete set null,
  keywords text[] not null default '{}'::text[],
  seed_tickers text[] not null default '{}'::text[],
  related_tickers text[] not null default '{}'::text[],
  related_sectors text[] not null default '{}'::text[],
  invalidation_condition text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.theme_signals (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  insight_id uuid not null references public.extracted_insights(id) on delete cascade,
  relation text not null default 'related',
  strength integer not null default 50,
  rationale text,
  created_at timestamptz not null default now(),
  constraint theme_signals_theme_insight_key unique (theme_id, insight_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  opportunity_type text not null default 'ticker',
  status text not null default 'watching',
  direction text not null default 'watch',
  ticker text,
  sector text,
  theme_id uuid references public.themes(id) on delete set null,
  score integer not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  confidence integer not null default 50,
  time_horizon text not null default 'days',
  why_now text,
  evidence_chain jsonb not null default '[]'::jsonb,
  catalysts text[] not null default '{}'::text[],
  risks text[] not null default '{}'::text[],
  invalidation_condition text,
  next_watch_items text[] not null default '{}'::text[],
  generated_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  signature text not null,
  constraint opportunities_signature_key unique (signature)
);

create table if not exists public.opportunity_insights (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  insight_id uuid not null references public.extracted_insights(id) on delete cascade,
  relation text not null default 'supporting_evidence',
  weight integer not null default 50,
  created_at timestamptz not null default now(),
  constraint opportunity_insights_unique_link unique (opportunity_id, insight_id, relation)
);

create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  measured_at timestamptz not null default now(),
  horizon text not null,
  ticker text,
  start_price numeric,
  current_price numeric,
  return_pct numeric,
  benchmark_return_pct numeric,
  outcome_label text not null default 'still_open',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  constraint signal_outcomes_unique_measure unique (opportunity_id, horizon, measured_at)
);

create index if not exists source_items_source_id_idx on public.source_items(source_id);
create index if not exists source_items_published_at_idx on public.source_items(published_at desc);
create index if not exists source_items_tickers_idx on public.source_items using gin(tickers);
create index if not exists extracted_insights_source_item_id_idx on public.extracted_insights(source_item_id);
create index if not exists extracted_insights_tickers_idx on public.extracted_insights using gin(tickers);
create index if not exists extracted_insights_themes_idx on public.extracted_insights using gin(themes);
create index if not exists opportunities_score_idx on public.opportunities(score desc);
create index if not exists opportunities_ticker_idx on public.opportunities(ticker);
create index if not exists opportunities_generated_at_idx on public.opportunities(generated_at desc);

alter table public.intelligence_sources enable row level security;
alter table public.source_items enable row level security;
alter table public.extracted_insights enable row level security;
alter table public.themes enable row level security;
alter table public.theme_signals enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_insights enable row level security;
alter table public.signal_outcomes enable row level security;

create policy "public read intelligence sources"
  on public.intelligence_sources for select using (true);
create policy "public read source items"
  on public.source_items for select using (true);
create policy "public read extracted insights"
  on public.extracted_insights for select using (true);
create policy "public read themes"
  on public.themes for select using (true);
create policy "public read theme signals"
  on public.theme_signals for select using (true);
create policy "public read opportunities"
  on public.opportunities for select using (true);
create policy "public read opportunity insights"
  on public.opportunity_insights for select using (true);
create policy "public read signal outcomes"
  on public.signal_outcomes for select using (true);

