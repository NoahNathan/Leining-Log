// Handles the public Contact Us form: verifies a Cloudflare Turnstile
// token, then emails the site owner via Resend with the submitter's name,
// email, and message (reply_to set to their address, so replying from your
// inbox goes straight back to them).
//
// Invoked directly by anyone visiting the Contact Us tab -- no Supabase
// auth required, since a contact form has to work for visitors who've
// never signed up. That also makes this the one Edge Function in this repo
// that's genuinely open to the public internet, which is exactly what
// Turnstile is here to gate: without a valid, freshly-verified token this
// returns 403 before ever touching Resend.
//
// CORS is handled explicitly (unlike notify-signup, which only ever
// receives server-to-server Database Webhook calls, or notify-reading-signup,
// invoked from an already cross-origin-configured authenticated session) --
// see CORS_HEADERS below.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function respond(body: string, status = 200) {
  return new Response(body, { status, headers: CORS_HEADERS });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respond('ok');

  let body;
  try {
    body = await req.json();
  } catch {
    return respond('Invalid JSON payload', 400);
  }
  const { name, email, message, turnstileToken } = body || {};
  if (!name || !email || !message || !turnstileToken) {
    return respond('Missing required field', 400);
  }
  if (!EMAIL_RE.test(email)) return respond('Invalid email address', 400);
  if (String(message).length > MAX_MESSAGE_LENGTH) return respond('Message too long', 400);

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!turnstileSecret) return respond('Missing TURNSTILE_SECRET_KEY secret', 500);

  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: turnstileSecret, response: turnstileToken }),
  });
  const verify = await verifyRes.json();
  if (!verify.success) return respond('Captcha verification failed -- please try again', 403);

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Leining Log <onboarding@resend.dev>';
  if (!resendApiKey || !notifyEmail) return respond('Missing RESEND_API_KEY or NOTIFY_EMAIL secret', 500);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: notifyEmail,
      reply_to: email,
      subject: `Leining Log contact form: ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });
  if (!res.ok) return respond(`Resend error: ${await res.text()}`, 502);

  return respond('ok');
});
