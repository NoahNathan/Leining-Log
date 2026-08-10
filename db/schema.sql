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
-- previously declined resets them back to pending. A gabbai "inviting"
-- themselves (a common case -- gabbaim usually read too) skips the
-- pending/consent step entirely and is added as accepted immediately,
-- since there's no one else whose consent is needed.
create or replace function public.invite_leiner_to_minyan(p_minyan_id uuid, p_email text)
returns text -- 'invited' | 'self_added' | 'already_member' | 'not_found' | 'not_authorized'
language plpgsql security definer set search_path = '' as $$
declare
  v_target_id uuid;
  v_is_self boolean;
begin
  if not exists (select 1 from public.minyanim where id = p_minyan_id and gabbai_user_id = auth.uid()) then
    return 'not_authorized';
  end if;

  select id into v_target_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_target_id is null then return 'not_found'; end if;
  v_is_self := (v_target_id = auth.uid());

  insert into public.minyan_members (minyan_id, leiner_user_id, leiner_email, status, responded_at)
  values (
    p_minyan_id, v_target_id, lower(p_email),
    case when v_is_self then 'accepted' else 'pending' end,
    case when v_is_self then now() else null end
  )
  on conflict (minyan_id, leiner_user_id) do update
    set status = case when v_is_self then 'accepted' else 'pending' end,
        leiner_email = excluded.leiner_email,
        invited_at = now(),
        responded_at = case when v_is_self then now() else null end
    where public.minyan_members.status = 'declined' or v_is_self;

  if not found then return 'already_member'; end if;
  return case when v_is_self then 'self_added' else 'invited' end;
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

-- ==============================================================
-- Gabbai Mode: self-serve reading sign-up.
--
-- Distinct from reading_assignments above (where the GABBAI picks a
-- specific leiner for a specific date) -- this is the other direction:
-- the gabbai opens a set of aliyot for an upcoming date, emails every
-- accepted member a sign-up link, and each leiner independently claims
-- whichever aliyah they want. Kept as its own table rather than
-- overloading reading_assignments, since an "open, unclaimed" row has no
-- leiner yet and needs its own aliyah_key from the moment it's opened (so
-- the sign-up page can show "which aliyot are still available"), neither
-- of which the assign-first flow needs.
--
-- Per product decision: claiming credits the leiner's leining_log
-- IMMEDIATELY (not after the date passes, unlike reading_assignments'
-- accept flow) -- optimistic, matching "you signed up for this."
-- ==============================================================

create table if not exists public.reading_slots (
  id uuid primary key default gen_random_uuid(),
  minyan_id uuid not null references public.minyanim(id) on delete cascade,
  reading_date date not null,
  parsha_id text not null,
  region text not null default 'diaspora',
  aliyah_key text not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  leining_log_id uuid references public.leining_log(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (minyan_id, reading_date, aliyah_key)
);
create index if not exists reading_slots_minyan_idx on public.reading_slots (minyan_id);
create index if not exists reading_slots_date_idx on public.reading_slots (reading_date);
create index if not exists reading_slots_claimed_by_idx on public.reading_slots (claimed_by);

alter table public.reading_slots enable row level security;

-- Same reasoning as is_gabbai_of_minyan/is_member_of_minyan above:
-- security definer so this table's policies don't need to re-query
-- minyan_members in a way that could recurse back through its own
-- policies. Deliberately stricter than is_member_of_minyan (which also
-- allows 'pending') -- self-serve claiming is for ACCEPTED members only,
-- per product decision.
create or replace function public.is_accepted_member_of_minyan(p_minyan_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.minyan_members
    where minyan_id = p_minyan_id and leiner_user_id = auth.uid() and status = 'accepted'
  );
$$;
grant execute on function public.is_accepted_member_of_minyan(uuid) to authenticated;

-- No update policy for anyone, gabbai included -- claiming/unclaiming a
-- slot (which also writes/removes the leiner's OWN leining_log row) only
-- ever happens through the RPCs below, which independently verify
-- auth.uid() is the leiner in question. A blanket gabbai "for all" policy
-- here would let a gabbai claim slots on a leiner's behalf without their
-- consent -- the same consent-integrity issue reading_assignments' RPCs
-- were already written to avoid.
drop policy if exists "reading_slots: gabbai can view" on public.reading_slots;
create policy "reading_slots: gabbai can view" on public.reading_slots
  for select using (public.is_gabbai_of_minyan(minyan_id));

drop policy if exists "reading_slots: gabbai can open" on public.reading_slots;
create policy "reading_slots: gabbai can open" on public.reading_slots
  for insert with check (public.is_gabbai_of_minyan(minyan_id));

-- Only unclaimed slots -- cancelling a slot someone has already claimed
-- (and logged!) out from under them belongs to the leiner themselves
-- (unclaim_reading_slot), not the gabbai.
drop policy if exists "reading_slots: gabbai can cancel unclaimed" on public.reading_slots;
create policy "reading_slots: gabbai can cancel unclaimed" on public.reading_slots
  for delete using (public.is_gabbai_of_minyan(minyan_id) and claimed_by is null);

drop policy if exists "reading_slots: accepted members can view" on public.reading_slots;
create policy "reading_slots: accepted members can view" on public.reading_slots
  for select using (public.is_accepted_member_of_minyan(minyan_id));

grant select, insert, delete on public.reading_slots to authenticated;

create or replace function public.open_reading_signup(
  p_minyan_id uuid, p_reading_date date, p_parsha_id text, p_region text, p_aliyah_keys text[]
) returns text -- 'opened' | 'not_authorized' | 'date_in_past' | 'no_keys'
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.minyanim where id = p_minyan_id and gabbai_user_id = auth.uid()) then
    return 'not_authorized';
  end if;
  if p_reading_date < current_date then return 'date_in_past'; end if;
  if p_aliyah_keys is null or array_length(p_aliyah_keys, 1) is null then return 'no_keys'; end if;

  insert into public.reading_slots (minyan_id, reading_date, parsha_id, region, aliyah_key)
  select p_minyan_id, p_reading_date, p_parsha_id, p_region, k
  from unnest(p_aliyah_keys) as k
  on conflict (minyan_id, reading_date, aliyah_key) do nothing;

  return 'opened';
end;
$$;
grant execute on function public.open_reading_signup(uuid, date, text, text, text[]) to authenticated;

-- Leiner-initiated. Upserts the leining_log row immediately (see the
-- table comment above for why this differs from reading_assignments'
-- accept flow), reusing the existing unique(user_id, parsha_id,
-- aliyah_key) constraint the same way respond_to_reading_assignment does.
create or replace function public.claim_reading_slot(p_slot_id uuid)
returns text -- 'claimed' | 'not_accepted_member' | 'already_claimed' | 'not_found'
language plpgsql security definer set search_path = '' as $$
declare v_row public.reading_slots%rowtype; v_log_id uuid;
begin
  select * into v_row from public.reading_slots where id = p_slot_id for update;
  if v_row.id is null then return 'not_found'; end if;
  if v_row.claimed_by is not null then return 'already_claimed'; end if;
  if not exists (select 1 from public.minyan_members where minyan_id = v_row.minyan_id
                 and leiner_user_id = auth.uid() and status = 'accepted') then
    return 'not_accepted_member';
  end if;

  insert into public.leining_log (user_id, parsha_id, aliyah_key, year_gregorian)
  values (auth.uid(), v_row.parsha_id, v_row.aliyah_key, extract(year from v_row.reading_date)::int)
  on conflict (user_id, parsha_id, aliyah_key) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select id into v_log_id from public.leining_log
      where user_id = auth.uid() and parsha_id = v_row.parsha_id and aliyah_key = v_row.aliyah_key;
  end if;

  update public.reading_slots
    set claimed_by = auth.uid(), claimed_at = now(), leining_log_id = v_log_id
    where id = p_slot_id;
  return 'claimed';
end;
$$;
grant execute on function public.claim_reading_slot(uuid) to authenticated;

-- Symmetric undo: releases the slot and removes the leining_log row this
-- specific claim created (only that row -- if the leiner separately
-- logged the same parsha/aliyah some other way, this leaves that alone,
-- since it deletes by leining_log_id, not by content match).
create or replace function public.unclaim_reading_slot(p_slot_id uuid)
returns text -- 'unclaimed' | 'not_authorized' | 'not_found'
language plpgsql security definer set search_path = '' as $$
declare v_row public.reading_slots%rowtype;
begin
  select * into v_row from public.reading_slots where id = p_slot_id for update;
  if v_row.id is null then return 'not_found'; end if;
  if v_row.claimed_by is distinct from auth.uid() then return 'not_authorized'; end if;

  if v_row.leining_log_id is not null then
    delete from public.leining_log where id = v_row.leining_log_id and user_id = auth.uid();
  end if;

  update public.reading_slots set claimed_by = null, claimed_at = null, leining_log_id = null where id = p_slot_id;
  return 'unclaimed';
end;
$$;
grant execute on function public.unclaim_reading_slot(uuid) to authenticated;

-- ==============================================================
-- Davening-leadership log: a deliberately tiny, separate cousin of
-- leining_log for tracking who can lead which parts of the service --
-- "who can lead Shabbat Shacharit" is then just "who has ever logged
-- leading Shabbat Shacharit," the same pattern leining_log already uses
-- rather than a separate capability/skill flag. No verse ranges, no
-- difficulty scoring -- just a fixed role list and a log-once-ever row,
-- same shape as leining_log's own unique(user, thing) constraint.
-- ==============================================================

create table if not exists public.davening_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'friday_night', 'pesukei_dzimrah', 'shabbat_shacharit', 'shabbat_musaf',
    'shabbat_rosh_chodesh_musaf', 'chagim', 'rosh_hashana', 'yom_kippur'
  )),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index if not exists davening_log_user_id_idx on public.davening_log (user_id);

alter table public.davening_log enable row level security;

drop policy if exists "davening_log: own rows only" on public.davening_log;
create policy "davening_log: own rows only" on public.davening_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Same additive-visibility pattern as leining_log's own gabbai policy.
drop policy if exists "davening_log: gabbai can view shared members" on public.davening_log;
create policy "davening_log: gabbai can view shared members" on public.davening_log
  for select using (public.gabbai_can_view_user_log(user_id));

grant select, insert, delete on public.davening_log to authenticated;
