import { el } from './util.js';
import { isConfigured, onAuthChange } from './auth.js';

// A slim site-wide prompt to sign in/create an account, shown above the main
// view on every tab whenever the user is logged out -- disappears the moment
// they sign in (or immediately, if accounts aren't configured at all).
export async function initAccountBanner() {
  const host = document.getElementById('account-banner');
  if (!host || !isConfigured) return;
  try {
    await onAuthChange((user) => {
      host.innerHTML = '';
      if (user) return;
      host.append(el('div', { class: 'account-banner-inner' }, [
        el('p', {}, 'Sign in to save which aliyot and parshiot you\'ve leined, and track your progress through the Torah.'),
        el('a', { class: 'btn-primary', href: '#account' }, 'Sign in / Create account'),
      ]));
    });
  } catch (err) {
    console.error('Account banner unavailable:', err);
  }
}
