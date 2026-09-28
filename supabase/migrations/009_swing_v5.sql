-- v5 短线波段:社媒/搜索热度 → 个股信号 → 交易计划 → 自动记账

-- 每次采集的热度快照(按来源),用来自建历史基线
create table if not exists public.attention_snapshots (
  id bigserial primary key,
  source text not null,          -- apewisdom | adanos_reddit | adanos_x | adanos_news
  ticker text not null,
  captured_at timestamptz not null,
  mentions numeric,
  mentions_prev numeric,         -- 来源给的 24h 前数值(若有)
  buzz numeric,
  sentiment numeric,
  rank int,
  rank_prev int,
  extra jsonb not null default '{}'::jsonb,
  constraint attention_snapshots_key unique (source, ticker, captured_at)
);
create index if not exists attention_snapshots_ticker_time on public.attention_snapshots (ticker, captured_at desc);

-- 信号:一只股票一天一条,kind 表示类别
create table if not exists public.swing_signals (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  name text,
  as_of date not null,           -- 信号依据的收盘日(美东)
  created_at timestamptz not null default now(),
  kind text not null,            -- rebound(热度放大+大跌 → 恐慌反弹) | hot(热度放大+已大涨 → 过热别追)
  score numeric not null,
  attention jsonb not null default '{}'::jsonb,
  market jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,       -- ref_close, entry, stop, hold_days, exit, risk_pct
  risk_flags jsonb not null default '[]'::jsonb,
  why text,                      -- 为什么热(中文摘要)
  status text not null default 'open',  -- open | entered | stop | time | done
  outcome jsonb not null default '{}'::jsonb,    -- entry, exit, exit_date, ret, spy_ret, excess, t1/t3/t5/t10
  model_version text not null,
  delivered boolean not null default false,
  constraint swing_signals_key unique (ticker, as_of)
);
create index if not exists swing_signals_asof on public.swing_signals (as_of desc);

alter table public.attention_snapshots enable row level security;
alter table public.swing_signals enable row level security;
create policy "public read attention snapshots" on public.attention_snapshots for select using (true);
create policy "public read swing signals" on public.swing_signals for select using (true);
