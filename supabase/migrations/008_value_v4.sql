-- v4 长期价值投资:公司档案、每日快照、封存的估值记录、提醒
-- 数据来自 SEC EDGAR(公有领域),可公开读取。接入付费数据后,付费字段应放到不开放 anon 读取的表里。

create table if not exists public.value_companies (
  ticker text primary key,
  cik integer,
  name text,
  sic integer,
  market text not null default 'US',
  supported boolean not null default true,
  unsupported_reason text,
  latest_filing jsonb not null default '{}'::jsonb,   -- {form, accn, filed, period, url}
  updated_at timestamptz not null default now()
);

-- 每个交易日一行:价格 + 全部计算结果(可重算,覆盖写)
create table if not exists public.value_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null references public.value_companies(ticker) on delete cascade,
  as_of date not null,
  price numeric,
  shares numeric,
  shares_source text,
  analysis jsonb not null default '{}'::jsonb,        -- model.analyze() 的完整输出
  financials jsonb not null default '[]'::jsonb,      -- 标准化年度财务(含申报日期和 XBRL 出处)
  price_history jsonb not null default '[]'::jsonb,   -- 5 年周线收盘 [[epoch, close], ...]
  created_at timestamptz not null default now(),
  constraint value_snapshots_key unique (ticker, as_of)
);
create index if not exists value_snapshots_ticker_idx on public.value_snapshots (ticker, as_of desc);

-- 封存的估值判断:只追加、不修改。每份新财报或模型版本变化时写一条,用于事后对账。
create table if not exists public.value_calls (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  sealed_at timestamptz not null default now(),
  model_version text not null,
  filing_accn text,
  price numeric,
  bear numeric,
  base numeric,
  bull numeric,
  buy_price numeric,
  uncertainty text,
  zone text,
  implied_return numeric,
  constraint value_calls_key unique (ticker, filing_accn, model_version)
);

create table if not exists public.value_alerts (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  kind text not null,          -- entered_buy_zone | new_filing | red_flag | left_buy_zone
  dedupe_key text not null,
  message text not null,
  delivered boolean not null default false,
  created_at timestamptz not null default now(),
  constraint value_alerts_key unique (ticker, kind, dedupe_key)
);

alter table public.value_companies enable row level security;
alter table public.value_snapshots enable row level security;
alter table public.value_calls enable row level security;
alter table public.value_alerts enable row level security;
create policy "public read value companies" on public.value_companies for select using (true);
create policy "public read value snapshots" on public.value_snapshots for select using (true);
create policy "public read value calls" on public.value_calls for select using (true);
create policy "public read value alerts" on public.value_alerts for select using (true);
