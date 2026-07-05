-- Add top-level theme grouping to sector theses.
alter table public.sector_theses add column if not exists theme text not null default '其他';
