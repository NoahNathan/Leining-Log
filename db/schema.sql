-- Leining Log: user accounts + leining-history schema.
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL
-- Editor -> New query -> paste -> Run). Safe to re-run: every statement is
-- guarded with IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.

-- ---------------------------------------------------------------------
-- profiles: one row per signed-up user, extra fields beyond auth.users.
-- id is the SAME uuid as auth.users.id (Supabase's built-in user table).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  bar_mitzvah_parsha_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- leining_log: one row per (user, parsha, aliyah) they've marked as
-- leined. aliyah_key is the sentinel 'ALL' for "the whole parsha" (a
-- coarse log entry covering every aliyah), otherwise '1'..'7' or 'M' for
-- maftir. A real sentinel (not NULL) is used deliberately: Postgres treats
-- every NULL as distinct for uniqueness purposes, which would silently
-- break the "one whole-parsha row per user per parsha" upsert below.
-- ---------------------------------------------------------------------
create table if not exists public.leining_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parsha_id text not null,
  aliyah_key text not null default 'ALL',
  year_hebrew text,
  year_gregorian integer,
  is_bar_mitzvah boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, parsha_id, aliyah_key)
);

create index if not exists leining_log_user_id_idx on public.leining_log (user_id);

-- ---------------------------------------------------------------------
-- Row Level Security: every user can only ever see/write their own rows.
-- This is what makes it safe to embed the public "anon" API key in the
-- static site's client-side JS -- the key identifies the app, RLS (keyed
-- off the verified auth.uid() from the user's session) enforces the
-- actual per-row access boundary.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leining_log enable row level security;

drop policy if exists "profiles: own row only" on public.profiles;
create policy "profiles: own row only" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "leining_log: own rows only" on public.leining_log;
create policy "leining_log: own rows only" on public.leining_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Auto-create a profile row the moment someone signs up, so the app
-- never has to special-case "logged in but no profile row yet."
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
