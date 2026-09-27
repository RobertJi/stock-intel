-- 情报管道心跳:每次 `python -m scripts.radar.run all` 写一行,前端据此显示数据新鲜度,
-- watchdog 据此判断管道是否静默停摆。
create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  status text not null,                          -- ok | partial | failed
  stages jsonb not null default '{}'::jsonb,     -- {stage: {ok, secs, error?, result?}}
  llm jsonb not null default '{}'::jsonb,        -- 用量与估算花费
  error text
);

create index if not exists pipeline_runs_finished_idx on public.pipeline_runs (finished_at desc);

alter table public.pipeline_runs enable row level security;
create policy "public read pipeline runs"
  on public.pipeline_runs for select using (true);
