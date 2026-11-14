-- Apply to the selected Supabase project before enabling DATABASE_PROVIDER=supabase.
create table public.loads (
  id uuid primary key,
  owner_id text not null,
  origin text not null check (char_length(origin) between 1 and 60),
  destination text not null check (char_length(destination) between 1 and 60),
  pickup_date date not null,
  equipment text not null check (equipment in ('Furgón cerrado', 'Refrigerado', 'Plataforma', 'Cabezal')),
  weight double precision not null check (weight > 0 and weight <= 100000),
  pay double precision not null check (pay > 0 and pay <= 1000000),
  company text not null check (char_length(company) between 1 and 80),
  email text not null check (char_length(email) between 3 and 120),
  created_at timestamptz not null default now()
);
create index loads_pickup_date_idx on public.loads (pickup_date);
create index loads_owner_created_idx on public.loads (owner_id, created_at);
alter table public.loads enable row level security;
-- Only the server's secret key can access this table. No browser access.
revoke all on public.loads from anon, authenticated;
grant select, insert, delete on public.loads to service_role;
