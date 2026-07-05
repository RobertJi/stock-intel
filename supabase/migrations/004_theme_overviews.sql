-- Theme-level synthesis: overview, stance, outlook per theme.
create table if not exists public.radar_theme_overviews (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  intro text,
  stance text not null default 'mixed', -- bullish | bearish | mixed
  stance_reason text,
  outlook text,
  bullish_count integer not null default 0,
  bearish_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint radar_theme_overviews_theme_key unique (theme)
);
