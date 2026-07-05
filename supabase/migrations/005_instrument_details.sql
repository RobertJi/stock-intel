-- Per-instrument rationale and price stats for drill-down views.
alter table public.sector_instruments add column if not exists rationale text;
alter table public.sector_instruments add column if not exists pct_5d numeric;
alter table public.sector_instruments add column if not exists pct_20d numeric;
alter table public.sector_instruments add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.sector_instruments add column if not exists updated_at timestamptz not null default now();
