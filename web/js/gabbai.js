// Gabbai Mode data layer: minyanim (named leining-rotation groups),
// membership invites, and future-week reading assignments. Kept separate
// from data.js since it's only ever used from the auth-gated Gabbai Mode
// tab, unlike data.js's mix of public (unauthenticated) and account data.
//
// Row Level Security (see db/schema.sql) is the real access boundary here
// -- these are thin wrappers, not a trust layer. The invite/respond/assign
// flows go through Postgres RPCs (security definer functions) rather than
// direct table writes, since those steps need server-side checks (email
// lookup, ownership, consent) that can't be expressed as a simple RLS
// check on the calling client.
import { getSupabase } from './supabaseClient.js';

async function sb() {
  const client = await getSupabase();
  if (!client) throw new Error('Supabase is not configured yet.');
  return client;
}

// ---------- minyanim ----------

export async function listMyMinyanim(userId) {
  const client = await sb();
  const { data, error } = await client
    .from('minyanim')
    .select('*')
    .eq('gabbai_user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createMinyan(userId, name) {
  const client = await sb();
  const { data, error } = await client
    .from('minyanim')
    .insert({ gabbai_user_id: userId, name })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function renameMinyan(minyanId, name) {
  const client = await sb();
  const { error } = await client.from('minyanim').update({ name }).eq('id', minyanId);
  if (error) throw error;
}

export async function deleteMinyan(minyanId) {
  const client = await sb();
  const { error } = await client.from('minyanim').delete().eq('id', minyanId);
  if (error) throw error;
}

// ---------- membership ----------

export async function listMinyanMembers(minyanId) {
  const client = await sb();
  const { data, error } = await client
    .from('minyan_members')
    .select('*')
    .eq('minyan_id', minyanId)
    .order('invited_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Returns one of: 'invited' | 'self_added' | 'already_member' | 'not_found' |
// 'not_authorized' -- resolved server-side inside the RPC so the client
// never handles a raw user id for an email guess. Inviting yourself (a
// common case -- gabbaim usually read too) skips straight to 'self_added'
// with no pending/consent step, since no one else's consent is needed.
export async function inviteMember(minyanId, email) {
  const client = await sb();
  const { data, error } = await client.rpc('invite_leiner_to_minyan', {
    p_minyan_id: minyanId, p_email: email,
  });
  if (error) throw error;
  return data;
}

export async function removeMember(membershipId) {
  const client = await sb();
  const { error } = await client.from('minyan_members').delete().eq('id', membershipId);
  if (error) throw error;
}

export async function listMyPendingMinyanInvites(userId) {
  const client = await sb();
  const { data, error } = await client
    .from('minyan_members')
    .select('*, minyanim ( name )')
    .eq('leiner_user_id', userId)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Minyanim this user is an ACCEPTED member of (not one they run) -- needed
// to know which minyanim's open reading_slots to show them under "Your
// invitations" (see listMyOpenReadingSignups).
export async function listMyMinyanMemberships(userId) {
  const client = await sb();
  const { data, error } = await client
    .from('minyan_members')
    .select('*, minyanim ( name )')
    .eq('leiner_user_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return data || [];
}

// Returns 'accepted' | 'declined' | 'not_authorized' | 'not_pending'.
export async function respondToMinyanInvite(membershipId, accept) {
  const client = await sb();
  const { data, error } = await client.rpc('respond_to_minyan_invite', {
    p_membership_id: membershipId, p_accept: accept,
  });
  if (error) throw error;
  return data;
}

// ---------- reading assignments ----------

// Returns 'assigned' | 'not_authorized' | 'not_accepted_member' |
// 'already_assigned' | 'date_in_past'.
export async function assignReading(minyanId, leinerUserId, readingDate, parshaId, region = 'diaspora') {
  const client = await sb();
  const { data, error } = await client.rpc('assign_reading', {
    p_minyan_id: minyanId, p_leiner_user_id: leinerUserId,
    p_reading_date: readingDate, p_parsha_id: parshaId, p_region: region,
  });
  if (error) throw error;
  return data;
}

export async function listMinyanAssignments(minyanId) {
  const client = await sb();
  const { data, error } = await client
    .from('reading_assignments')
    .select('*')
    .eq('minyan_id', minyanId)
    .order('reading_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function cancelAssignment(assignmentId) {
  const client = await sb();
  const { error } = await client.from('reading_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

export async function listMyPendingReadingInvites(userId) {
  const client = await sb();
  const { data, error } = await client
    .from('reading_assignments')
    .select('*, minyanim ( name )')
    .eq('leiner_user_id', userId)
    .eq('status', 'pending')
    .order('reading_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// aliyahKey defaults to 'ALL' (whole parsha) but callers should always
// pass an explicit choice -- a reading assignment can represent just one
// aliyah out of several readers sharing a date, so silently defaulting
// would both inflate the leiner's own progress and corrupt the gabbai's
// coverage grid. Returns 'accepted' | 'declined' | 'not_authorized' | 'not_pending'.
export async function respondToReadingAssignment(assignmentId, accept, aliyahKey = 'ALL') {
  const client = await sb();
  const { data, error } = await client.rpc('respond_to_reading_assignment', {
    p_assignment_id: assignmentId, p_accept: accept, p_aliyah_key: aliyahKey,
  });
  if (error) throw error;
  return data;
}

// ---------- shared coverage data ----------

// One round trip feeds both the per-leiner % list and the coverage grid.
// RLS (gabbai_can_view_user_log) is what actually enforces the boundary
// regardless of what's passed in memberUserIds.
export async function getSharedLogsForMinyan(memberUserIds) {
  if (!memberUserIds.length) return [];
  const client = await sb();
  const { data, error } = await client.from('leining_log').select('*').in('user_id', memberUserIds);
  if (error) throw error;
  return data || [];
}

// Same shared round trip for davening_log -- who can lead what, across the
// whole minyan (see computeDavenersByRole in data.js).
export async function getSharedDaveningLogForMinyan(memberUserIds) {
  if (!memberUserIds.length) return [];
  const client = await sb();
  const { data, error } = await client.from('davening_log').select('*').in('user_id', memberUserIds);
  if (error) throw error;
  return data || [];
}

// ---------- self-serve reading sign-up ----------
// The other direction from reading_assignments above: the gabbai opens a
// set of aliyot for a date, and any ACCEPTED member claims one directly --
// no per-leiner assignment step. See db/schema.sql's reading_slots table
// for why this is a separate mechanism, and why claiming credits
// leining_log immediately rather than needing a separate accept.

// Returns 'opened' | 'not_authorized' | 'date_in_past' | 'no_keys'.
export async function openReadingSignup(minyanId, readingDate, parshaId, region, aliyahKeys) {
  const client = await sb();
  const { data, error } = await client.rpc('open_reading_signup', {
    p_minyan_id: minyanId, p_reading_date: readingDate, p_parsha_id: parshaId,
    p_region: region, p_aliyah_keys: aliyahKeys,
  });
  if (error) throw error;
  return data;
}

export async function listReadingSlots(minyanId, readingDate) {
  const client = await sb();
  const { data, error } = await client
    .from('reading_slots')
    .select('*')
    .eq('minyan_id', minyanId)
    .eq('reading_date', readingDate)
    .order('aliyah_key', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Every open reading date for a minyan, most recent first -- used to list
// "upcoming sign-ups" without needing a specific date picked yet.
export async function listUpcomingReadingSlots(minyanId) {
  const client = await sb();
  const { data, error } = await client
    .from('reading_slots')
    .select('*')
    .eq('minyan_id', minyanId)
    .gte('reading_date', new Date().toISOString().slice(0, 10))
    .order('reading_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Returns 'claimed' | 'not_accepted_member' | 'already_claimed' | 'not_found'.
export async function claimReadingSlot(slotId) {
  const client = await sb();
  const { data, error } = await client.rpc('claim_reading_slot', { p_slot_id: slotId });
  if (error) throw error;
  return data;
}

// Returns 'unclaimed' | 'not_authorized' | 'not_found'.
export async function unclaimReadingSlot(slotId) {
  const client = await sb();
  const { data, error } = await client.rpc('unclaim_reading_slot', { p_slot_id: slotId });
  if (error) throw error;
  return data;
}

export async function cancelReadingSlot(slotId) {
  const client = await sb();
  const { error } = await client.from('reading_slots').delete().eq('id', slotId);
  if (error) throw error;
}

// Every reading_slots row across every minyan this user belongs to (not
// just ones they've claimed) -- "Your invitations" needs to show open
// sign-ups from minyanim the user has accepted membership in, without
// the caller needing to already know each minyan_id up front.
export async function listMyOpenReadingSignups(minyanIds) {
  if (!minyanIds.length) return [];
  const client = await sb();
  const { data, error } = await client
    .from('reading_slots')
    .select('*, minyanim ( name )')
    .in('minyan_id', minyanIds)
    .gte('reading_date', new Date().toISOString().slice(0, 10))
    .order('reading_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Fires the "email every accepted member" side -- calls the
// notify-reading-signup Edge Function directly (see its README: needs a
// verified Resend sending domain to actually deliver to anyone but the
// account owner). Returns { sent, failed, total }.
export async function sendReadingSignupInvite(minyanId, { minyanName, parshaLabel, blurb, signupUrl }) {
  const client = await sb();
  const { data, error } = await client.functions.invoke('notify-reading-signup', {
    body: { minyan_id: minyanId, minyan_name: minyanName, parsha_label: parshaLabel, blurb, signup_url: signupUrl },
  });
  if (error) throw error;
  return data;
}

