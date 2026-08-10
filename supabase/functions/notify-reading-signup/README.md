# notify-reading-signup

Emails every accepted member of a minyan, inviting them to sign up for an
open reading -- the gabbai's "one button" in Gabbai Mode. Invoked directly
by the client (not a Database Webhook, unlike `notify-signup`), using
[Resend](https://resend.com).

## Important: this needs a verified Resend sending domain

`notify-signup` gets away with Resend's shared `onboarding@resend.dev`
sender because it only ever sends to *one* address (yours, the account
owner's). This function sends to potentially many different leiners'
addresses -- Resend's free-tier default sender can only deliver to the
account's own registered email, so **every other recipient will fail**
until you verify a real sending domain in Resend (Dashboard -> Domains ->
Add Domain, then set the DNS records they give you). Once verified, set
`NOTIFY_FROM_EMAIL=Leining Log <you@yourdomain.com>` as a function secret.
Until you do this, expect `failed` to be non-zero in the response for
anyone who isn't your own Resend account email.

## One-time setup

Assumes you've already done steps 1-3 of `notify-signup`'s README (Resend
account, Supabase CLI linked). Then:

```
supabase functions deploy notify-reading-signup
```

Secrets (reuses `RESEND_API_KEY` if already set for `notify-signup`; only
`NOTIFY_FROM_EMAIL` is specific to actually working here):
```
supabase secrets set RESEND_API_KEY=re_your_key_here   # if not already set
supabase secrets set NOTIFY_FROM_EMAIL=Leining Log <you@yourverifieddomain.com>
```

No Database Webhook needed -- the app calls this function directly when the
gabbai clicks "Email leiners to sign up" in Gabbai Mode.

## Troubleshooting
- `sent: 0, failed: N`: no verified sending domain yet -- see above.
- 403 response: the caller's session isn't the gabbai who owns that minyan
  (shouldn't happen from the app UI itself; would indicate a stale/forged
  request).
- `supabase functions logs notify-reading-signup` shows the function's own
  logs, including any Resend error text per failed send.
