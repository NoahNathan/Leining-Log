import { getSupabase, isConfigured } from './supabaseClient.js';

export { isConfigured };

export async function signInWithMagicLink(email) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase is not configured yet.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
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
// again on every future sign-in/sign-out.
export async function onAuthChange(callback) {
  const supabase = await getSupabase();
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
