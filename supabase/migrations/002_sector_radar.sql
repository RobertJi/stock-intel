-- Sector Radar v2 intelligence layer.
-- Replaces the v1 source_items/extracted_insights/opportunities design.
-- Apply before running: python -m scripts.radar.run all

create extension if not exists pgcrypto;

create table if not exists public.radar_signals (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null, -- news | social | search_trend | price_move | benchmark | filing | macro
  source_name text not null, -- e.g. google_news_rss, price_moves, hf_leaderboard
  title text not null,
  content text,
  url text,
  published_at timestamptz,
  entities jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  content_hash text not null,
  triage_status text not null default 'pending', -- pending | interesting | discarded
  triage_sectors jsonb not null default '[]'::jsonb,
  reason_status text not null default 'pending', -- pending | done | skipped | failed
  created_at timestamptz not null default now(),
  constraint radar_signals_hash_key unique (content_hash)
);

create index if not exists radar_signals_triage_idx on public.radar_signals (triage_status, created_at desc);
create index if not exists radar_signals_reason_idx on public.radar_signals (reason_status) where triage_status = 'interesting';

create table if not exists public.sector_theses (
  id uuid primary key default gen_random_uuid(),
  sector text not null,             -- normalized slug, e.g. memory-semiconductors
  sector_zh text,                   -- 中文展示名
  direction text not null,          -- bullish | bearish
  status text not null default 'forming', -- forming | active | confirmed | invalidated | expired
  conviction integer not null default 0,
  conviction_components jsonb not null default '{}'::jsonb, -- auditable score breakdown
  summary text,
  transmission text,                -- LLM 推断的传导链
  confirm_conditions jsonb not null default '[]'::jsonb,
  invalidate_conditions jsonb not null default '[]'::jsonb,
  market_reaction jsonb not null default '{}'::jsonb, -- priced-in check per market
  first_signal_at timestamptz,
  last_signal_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sector_theses_active_key
  on public.sector_theses (sector, direction)
  where status in ('forming', 'active', 'confirmed');

create table if not exists public.thesis_signals (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.sector_theses(id) on delete cascade,
  signal_id uuid not null references public.radar_signals(id) on delete cascade,
  stance text not null default 'supports', -- supports | weakens
  weight integer not null default 50,      -- 0-100
  reasoning text,
  created_at timestamptz not null default now(),
  constraint thesis_signals_key unique (thesis_id, signal_id)
);

create table if not exists public.sector_instruments (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  market text not null,   -- US | HK | CN | JP | KR
  symbol text not null,
  name text,
  relation text not null default 'direct', -- direct | upstream | downstream | proxy_etf
  sensitivity text not null default 'medium',
  created_at timestamptz not null default now(),
  constraint sector_instruments_key unique (sector, market, symbol)
);

create table if not exists public.thesis_outcomes (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.sector_theses(id) on delete cascade,
  horizon text not null, -- t1 | t5 | t20
  measured_at timestamptz not null default now(),
  returns jsonb not null default '{}'::jsonb, -- {market: {symbol: pct}}
  verdict text,          -- hit | miss | mixed
  constraint thesis_outcomes_key unique (thesis_id, horizon)
);

create table if not exists public.radar_alerts (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid references public.sector_theses(id) on delete set null,
  kind text not null, -- activated | conviction_jump | reversal | invalidated
  message text not null,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
