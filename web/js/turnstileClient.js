// Fill this in after creating a free Cloudflare Turnstile widget (see the
// "Contact Us" section of README.md for exact steps). This is the SITE key
// -- meant to be public/client-side, since it only identifies which site is
// asking for a challenge. The SECRET key that actually verifies a completed
// challenge lives server-side only, as a secret on the contact-form Edge
// Function -- never here.
const TURNSTILE_SITE_KEY = 'YOUR_TURNSTILE_SITE_KEY';

export { TURNSTILE_SITE_KEY };
export const isTurnstileConfigured = TURNSTILE_SITE_KEY !== 'YOUR_TURNSTILE_SITE_KEY';
