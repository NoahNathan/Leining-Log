import { getSupabase, isConfigured } from './supabaseClient.js';

export { isConfigured };

// Returns the new user + session (session is null if the Supabase project
// still requires email confirmation before first sign-in).
export async function signUp(email, password) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase is not configured yet.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase is not configured yet.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

// Calls `callback(user | null)` immediately with the current state, then
// again on every future sign-in/sign-out. Never throws -- a network hiccup
// loading the Supabase client (e.g. the esm.sh CDN being unreachable) is
// treated the same as "not configured": callers get a clean logged-out
// state instead of an unhandled rejection.
export async function onAuthChange(callback) {
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (err) {
    console.error('Supabase client unavailable:', err);
    callback(null);
    return () => {};
  }
  if (!supabase) {
    callback(null);
    return () => {};
  }
  const { data: { session } } = await supabase.auth.getSession();
  callback(session ? session.user : null);
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
  return () => sub.subscription.unsubscribe();
}
