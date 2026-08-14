import { el, displayParshaName, gregorianToHebrewYear, hebrewToGregorianYear, scoreColor, scoreColorBg, scoreLabel } from '../util.js';
import { isConfigured, signUp, signInWithPassword, signOut, onAuthChange } from '../auth.js';
import {
  listAllParshiotForSearch, clearBarMitzvahFlag,
  getMyLeiningLog, addLeiningLogEntry, removeLeiningLogEntry, computeTorahProgress,
  DAVENING_ROLES, getMyDaveningLog, addDaveningLogEntry, removeDaveningLogEntry,
  getParshaTypicalMonths, getDifficulty,
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
// Individual parshiot have a plain parshaNum; combined ones (Vayakhel-Pekudei
// etc.) carry both component numbers as a pair -- the first one is what
// "Torah order" means for a combined reading.
function parshaSortNum(p) {
  if (!p) return 999;
  return Array.isArray(p.parshaNum) ? p.parshaNum[0] : p.parshaNum;
}
function scoreBadge(score) {
  return el('span', {
    class: 'badge badge-sm',
    style: `color:${scoreColor(score)}; background:${scoreColorBg(score)}; border-color:${scoreColor(score)}33`,
  }, `${Number.isInteger(score) ? score : score.toFixed(1)} · ${scoreLabel(score)}`);
}
// 'ALL' entries use the parsha's own composite score; specific aliyot
// (including 'M' for maftir) are scored individually -- both live in the
// same aliyot array in difficulty-scores.json.
function difficultyForEntry(difficultyEntry, aliyahKey) {
  if (!difficultyEntry) return null;
  if (aliyahKey === 'ALL') return difficultyEntry.parshaFinalScore;
  const a = difficultyEntry.aliyot.find((x) => String(x.aliyah) === aliyahKey);
  return a ? a.finalScore : null;
}

// Fills in whichever year is missing from the other, via the Hebrew-calendar
// correspondence in util.js -- so an entry always shows both once one is
// known, whether the user typed only one or an older row only ever had one.
// gregorianMonth (1-12, optional) makes the Gregorian->Hebrew direction
// exact by splitting at the real Rosh Hashanah date instead of guessing;
// without it, this falls back to the same "most of this year" approximation
// as before.
function deriveYears(yearHebrew, yearGregorian, gregorianMonth) {
  let heb = yearHebrew || null;
  let greg = yearGregorian || null;
  if (greg && !heb) heb = String(gregorianToHebrewYear(greg, gregorianMonth));
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

  const [log, allParshiot, daveningLog, typicalMonths, difficulty] = await Promise.all([
    getMyLeiningLog(user.id), listAllParshiotForSearch(),
    // Isolated from the Promise.all above on purpose: davening_log is a
    // newer table than leining_log, so an account created before it was
    // added to schema.sql shouldn't have the whole My Leining page break
    // just because that one table doesn't exist in their project yet.
    getMyDaveningLog(user.id).catch((err) => { console.error('Davening log unavailable:', err); return []; }),
    getParshaTypicalMonths(),
    getDifficulty(),
  ]);
  const progress = await computeTorahProgress(log);
  const individual = allParshiot.filter((p) => !p.combinedEntry).sort((a, b) => a.parshaNum - b.parshaNum);
  const byId = new Map(individual.map((p) => [p.id, p]));
  // Unlike byId above (individual parshiot only -- what the "Log a reading"
  // dropdown offers), the log itself can hold entries against a combined
  // parsha id (logged via quick-log on a combined reading's detail page), so
  // the log card gets its own lookup covering both.
  const byIdAll = new Map(allParshiot.map((p) => [p.id, p]));
  const difficultyById = new Map(difficulty.map((d) => [d.parshaId, d]));

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
  body.append(renderAddEntryCard(user, individual, typicalMonths, () => renderLoggedIn(body, user)));
  body.append(renderLogCard(log, byIdAll, difficultyById, () => renderLoggedIn(body, user)));
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

function renderAddEntryCard(user, individual, typicalMonths, onSaved) {
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
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // Rosh Hashanah (~September) splits any Gregorian year into two different
  // Hebrew years, so a month is what makes the derived Hebrew year exact
  // instead of an approximation (see gregorianToHebrewYear). Auto-filled
  // below from the parsha selected -- each one is read in essentially the
  // same Gregorian month every year (see gen_parsha_typical_month.mjs) -- so
  // this is usually already right; still editable for the rare correction.
  const yearMonth = el('select', { class: 'text-input' }, [
    el('option', { value: '' }, 'Month (for exact Hebrew year)'),
    ...MONTH_NAMES.map((m, i) => el('option', { value: String(i + 1) }, m)),
  ]);
  const barMitzvah = el('input', { type: 'checkbox' });
  const status = el('span', { class: 'muted small' }, '');

  function currentMonth() { return yearMonth.value ? Number(yearMonth.value) : undefined; }

  // Live preview only -- doesn't touch the fields themselves, so a user who
  // knows their reading actually fell right around Rosh Hashanah can still
  // type the other year exactly rather than getting the approximation.
  const yearHint = el('p', { class: 'muted small' }, '');
  function updateYearHint() {
    const month = currentMonth();
    const { yearHebrew: heb, yearGregorian: greg } = deriveYears(yearHebrew.value, yearGregorian.value ? Number(yearGregorian.value) : null, month);
    const approx = month ? '' : '≈ ';
    if (yearGregorian.value && !yearHebrew.value) yearHint.textContent = `${approx}Hebrew year ${heb}`;
    else if (yearHebrew.value && !yearGregorian.value && greg) yearHint.textContent = `≈ ${greg}`;
    else yearHint.textContent = '';
  }
  yearHebrew.addEventListener('input', updateYearHint);
  yearGregorian.addEventListener('input', updateYearHint);

  // Auto-fills the month from whichever parsha is currently selected, but
  // only until the user picks one themselves -- after that, switching
  // parshiot (e.g. logging several readings in a row) never overwrites
  // their own explicit choice.
  let monthManuallySet = false;
  function applyTypicalMonth() {
    if (monthManuallySet) return;
    const typical = typicalMonths[parshaSelect.value];
    yearMonth.value = typical ? String(typical) : '';
    updateYearHint();
  }
  yearMonth.addEventListener('change', () => { monthManuallySet = true; updateYearHint(); });
  parshaSelect.addEventListener('change', applyTypicalMonth);
  applyTypicalMonth();

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      // Only one entry can be the bar mitzvah parsha -- clear any earlier
      // one first so checking this box always replaces it, never adds a second.
      if (barMitzvah.checked) await clearBarMitzvahFlag(user.id);
      const { yearHebrew: heb, yearGregorian: greg } = deriveYears(
        yearHebrew.value, yearGregorian.value ? Number(yearGregorian.value) : null, currentMonth()
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
    el('div', { class: 'search-row' }, [yearHebrew, yearGregorian, yearMonth]),
    yearHint,
    el('label', { class: 'checkbox-label' }, [barMitzvah, ' This was my bar mitzvah parsha (replaces any previous one)']),
    el('div', { class: 'search-row' }, [el('button', { class: 'btn-primary', type: 'submit' }, 'Mark as leined'), status]),
  ]);

  return el('div', { class: 'card subcard' }, [el('h3', {}, 'Log a reading'), form]);
}

// Module-level so both survive a full "My Leining" re-render (e.g. after
// logging or removing an entry), not just clicks within one render pass.
let logSortMode = 'recent'; // 'recent' | 'most' | 'torah'
let showDifficultyInLog = false;

function renderLogCard(log, byId, difficultyById, onChanged) {
  const card = el('div', { class: 'card subcard' });
  if (!log.length) {
    card.append(el('h3', {}, 'Your log'), el('p', { class: 'muted small' }, 'Nothing logged yet -- add your first reading above.'));
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
  for (const entries of byParsha.values()) entries.sort((a, b) => aliyahSortKey(a.aliyah_key) - aliyahSortKey(b.aliyah_key));

  const sortSelect = el('select', { class: 'text-input' }, [
    el('option', { value: 'recent' }, 'Sort: most recently leined'),
    // "Leined the most" has no real repeat-count in the data -- logging is a
    // toggle per (parsha, aliyah), not a tally -- so this instead ranks by
    // how many distinct aliyot of a parsha are logged, i.e. how much of it
    // you've covered.
    el('option', { value: 'most' }, 'Sort: most aliyot logged'),
    el('option', { value: 'torah' }, 'Sort: Torah order'),
  ]);
  sortSelect.value = logSortMode;
  sortSelect.addEventListener('change', () => { logSortMode = sortSelect.value; renderList(); });

  const diffToggle = el('button', {
    class: `toggle-btn ${showDifficultyInLog ? 'active' : ''}`, type: 'button',
    title: 'Show each logged reading\'s difficulty rating',
  }, 'Show difficulty rating');
  diffToggle.addEventListener('click', () => {
    showDifficultyInLog = !showDifficultyInLog;
    diffToggle.classList.toggle('active', showDifficultyInLog);
    renderList();
  });

  card.append(el('div', { class: 'subcard-heading-row' }, [
    el('h3', {}, 'Your log'),
    el('div', { class: 'subcard-actions' }, [sortSelect, diffToggle]),
  ]));
  const list = el('div', { class: 'log-list' });
  card.append(list);

  function renderList() {
    list.innerHTML = '';
    const groups = [...byParsha.entries()];
    if (logSortMode === 'torah') {
      groups.sort((a, b) => parshaSortNum(byId.get(a[0])) - parshaSortNum(byId.get(b[0])));
    } else if (logSortMode === 'most') {
      groups.sort((a, b) => b[1].length - a[1].length);
    } else {
      const mostRecent = (entries) => entries.reduce((max, e) => (e.created_at > max ? e.created_at : max), entries[0].created_at);
      groups.sort((a, b) => (mostRecent(b[1]) > mostRecent(a[1]) ? 1 : -1));
    }

    for (const [parshaId, entries] of groups) {
      const p = byId.get(parshaId);
      const difficultyEntry = difficultyById.get(parshaId);
      const group = el('div', { class: 'log-group' }, [
        el('div', { class: 'log-parsha' }, p ? displayParshaName(p.englishName || p.id) : parshaId),
      ]);
      for (const entry of entries) {
        const { yearHebrew: heb, yearGregorian: greg } = deriveYears(entry.year_hebrew, entry.year_gregorian);
        const years = [heb, greg].filter(Boolean).join(' / ');
        const score = showDifficultyInLog ? difficultyForEntry(difficultyEntry, entry.aliyah_key) : null;
        group.append(el('div', { class: 'log-group-aliyah' }, [
          el('div', {}, [
            el('span', {}, aliyahLabel(entry.aliyah_key)),
            entry.is_bar_mitzvah ? el('span', { class: 'tag' }, 'Bar Mitzvah') : null,
            years ? el('span', { class: 'muted small' }, ` · ${years}`) : null,
            score != null ? scoreBadge(score) : null,
          ]),
          el('button', {
            class: 'btn-share', type: 'button', title: 'Remove',
            onclick: async () => { await removeLeiningLogEntry(entry.id); onChanged(); },
          }, '✕'),
        ]));
      }
      list.append(group);
    }
  }

  renderList();
  return card;
}
