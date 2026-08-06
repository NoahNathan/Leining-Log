import { el, displayParshaName } from '../util.js';
import { isConfigured, signInWithMagicLink, signOut, onAuthChange } from '../auth.js';
import {
  listAllParshiotForSearch, getMyProfile, setBarMitzvahParsha,
  getMyLeiningLog, addLeiningLogEntry, removeLeiningLogEntry, computeTorahProgress,
} from '../data.js';

const BOOK_ORDER = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

let unsubscribeAuth = null;

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function aliyahLabel(key) {
  if (key === 'ALL') return 'Whole parsha';
  if (key === 'M') return 'Maftir';
  return ordinal(Number(key)) + ' aliyah';
}

export async function renderAccount(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'My Torah'),
    el('p', { class: 'muted' }, 'Track which aliyot and parshiot you\'ve leined, and see how much of the Torah you\'ve covered.'),
  ]));

  if (!isConfigured) {
    container.append(el('div', { class: 'notice' }, [
      'Account storage isn\'t configured yet. See the "Account & progress tracking" section of ',
      el('code', {}, 'README.md'),
      ' for setup steps.',
    ]));
    return;
  }

  const body = el('div', { class: 'view-body' }, [el('p', { class: 'muted' }, 'Loading…')]);
  container.append(body);

  if (unsubscribeAuth) unsubscribeAuth();
  unsubscribeAuth = await onAuthChange((user) => {
    if (user) renderLoggedIn(body, user);
    else renderLoggedOut(body);
  });
}

function renderLoggedOut(body) {
  body.innerHTML = '';
  const email = el('input', { type: 'email', class: 'text-input', placeholder: 'you@example.com', required: true });
  const status = el('p', { class: 'muted small' }, '');
  const btn = el('button', { class: 'btn-primary', type: 'submit' }, 'Send magic link');
  const form = el('form', {
    class: 'search-row',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!email.value) return;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await signInWithMagicLink(email.value);
        status.textContent = `Check ${email.value} for a sign-in link.`;
        status.className = 'muted small';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'error small';
      }
      btn.disabled = false;
      btn.textContent = 'Send magic link';
    },
  }, [email, btn]);
  body.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Sign in'),
    el('p', { class: 'muted small' }, 'No password needed -- we\'ll email you a one-time link.'),
    form,
    status,
  ]));
}

async function renderLoggedIn(body, user) {
  body.innerHTML = '';
  body.append(el('p', { class: 'muted' }, 'Loading your progress…'));

  const [profile, log, allParshiot] = await Promise.all([
    getMyProfile(user.id), getMyLeiningLog(user.id), listAllParshiotForSearch(),
  ]);
  const progress = await computeTorahProgress(log);
  const individual = allParshiot.filter((p) => !p.combinedEntry).sort((a, b) => a.parshaNum - b.parshaNum);
  const byId = new Map(individual.map((p) => [p.id, p]));

  body.innerHTML = '';

  body.append(el('div', { class: 'card subcard account-header' }, [
    el('div', {}, [
      el('div', { class: 'muted small' }, 'Signed in as'),
      el('div', {}, user.email),
    ]),
    el('button', { class: 'btn-share', type: 'button', onclick: () => signOut() }, 'Sign out'),
  ]));

  body.append(renderProgressCard(progress));
  body.append(renderBarMitzvahCard(user, profile, individual));
  body.append(renderAddEntryCard(user, individual, () => renderLoggedIn(body, user)));
  body.append(renderLogCard(log, byId, () => renderLoggedIn(body, user)));
}

function renderProgressCard(progress) {
  const card = el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Torah progress'),
    el('div', { class: 'progress-headline' }, [
      el('span', { class: 'progress-percent' }, `${progress.percent}%`),
      el('span', { class: 'muted small' }, `${progress.learnedVerses.toLocaleString()} of ${progress.totalVerses.toLocaleString()} verses`),
    ]),
    el('div', { class: 'progress-track' }, [
      el('div', { class: 'progress-fill', style: `width:${Math.max(1, progress.percent)}%` }),
    ]),
  ]);
  for (const [book, stat] of Object.entries(progress.byBook)) {
    const pct = stat.total ? Math.round((stat.learned / stat.total) * 1000) / 10 : 0;
    card.append(el('div', { class: 'minibar-row' }, [
      el('span', { class: 'minibar-label' }, book),
      el('div', { class: 'minibar-track' }, [
        el('div', { class: 'minibar-fill', style: `width:${Math.max(2, pct)}%; background:var(--accent)` }),
      ]),
      el('span', { class: 'minibar-value' }, `${pct}%`),
    ]));
  }
  return card;
}

function renderBarMitzvahCard(user, profile, individual) {
  const select = el('select', { class: 'text-input' }, [
    el('option', { value: '' }, '— none set —'),
    ...individual.map((p) => el('option', { value: p.id }, displayParshaName(p.englishName || p.id))),
  ]);
  if (profile && profile.bar_mitzvah_parsha_id) select.value = profile.bar_mitzvah_parsha_id;
  const status = el('span', { class: 'muted small' }, '');
  const btn = el('button', {
    class: 'btn-primary', type: 'button',
    onclick: async () => {
      await setBarMitzvahParsha(user.id, select.value || null);
      status.textContent = 'Saved.';
      setTimeout(() => { status.textContent = ''; }, 1500);
    },
  }, 'Save');
  return el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Bar mitzvah parsha'),
    el('div', { class: 'search-row' }, [select, btn, status]),
  ]);
}

function renderAddEntryCard(user, individual, onSaved) {
  const parshaSelect = el('select', { class: 'text-input' });
  for (const book of BOOK_ORDER) {
    const inBook = individual.filter((p) => p.book === book);
    if (!inBook.length) continue;
    parshaSelect.append(el('optgroup', { label: book }, inBook.map((p) =>
      el('option', { value: p.id }, displayParshaName(p.englishName || p.id))
    )));
  }
  const aliyahSelect = el('select', { class: 'text-input' }, [el('option', { value: 'ALL' }, 'Whole parsha')]);
  function refreshAliyot() {
    const p = individual.find((x) => x.id === parshaSelect.value);
    aliyahSelect.innerHTML = '';
    aliyahSelect.append(el('option', { value: 'ALL' }, 'Whole parsha'));
    if (p) {
      for (const a of p.aliyot) aliyahSelect.append(el('option', { value: String(a.aliyah) }, ordinal(a.aliyah) + ' aliyah'));
      if (p.maftir) aliyahSelect.append(el('option', { value: 'M' }, 'Maftir'));
    }
  }
  parshaSelect.addEventListener('change', refreshAliyot);
  refreshAliyot();

  const yearHebrew = el('input', { type: 'text', class: 'text-input', placeholder: 'Hebrew year (e.g. 5784)' });
  const yearGregorian = el('input', { type: 'number', class: 'text-input', placeholder: 'Year (e.g. 2024)', min: '1900', max: '2200' });
  const barMitzvah = el('input', { type: 'checkbox' });
  const status = el('span', { class: 'muted small' }, '');

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await addLeiningLogEntry(user.id, {
        parshaId: parshaSelect.value,
        aliyahKey: aliyahSelect.value,
        yearHebrew: yearHebrew.value || null,
        yearGregorian: yearGregorian.value ? Number(yearGregorian.value) : null,
        isBarMitzvah: barMitzvah.checked,
      });
      status.textContent = 'Logged!';
      onSaved();
    },
  }, [
    el('div', { class: 'search-row' }, [parshaSelect, aliyahSelect]),
    el('div', { class: 'search-row' }, [yearHebrew, yearGregorian]),
    el('label', { class: 'checkbox-label' }, [barMitzvah, ' This was my bar mitzvah parsha']),
    el('div', { class: 'search-row' }, [el('button', { class: 'btn-primary', type: 'submit' }, 'Mark as leined'), status]),
  ]);

  return el('div', { class: 'card subcard' }, [el('h3', {}, 'Log a reading'), form]);
}

function renderLogCard(log, byId, onChanged) {
  const card = el('div', { class: 'card subcard' }, [el('h3', {}, 'Your log')]);
  if (!log.length) {
    card.append(el('p', { class: 'muted small' }, 'Nothing logged yet -- add your first reading above.'));
    return card;
  }
  const list = el('div', { class: 'log-list' });
  for (const entry of log) {
    const p = byId.get(entry.parsha_id);
    const years = [entry.year_hebrew, entry.year_gregorian].filter(Boolean).join(' / ');
    list.append(el('div', { class: 'log-row' }, [
      el('div', {}, [
        el('span', { class: 'log-parsha' }, p ? displayParshaName(p.englishName || p.id) : entry.parsha_id),
        el('span', { class: 'muted small' }, ` — ${aliyahLabel(entry.aliyah_key)}`),
        entry.is_bar_mitzvah ? el('span', { class: 'tag' }, 'Bar Mitzvah') : null,
        years ? el('span', { class: 'muted small' }, ` · ${years}`) : null,
      ]),
      el('button', {
        class: 'btn-share', type: 'button', title: 'Remove',
        onclick: async () => { await removeLeiningLogEntry(entry.id); onChanged(); },
      }, '✕'),
    ]));
  }
  card.append(list);
  return card;
}
