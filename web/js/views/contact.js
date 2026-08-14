import { el } from '../util.js';
import { isConfigured, getSupabase } from '../supabaseClient.js';
import { TURNSTILE_SITE_KEY, isTurnstileConfigured } from '../turnstileClient.js';

// Loaded lazily (only when this view actually renders) rather than sitewide,
// so visitors who never open Contact Us never pull in third-party JS.
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let turnstileScriptPromise = null;
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the spam-check widget -- check your connection and try again.'));
      document.head.append(script);
    });
  }
  return turnstileScriptPromise;
}

export async function renderContact(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'Contact Us'),
    el('p', { class: 'muted' }, "We'd love to hear your feedback -- bug reports, feature ideas, or just general thoughts on how to make Leining Log more useful. Send us a note and it'll land straight in our inbox."),
  ]));

  const body = el('div', { class: 'view-body' });
  container.append(body);

  if (!isConfigured) {
    body.append(el('div', { class: 'notice' }, [
      'The contact form isn\'t configured yet. See the "Contact Us" section of ',
      el('code', {}, 'README.md'),
      ' for setup steps.',
    ]));
    return;
  }

  const name = el('input', { type: 'text', class: 'text-input', placeholder: 'Your name', required: true, autocomplete: 'name' });
  const email = el('input', { type: 'email', class: 'text-input', placeholder: 'you@example.com', required: true, autocomplete: 'email' });
  const message = el('textarea', {
    class: 'text-input textarea-input', rows: '6', maxlength: '5000', required: true,
    placeholder: 'Feedback, bug reports, ideas -- anything at all',
  });
  const captchaHost = el('div', { class: 'turnstile-host' });
  const status = el('span', { class: 'muted small' }, '');
  const submitBtn = el('button', { class: 'btn-primary', type: 'submit', disabled: true }, 'Send');

  let turnstileToken = null;
  let widgetId = null;

  if (isTurnstileConfigured) {
    status.textContent = 'Loading spam check…';
    loadTurnstileScript().then(() => {
      status.textContent = '';
      widgetId = window.turnstile.render(captchaHost, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => {
          turnstileToken = token;
          submitBtn.disabled = false;
        },
        'expired-callback': () => {
          turnstileToken = null;
          submitBtn.disabled = true;
        },
      });
    }).catch((err) => {
      status.textContent = err.message;
      status.className = 'error small';
    });
  } else {
    captchaHost.append(el('p', { class: 'muted small' }, 'Spam-check widget not configured -- see README.md. The form still works, just without a captcha.'));
    submitBtn.disabled = false;
  }

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (isTurnstileConfigured && !turnstileToken) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      status.textContent = '';
      status.className = 'muted small';
      try {
        const client = await getSupabase();
        const { error } = await client.functions.invoke('contact-form', {
          body: { name: name.value, email: email.value, message: message.value, turnstileToken },
        });
        if (error) throw error;
        form.innerHTML = '';
        form.append(el('p', {}, "Thanks -- your message is on its way. We'll get back to you if a reply's needed."));
      } catch (err) {
        status.textContent = err.message || 'Something went wrong -- please try again.';
        status.className = 'error small';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send';
        if (isTurnstileConfigured && widgetId !== null) window.turnstile.reset(widgetId);
        turnstileToken = null;
      }
    },
  }, [
    el('div', { class: 'search-row' }, [name, email]),
    message,
    captchaHost,
    el('div', { class: 'search-row' }, [submitBtn, status]),
  ]);

  body.append(el('div', { class: 'card subcard' }, [el('h3', {}, 'Send us a message'), form]));
}
