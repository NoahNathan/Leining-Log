// Emails every ACCEPTED member of a minyan, inviting them to sign up for
// an open reading -- the gabbai's "one button" to notify their whole
// minyan at once. Unlike notify-signup (fired by a Database Webhook),
// this is invoked directly by the gabbai's own client
// (supabase.functions.invoke), which forwards their session automatically.
//
// No service-role key needed: the request is handled with the CALLER's
// own JWT, so every query below runs through ordinary RLS. is_gabbai_of_minyan
// is the real authorization check (the caller really owns this minyan, not
// just "claims to" via the minyan_id in the request body), and
// minyan_members' own "gabbai can view" policy already lets the caller list
// their accepted members (with email) directly -- no elevated access
// required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON payload', { status: 400 });
  }
  const { minyan_id, minyan_name, parsha_label, blurb, signup_url } = body || {};
  if (!minyan_id || !signup_url) {
    return new Response('Missing minyan_id or signup_url', { status: 400 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Missing Authorization header', { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

  const { data: isGabbai, error: gabbaiErr } = await client.rpc('is_gabbai_of_minyan', { p_minyan_id: minyan_id });
  if (gabbaiErr) return new Response(`Authorization check failed: ${gabbaiErr.message}`, { status: 500 });
  if (!isGabbai) return new Response('Not authorized for this minyan', { status: 403 });

  const { data: members, error: membersErr } = await client
    .from('minyan_members')
    .select('leiner_email')
    .eq('minyan_id', minyan_id)
    .eq('status', 'accepted');
  if (membersErr) return new Response(`Could not load members: ${membersErr.message}`, { status: 500 });
  if (!members || members.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Leining Log <onboarding@resend.dev>';
  if (!resendApiKey) return new Response('Missing RESEND_API_KEY secret', { status: 500 });

  const subject = `Sign up to lein${parsha_label ? `: ${parsha_label}` : ''}${minyan_name ? ` (${minyan_name})` : ''}`;
  const text = `${blurb ? blurb + '\n\n' : ''}Sign up here: ${signup_url}`;

  let sent = 0, failed = 0;
  for (const m of members) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: m.leiner_email, subject, text }),
    });
    if (res.ok) sent++; else failed++;
  }

  return new Response(JSON.stringify({ sent, failed, total: members.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
