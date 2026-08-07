# notify-signup

Emails you whenever someone creates a Leining Log account. Fires from a
Supabase Database Webhook on `auth.users` (INSERT) and sends the email via
[Resend](https://resend.com)'s free tier.

## One-time setup

**1. Resend account + API key**
- Sign up at [resend.com](https://resend.com) with the email address you
  want notifications sent *to* (this matters -- see step 4).
- Dashboard -> API Keys -> Create API Key. Copy it.

**2. Install the Supabase CLI and log in** (skip if already set up)
```
npm install -g supabase
supabase login
```

**3. Link this repo to your Supabase project and deploy the function**
```
supabase link --project-ref <your-project-ref>   # find it in Project Settings -> General
supabase functions deploy notify-signup
```

**4. Set the function's secrets**
```
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set NOTIFY_EMAIL=you@example.com
```
`NOTIFY_EMAIL` is where the notification goes. If it's the *same address*
your Resend account is registered with, Resend's shared `onboarding@resend.dev`
sender works immediately with no extra setup -- that's what this function
uses by default. Sending to a different address, or from your own domain,
requires verifying a domain in Resend first; once you have one, set
`NOTIFY_FROM_EMAIL=Leining Log <you@yourdomain.com>` as an extra secret and
redeploy.

**5. Wire up the Database Webhook**
In the Supabase dashboard: **Database -> Webhooks -> Create a new webhook**
- Name: `notify-signup`
- Table: schema `auth`, table `users`
- Events: `Insert` only
- Type: **Supabase Edge Functions**
- Edge Function: `notify-signup`

That's it -- every new signup now triggers the function, which emails
`NOTIFY_EMAIL`. Test it by creating a throwaway account through the app's
sign-up form.

## Troubleshooting
- No email arriving: Database -> Webhooks -> click into `notify-signup` to
  see delivery logs and response codes; `supabase functions logs
  notify-signup` shows the function's own logs (including any Resend error
  text).
- 502 from Resend: usually means `NOTIFY_EMAIL` doesn't match your Resend
  account email and no sending domain is verified yet (see step 4).
