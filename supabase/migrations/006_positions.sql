-- 持仓驾驶舱: 每个 ticker 一条聚合持仓记录
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  shares numeric not null check (shares > 0),
  avg_cost numeric not null check (avg_cost >= 0),
  opened_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_ticker_key unique (ticker)
);
