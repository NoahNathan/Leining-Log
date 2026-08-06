// Fill these in after creating your free Supabase project (see README.md
// "Account & progress tracking" section for exact steps). Both values are
// meant to be public/client-side -- Row Level Security (see db/schema.sql)
// is what actually protects each user's data, not secrecy of these keys.
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const isConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

let clientPromise = null;

export function getSupabase() {
  if (!isConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    );
  }
  return clientPromise;
}
