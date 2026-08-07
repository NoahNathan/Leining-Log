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

-- ==============================================================
-- Gabbai Mode: minyanim, membership, and reading assignments.
-- Additive -- does not touch existing policies on profiles/leining_log
-- except one new SELECT policy at the bottom.
--
-- IMPORTANT: never add `force row level security` to minyanim,
-- minyan_members, reading_assignments, or leining_log. The helper
-- functions below rely on table-owner RLS bypass to break a real
-- mutual-recursion cycle between minyanim <-> minyan_members
-- policies ("infinite recursion detected in policy for relation").
-- Forcing RLS on the owner would reintroduce it.
-- ==============================================================

create table if not exists public.minyanim (
  id uuid primary key default gen_random_uuid(),
  gabbai_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists minyanim_gabbai_idx on public.minyanim (gabbai_user_id);

create table if not exists public.minyan_members (
  id uuid primary key default gen_random_uuid(),
  minyan_id uuid not null references public.minyanim(id) on delete cascade,
  leiner_user_id uuid not null references auth.users(id) on delete cascade,
  leiner_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (minyan_id, leiner_user_id)
);
create index if not exists minyan_members_minyan_idx on public.minyan_members (minyan_id);
create index if not exists minyan_members_leiner_idx on public.minyan_members (leiner_user_id);

create table if not exists public.reading_assignments (
  id uuid primary key default gen_random_uuid(),
  minyan_id uuid not null references public.minyanim(id) on delete cascade,
  leiner_user_id uuid not null references auth.users(id) on delete cascade,
  reading_date date not null,
  parsha_id text not null,
  region text not null default 'diaspora',
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  leining_log_id uuid references public.leining_log(id) on delete set null,
  unique (minyan_id, leiner_user_id, reading_date)
);
create index if not exists reading_assignments_minyan_idx on public.reading_assignments (minyan_id);
create index if not exists reading_assignments_leiner_idx on public.reading_assignments (leiner_user_id);
create index if not exists reading_assignments_date_idx on public.reading_assignments (reading_date);

alter table public.minyanim enable row level security;
alter table public.minyan_members enable row level security;
alter table public.reading_assignments enable row level security;

-- security definer helpers -- each runs as the owning role (postgres),
-- which bypasses RLS on its own tables by default. This is what breaks
-- the minyanim <-> minyan_members mutual-recursion cycle: without this,
-- each table's policy would re-trigger the other table's policy checking
-- it, which Postgres rejects outright.
create or replace function public.is_gabbai_of_minyan(p_minyan_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.minyanim
    where id = p_minyan_id and gabbai_user_id = auth.uid()
  );
$$;

create or replace function public.is_member_of_minyan(p_minyan_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.minyan_members
    where minyan_id = p_minyan_id and leiner_user_id = auth.uid()
      and status in ('pending', 'accepted')
  );
$$;

create or replace function public.gabbai_can_view_user_log(p_leiner_user_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.minyan_members mm
    join public.minyanim m on m.id = mm.minyan_id
    where mm.leiner_user_id = p_leiner_user_id
      and mm.status = 'accepted'
      and m.gabbai_user_id = auth.uid()
  );
$$;

grant execute on function public.is_gabbai_of_minyan(uuid) to authenticated;
grant execute on function public.is_member_of_minyan(uuid) to authenticated;
grant execute on function public.gabbai_can_view_user_log(uuid) to authenticated;

drop policy if exists "minyanim: gabbai full access" on public.minyanim;
create policy "minyanim: gabbai full access" on public.minyanim
  for all using (gabbai_user_id = auth.uid()) with check (gabbai_user_id = auth.uid());

drop policy if exists "minyanim: members can view" on public.minyanim;
create policy "minyanim: members can view" on public.minyanim
  for select using (public.is_member_of_minyan(id));

-- minyan_members: gabbai gets select/insert/delete on rows in their own
-- minyanim -- deliberately NO update policy. Status transitions
-- (accept/decline) are the actual consent event that shares a leiner's
-- reading history, so they're gated exclusively through
-- respond_to_minyan_invite() below, which independently verifies the
-- caller is the invited leiner. Without this, a gabbai could flip
-- status to 'accepted' themselves and grant themselves access without
-- the leiner ever consenting.
drop policy if exists "minyan_members: gabbai can view" on public.minyan_members;
create policy "minyan_members: gabbai can view" on public.minyan_members
  for select using (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "minyan_members: gabbai can invite" on public.minyan_members;
create policy "minyan_members: gabbai can invite" on public.minyan_members
  for insert with check (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "minyan_members: gabbai can remove" on public.minyan_members;
create policy "minyan_members: gabbai can remove" on public.minyan_members
  for delete using (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "minyan_members: own membership select" on public.minyan_members;
create policy "minyan_members: own membership select" on public.minyan_members
  for select using (leiner_user_id = auth.uid());

-- reading_assignments: same shape and reasoning as minyan_members above.
drop policy if exists "reading_assignments: gabbai can view" on public.reading_assignments;
create policy "reading_assignments: gabbai can view" on public.reading_assignments
  for select using (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "reading_assignments: gabbai can assign" on public.reading_assignments;
create policy "reading_assignments: gabbai can assign" on public.reading_assignments
  for insert with check (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "reading_assignments: gabbai can cancel" on public.reading_assignments;
create policy "reading_assignments: gabbai can cancel" on public.reading_assignments
  for delete using (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "reading_assignments: own assignment select" on public.reading_assignments;
create policy "reading_assignments: own assignment select" on public.reading_assignments
  for select using (leiner_user_id = auth.uid());

-- leining_log: one new ADDITIVE select policy -- the existing "own rows
-- only" `for all` policy above is untouched. Postgres ORs multiple
-- permissive policies for the same command together, so this only ever
-- adds visibility (to a gabbai, for members who've explicitly accepted),
-- never removes any.
drop policy if exists "leining_log: gabbai can view shared members" on public.leining_log;
create policy "leining_log: gabbai can view shared members" on public.leining_log
  for select using (public.gabbai_can_view_user_log(user_id));

grant select, insert, update, delete on public.minyanim to authenticated;
grant select, insert, delete on public.minyan_members to authenticated;
grant select, insert, delete on public.reading_assignments to authenticated;

-- ---------------------------------------------------------------
-- RPCs: invite/respond/assign flows. All security definer (run as the
-- owning role, bypassing RLS internally) with search_path locked down
-- and every reference fully schema-qualified, per Postgres's guidance
-- against search_path hijacking in security definer functions.
-- ---------------------------------------------------------------

-- Looks up the target email server-side rather than handing the client
-- a raw user id for an arbitrary email guess. Re-inviting someone who
-- previously declined resets them back to pending.
create or replace function public.invite_leiner_to_minyan(p_minyan_id uuid, p_email text)
returns text -- 'invited' | 'already_member' | 'not_found' | 'not_authorized' | 'cannot_invite_self'
language plpgsql security definer set search_path = '' as $$
declare
  v_target_id uuid;
begin
  if not exists (select 1 from public.minyanim where id = p_minyan_id and gabbai_user_id = auth.uid()) then
    return 'not_authorized';
  end if;

  select id into v_target_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_target_id is null then return 'not_found'; end if;
  if v_target_id = auth.uid() then return 'cannot_invite_self'; end if;

  insert into public.minyan_members (minyan_id, leiner_user_id, leiner_email, status)
  values (p_minyan_id, v_target_id, lower(p_email), 'pending')
  on conflict (minyan_id, leiner_user_id) do update
    set status = 'pending', leiner_email = excluded.leiner_email,
        invited_at = now(), responded_at = null
    where public.minyan_members.status = 'declined';

  if not found then return 'already_member'; end if;
  return 'invited';
end;
$$;
grant execute on function public.invite_leiner_to_minyan(uuid, text) to authenticated;

create or replace function public.respond_to_minyan_invite(p_membership_id uuid, p_accept boolean)
returns text -- 'accepted' | 'declined' | 'not_authorized' | 'not_pending'
language plpgsql security definer set search_path = '' as $$
declare v_row public.minyan_members%rowtype;
begin
  select * into v_row from public.minyan_members where id = p_membership_id for update;
  if v_row.id is null or v_row.leiner_user_id <> auth.uid() then return 'not_authorized'; end if;
  if v_row.status <> 'pending' then return 'not_pending'; end if;
  update public.minyan_members
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_membership_id;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;
grant execute on function public.respond_to_minyan_invite(uuid, boolean) to authenticated;

create or replace function public.assign_reading(
  p_minyan_id uuid, p_leiner_user_id uuid, p_reading_date date, p_parsha_id text, p_region text default 'diaspora'
) returns text -- 'assigned' | 'not_authorized' | 'not_accepted_member' | 'already_assigned' | 'date_in_past'
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.minyanim where id = p_minyan_id and gabbai_user_id = auth.uid()) then
    return 'not_authorized';
  end if;
  if p_reading_date < current_date then return 'date_in_past'; end if;
  if not exists (select 1 from public.minyan_members where minyan_id = p_minyan_id
                 and leiner_user_id = p_leiner_user_id and status = 'accepted') then
    return 'not_accepted_member';
  end if;

  insert into public.reading_assignments (minyan_id, leiner_user_id, reading_date, parsha_id, region, status)
  values (p_minyan_id, p_leiner_user_id, p_reading_date, p_parsha_id, p_region, 'pending')
  on conflict (minyan_id, leiner_user_id, reading_date) do update
    set status = 'pending', parsha_id = excluded.parsha_id, region = excluded.region, responded_at = null
    where public.reading_assignments.status = 'declined';

  if not found then return 'already_assigned'; end if;
  return 'assigned';
end;
$$;
grant execute on function public.assign_reading(uuid, uuid, date, text, text) to authenticated;

-- On accept, upserts the corresponding leining_log row for the leiner
-- (reusing the existing unique(user_id, parsha_id, aliyah_key)
-- constraint) and links it back onto the assignment.
create or replace function public.respond_to_reading_assignment(
  p_assignment_id uuid, p_accept boolean, p_aliyah_key text default 'ALL'
) returns text -- 'accepted' | 'declined' | 'not_authorized' | 'not_pending'
language plpgsql security definer set search_path = '' as $$
declare v_row public.reading_assignments%rowtype; v_log_id uuid;
begin
  select * into v_row from public.reading_assignments where id = p_assignment_id for update;
  if v_row.id is null or v_row.leiner_user_id <> auth.uid() then return 'not_authorized'; end if;
  if v_row.status <> 'pending' then return 'not_pending'; end if;

  if p_accept then
    insert into public.leining_log (user_id, parsha_id, aliyah_key, year_gregorian)
    values (auth.uid(), v_row.parsha_id, coalesce(p_aliyah_key, 'ALL'), extract(year from v_row.reading_date)::int)
    on conflict (user_id, parsha_id, aliyah_key) do nothing
    returning id into v_log_id;

    if v_log_id is null then
      select id into v_log_id from public.leining_log
        where user_id = auth.uid() and parsha_id = v_row.parsha_id
          and aliyah_key = coalesce(p_aliyah_key, 'ALL');
    end if;

    update public.reading_assignments
      set status = 'accepted', responded_at = now(), leining_log_id = v_log_id
      where id = p_assignment_id;
    return 'accepted';
  else
    update public.reading_assignments set status = 'declined', responded_at = now() where id = p_assignment_id;
    return 'declined';
  end if;
end;
$$;
grant execute on function public.respond_to_reading_assignment(uuid, boolean, text) to authenticated;
