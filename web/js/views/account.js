import { el, displayParshaName, gregorianToHebrewYear, hebrewToGregorianYear } from '../util.js';
import { isConfigured, signUp, signInWithPassword, signOut, onAuthChange } from '../auth.js';
import {
  listAllParshiotForSearch, clearBarMitzvahFlag,
  getMyLeiningLog, addLeiningLogEntry, removeLeiningLogEntry, computeTorahProgress,
  DAVENING_ROLES, getMyDaveningLog, addDaveningLogEntry, removeDaveningLogEntry,
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
function aliyahSortKey(key) {
  if (key === 'ALL') return -1;
  if (key === 'M') return 999;
  return Number(key);
}

// Fills in whichever year is missing from the other, via the Hebrew-calendar
// correspondence in util.js -- so an entry always shows both once one is
// known, whether the user typed only one or an older row only ever had one.
function deriveYears(yearHebrew, yearGregorian) {
  let heb = yearHebrew || null;
  let greg = yearGregorian || null;
  if (greg && !heb) heb = String(gregorianToHebrewYear(greg));
  else if (heb && !greg && /^\d+$/.test(heb)) greg = hebrewToGregorianYear(Number(heb));
  return { yearHebrew: heb, yearGregorian: greg };
}

export async function renderAccount(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'My Leining'),
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

let authMode = 'signin'; // or 'signup'

function renderLoggedOut(body, initialStatus) {
  body.innerHTML = '';
  const isSignup = authMode === 'signup';
  const email = el('input', { type: 'email', class: 'text-input', placeholder: 'you@example.com', required: true, autocomplete: 'email' });
  const password = el('input', {
    type: 'password', class: 'text-input', placeholder: 'Password', required: true, minlength: '6',
    autocomplete: isSignup ? 'new-password' : 'current-password',
  });
  const status = el('p', { class: `muted small` }, initialStatus ? initialStatus.text : '');
  if (initialStatus) status.className = initialStatus.className;
  const submitLabel = () => (isSignup ? 'Create account' : 'Sign in');
  const btn = el('button', { class: 'btn-primary', type: 'submit' }, submitLabel());

  const form = el('form', {
    class: 'search-row',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!email.value || !password.value) return;
      btn.disabled = true;
      btn.textContent = isSignup ? 'Creating…' : 'Signing in…';
      try {
        if (isSignup) {
          const data = await signUp(email.value, password.value);
          if (!data.session) {
            authMode = 'signin';
            renderLoggedOut(body, { text: `Account created. Check ${email.value} to confirm your email, then sign in.`, className: 'muted small' });
            return;
          }
          // Confirmation disabled on this Supabase project -- signed in
          // immediately; onAuthChange picks up the new session and re-renders.
        } else {
          await signInWithPassword(email.value, password.value);
        }
      } catch (err) {
        status.textContent = err.message;
        status.className = 'error small';
        btn.disabled = false;
        btn.textContent = submitLabel();
      }
    },
  }, [email, password, btn]);

  const toggle = el('button', {
    class: 'btn-share', type: 'button',
    onclick: () => { authMode = isSignup ? 'signin' : 'signup'; renderLoggedOut(body); },
  }, isSignup ? 'Already have an account? Sign in' : 'New here? Create an account');

  body.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, isSignup ? 'Create account' : 'Sign in'),
    form,
    status,
    toggle,
  ]));
}

async function renderLoggedIn(body, user) {
  body.innerHTML = '';
  body.append(el('p', { class: 'muted' }, 'Loading your progress…'));

  const [log, allParshiot, daveningLog] = await Promise.all([
    getMyLeiningLog(user.id), listAllParshiotForSearch(),
    // Isolated from the Promise.all above on purpose: davening_log is a
    // newer table than leining_log, so an account created before it was
    // added to schema.sql shouldn't have the whole My Leining page break
    // just because that one table doesn't exist in their project yet.
    getMyDaveningLog(user.id).catch((err) => { console.error('Davening log unavailable:', err); return []; }),
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

  body.append(renderDaveningCard(user, daveningLog, () => renderLoggedIn(body, user)));
  body.append(renderProgressCard(progress));
  body.append(renderAddEntryCard(user, individual, () => renderLoggedIn(body, user)));
  body.append(renderLogCard(log, byId, () => renderLoggedIn(body, user)));
}

// Deliberately tiny -- a row of toggles, not a form. "Who can lead
// Shabbat Shacharit" for a gabbai is just "who has ever toggled this on"
// (see computeDavenersByRole in data.js), so this is the whole feature.
function renderDaveningCard(user, daveningLog, onChanged) {
  const loggedByRole = new Map(daveningLog.map((e) => [e.role, e.id]));
  const group = el('div', { class: 'toggle-group' });
  const status = el('p', { class: 'muted small' }, '');
  for (const role of DAVENING_ROLES) {
    const logged = loggedByRole.has(role.key);
    const btn = el('button', {
      class: `toggle-btn ${logged ? 'active' : ''}`, type: 'button',
      title: logged ? "You've led this — click to remove" : "Mark that you've led this",
    }, role.label);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = '';
      status.className = 'muted small';
      try {
        if (loggedByRole.has(role.key)) await removeDaveningLogEntry(loggedByRole.get(role.key));
        else await addDaveningLogEntry(user.id, role.key);
        onChanged(); // only re-render (which rebuilds this card fresh) on success -- otherwise the error message below would get wiped out immediately
      } catch (err) {
        console.error(err);
        status.textContent = err.message.includes('does not exist')
          ? "This feature needs a database update -- see the app's README (db/schema.sql) for the one-time setup step."
          : err.message;
        status.className = 'error small';
        btn.disabled = false;
      }
    });
    group.append(btn);
  }
  return el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Davening you can lead'),
    el('p', { class: 'muted small' }, "Tap any you've led before — gabbaim in your minyanim can see who to ask."),
    group,
    status,
  ]);
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

  // Live preview only -- doesn't touch the fields themselves, so a user who
  // knows their reading actually fell right around Rosh Hashanah can still
  // type the other year exactly rather than getting the approximation.
  const yearHint = el('p', { class: 'muted small' }, '');
  function updateYearHint() {
    const { yearHebrew: heb, yearGregorian: greg } = deriveYears(yearHebrew.value, yearGregorian.value ? Number(yearGregorian.value) : null);
    if (yearGregorian.value && !yearHebrew.value) yearHint.textContent = `≈ Hebrew year ${heb}`;
    else if (yearHebrew.value && !yearGregorian.value && greg) yearHint.textContent = `≈ ${greg}`;
    else yearHint.textContent = '';
  }
  yearHebrew.addEventListener('input', updateYearHint);
  yearGregorian.addEventListener('input', updateYearHint);

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      // Only one entry can be the bar mitzvah parsha -- clear any earlier
      // one first so checking this box always replaces it, never adds a second.
      if (barMitzvah.checked) await clearBarMitzvahFlag(user.id);
      const { yearHebrew: heb, yearGregorian: greg } = deriveYears(
        yearHebrew.value, yearGregorian.value ? Number(yearGregorian.value) : null
      );
      await addLeiningLogEntry(user.id, {
        parshaId: parshaSelect.value,
        aliyahKey: aliyahSelect.value,
        yearHebrew: heb,
        yearGregorian: greg,
        isBarMitzvah: barMitzvah.checked,
      });
      status.textContent = 'Logged!';
      onSaved();
    },
  }, [
    el('div', { class: 'search-row' }, [parshaSelect, aliyahSelect]),
    el('div', { class: 'search-row' }, [yearHebrew, yearGregorian]),
    yearHint,
    el('label', { class: 'checkbox-label' }, [barMitzvah, ' This was my bar mitzvah parsha (replaces any previous one)']),
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
  // Group by parsha so logging several aliyot of the same parsha shows up
  // as one block listing them together, not a separate row repeating the
  // parsha name each time.
  const byParsha = new Map();
  for (const entry of log) {
    if (!byParsha.has(entry.parsha_id)) byParsha.set(entry.parsha_id, []);
    byParsha.get(entry.parsha_id).push(entry);
  }
  const list = el('div', { class: 'log-list' });
  for (const [parshaId, entries] of byParsha) {
    const p = byId.get(parshaId);
    entries.sort((a, b) => aliyahSortKey(a.aliyah_key) - aliyahSortKey(b.aliyah_key));
    const group = el('div', { class: 'log-group' }, [
      el('div', { class: 'log-parsha' }, p ? displayParshaName(p.englishName || p.id) : parshaId),
    ]);
    for (const entry of entries) {
      const { yearHebrew: heb, yearGregorian: greg } = deriveYears(entry.year_hebrew, entry.year_gregorian);
      const years = [heb, greg].filter(Boolean).join(' / ');
      group.append(el('div', { class: 'log-group-aliyah' }, [
        el('div', {}, [
          el('span', {}, aliyahLabel(entry.aliyah_key)),
          entry.is_bar_mitzvah ? el('span', { class: 'tag' }, 'Bar Mitzvah') : null,
          years ? el('span', { class: 'muted small' }, ` · ${years}`) : null,
        ]),
        el('button', {
          class: 'btn-share', type: 'button', title: 'Remove',
          onclick: async () => { await removeLeiningLogEntry(entry.id); onChanged(); },
        }, '✕'),
      ]));
    }
    list.append(group);
  }
  card.append(list);
  return card;
}
