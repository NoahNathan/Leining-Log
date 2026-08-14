# contact-form

Powers the Contact Us tab: a visitor fills out name/email/message, and this
emails you the submission via [Resend](https://resend.com), gated by a
[Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
captcha so it isn't an open spam relay. Unlike every other Edge Function in
this repo, this one is genuinely open to the public internet -- it has to
be, since a contact form needs to work for visitors who've never signed up.

## One-time setup

**1. Resend account + API key** (skip if you already did this for
`notify-signup`, same account/key works for both)
- Sign up at [resend.com](https://resend.com) with the email address you
  want submissions sent *to* (this matters -- see step 4).
- Dashboard -> API Keys -> Create API Key. Copy it.

**2. Cloudflare Turnstile site**
- Sign up (free) at [dash.cloudflare.com](https://dash.cloudflare.com) if
  you don't already have an account.
- Turnstile -> Add a site. Domain: your GitHub Pages domain (e.g.
  `yourname.github.io`). Widget mode: Managed (the default) is fine.
- Copy the **Site Key** and the **Secret Key** it generates -- they're
  different values used in different places (see steps 3 and 5).

**3. Paste the Site Key into the app**
Open `web/js/turnstileClient.js` and replace `YOUR_TURNSTILE_SITE_KEY` with
the Site Key from step 2. This one is meant to be public/client-side.

**4. Install the Supabase CLI and log in** (skip if already set up)
```
npm install -g supabase
supabase login
```

**5. Link this repo to your Supabase project and deploy the function**
```
supabase link --project-ref <your-project-ref>   # find it in Project Settings -> General
supabase functions deploy contact-form
```

**6. Set the function's secrets**
```
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set NOTIFY_EMAIL=you@example.com
supabase secrets set TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
```
`TURNSTILE_SECRET_KEY` is the **Secret Key** from step 2 -- not the Site Key
you pasted into the frontend, and not something that ever goes in
client-side code. `NOTIFY_EMAIL` is where submissions land. If it's the
*same address* your Resend account is registered with, Resend's shared
`onboarding@resend.dev` sender works immediately -- that's what this
function uses by default. Sending to a different address, or from your own
domain, requires verifying a domain in Resend first; once you have one, set
`NOTIFY_FROM_EMAIL=Leining Log <you@yourdomain.com>` as an extra secret and
redeploy.

That's it -- the Contact Us tab now works. Test it by submitting the form
yourself; each submission's `reply_to` is set to the sender's own address,
so replying from your inbox goes straight back to them.

Until step 3 is done, the form still works but shows a note that spam
protection isn't configured (a bit of light defense-in-depth: server-side
validation and the Turnstile secret check still run either way, and without
a matching `TURNSTILE_SECRET_KEY` secret set on the backend the request
would fail server-side even if someone bypassed the missing frontend widget).
Until steps 5-6 are done, submitting shows a clear error instead of silently
failing.

## Troubleshooting
- "Missing TURNSTILE_SECRET_KEY secret" / "Missing RESEND_API_KEY or
  NOTIFY_EMAIL secret": re-check step 6, then redeploy if you just set them
  (`supabase functions deploy contact-form`).
- "Captcha verification failed": the widget's token expired (they're
  short-lived) -- just resubmit. If it persists, double check the Site Key
  in `turnstileClient.js` and the Secret Key in step 6 both come from the
  *same* Turnstile site in the Cloudflare dashboard.
- No email arriving despite a 200 response: `supabase functions logs
  contact-form` shows the function's own logs, including any Resend error
  text; a 502 there usually means `NOTIFY_EMAIL` doesn't match your Resend
  account email and no sending domain is verified yet (see step 6).
