-- Schema cho app Tra cứu S2 (chạy trên Supabase local hoặc cloud)
create table if not exists app_config (
  key text primary key,
  value text
);

create table if not exists sp2_port_cache (
  cache_key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.truncate_sp2_port_cache()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table sp2_port_cache;
$$;
