# contact-form

Powers the Contact Us tab: a visitor fills out name/email/message, and this
emails you the submission via [Resend](https://resend.com). Spam defense is
layered so the form works immediately on top of whatever Resend setup you
already have (e.g. from `notify-signup`), with a real captcha
([Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/))
available as an optional upgrade rather than a blocker. Unlike every other
Edge Function in this repo, this one is genuinely open to the public
internet -- it has to be, since a contact form needs to work for visitors
who've never signed up.

## Spam defense, in order

1. **Honeypot field** (always on, zero setup). The form includes a field
   real visitors never see (hidden with CSS, not `type="hidden"` --
   unsophisticated bots that parse raw HTML skip hidden-type inputs but
   still blindly fill anything that looks like an ordinary field). A
   filled-in value makes the function silently no-op instead of emailing
   you. Catches basic/naive spam bots with no setup at all.
2. **Cloudflare Turnstile** (optional, real captcha). If
   `TURNSTILE_SECRET_KEY` isn't set as a secret on this function, server-side
   verification is simply skipped -- the honeypot is your only line of
   defense. Once you set it (steps below), verification kicks in
   immediately with no code change or redeploy needed for the *frontend*
   behavior to matter -- just deploy once your Site Key is pasted into
   `turnstileClient.js` too.

## One-time setup (minimum: just get email working)

**1. Resend account + API key** (skip if you already did this for
`notify-signup` -- **the same secrets work for both functions**, since
Supabase secrets are shared across all functions in a project)
- Sign up at [resend.com](https://resend.com) with the email address you
  want submissions sent *to* (this matters -- see step 3).
- Dashboard -> API Keys -> Create API Key. Copy it.

**2. Install the Supabase CLI and log in** (skip if already set up)
```
npm install -g supabase
supabase login
```

**3. Link this repo to your Supabase project and deploy the function**
```
supabase link --project-ref <your-project-ref>   # find it in Project Settings -> General
supabase functions deploy contact-form
```

**4. Set the function's secrets** (skip if `RESEND_API_KEY`/`NOTIFY_EMAIL`
are already set for `notify-signup` -- same project, same secrets)
```
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set NOTIFY_EMAIL=you@example.com
```
`NOTIFY_EMAIL` is where submissions land. If it's the *same address* your
Resend account is registered with, Resend's shared `onboarding@resend.dev`
sender works immediately -- that's what this function uses by default.
Sending to a different address, or from your own domain, requires
verifying a domain in Resend first; once you have one, set
`NOTIFY_FROM_EMAIL=Leining Log <you@yourdomain.com>` as an extra secret and
redeploy.

**That's it -- the Contact Us tab now works**, protected by the honeypot
alone. Test it by submitting the form yourself; each submission's
`reply_to` is set to the sender's own address, so replying from your inbox
goes straight back to them.

## Optional: upgrade to a real captcha

**5. Cloudflare Turnstile site**
- Sign up (free) at [dash.cloudflare.com](https://dash.cloudflare.com) if
  you don't already have an account.
- Turnstile -> Add a site. Domain: your GitHub Pages domain (e.g.
  `yourname.github.io`). Widget mode: Managed (the default) is fine.
- Copy the **Site Key** and the **Secret Key** it generates -- they're
  different values used in different places (steps 6 and 7).

**6. Paste the Site Key into the app**
Open `web/js/turnstileClient.js` and replace `YOUR_TURNSTILE_SITE_KEY` with
the Site Key from step 5. This one is meant to be public/client-side.

**7. Set the secret key and redeploy**
```
supabase secrets set TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
supabase functions deploy contact-form
```
`TURNSTILE_SECRET_KEY` is the **Secret Key** from step 5 -- not the Site Key
you pasted into the frontend, and not something that ever goes in
client-side code.

## Troubleshooting
- "Missing RESEND_API_KEY or NOTIFY_EMAIL secret": re-check step 4, then
  redeploy if you just set them (`supabase functions deploy contact-form`).
- "Missing captcha token" / "Captcha verification failed": only possible
  once `TURNSTILE_SECRET_KEY` is set (step 7) -- means the widget's token
  expired (they're short-lived) or wasn't sent. Just resubmit; if it
  persists, double check the Site Key in `turnstileClient.js` and the
  Secret Key in step 7 both come from the *same* Turnstile site.
- No email arriving despite a 200 response: `supabase functions logs
  contact-form` shows the function's own logs, including any Resend error
  text; a 502 there usually means `NOTIFY_EMAIL` doesn't match your Resend
  account email and no sending domain is verified yet (see step 4).
- Genuinely not receiving a submission you know was sent: check whether the
  honeypot fired (a browser extension or password manager auto-filling
  every field on the page can occasionally trigger it) -- there's nothing
  to configure here, but it's worth knowing this is a possible false
  positive if it ever comes up.
