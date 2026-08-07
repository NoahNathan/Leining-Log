// Emails the site owner whenever a new user signs up.
//
// Triggered by a Supabase Database Webhook on auth.users (event: INSERT),
// configured in the Supabase dashboard -- see supabase/functions/notify-signup/README.md
// for the one-time setup. Sends via Resend (https://resend.com); no other
// dependencies.

Deno.serve(async (req) => {
  let record;
  try {
    const payload = await req.json();
    record = payload.record;
  } catch {
    return new Response('Invalid JSON payload', { status: 400 });
  }
  if (!record || !record.email) {
    return new Response('Payload missing record.email', { status: 400 });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Leining Log <onboarding@resend.dev>';
  if (!resendApiKey || !notifyEmail) {
    return new Response('Missing RESEND_API_KEY or NOTIFY_EMAIL secret', { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: notifyEmail,
      subject: 'New Leining Log signup',
      text: `New user signed up: ${record.email}\nAt: ${record.created_at || new Date().toISOString()}`,
    }),
  });

  if (!res.ok) {
    return new Response(`Resend error: ${await res.text()}`, { status: 502 });
  }
  return new Response('ok');
});
