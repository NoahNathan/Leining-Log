import { el, todayISO, formatDateLong, displayParshaName } from '../util.js';
import { findByDate, getParshaDetail, getChagById, getChagim, listAllParshiotForSearch, getAliyahSummaries } from '../data.js';
import { renderParshaDetail, renderChagDetail } from './detail.js';

let mode = 'parsha';
let region = 'diaspora';

const BOOK_ORDER = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

const CHAG_CATEGORIES = [
  { label: 'Rosh Hashana & Yom Kippur', test: (n) => /^(Rosh Hashana|Yom Kippur)/.test(n) },
  { label: 'Sukkot & Simchat Torah', test: (n) => /^(Sukkot|Shmini Atzeret|Simchat Torah)/.test(n) },
  { label: 'Chanukah', test: (n) => /^Chanukah/.test(n) },
  { label: 'Purim', test: (n) => /^(Purim|Shushan Purim|Ta'anit Esther)/.test(n) },
  { label: 'Pesach', test: (n) => /^Pesach/.test(n) },
  { label: 'Shavuot', test: (n) => /^Shavuot/.test(n) },
  { label: 'Fast Days', test: (n) => /^(Tzom|Asara|Tish'a)/.test(n) },
  { label: 'Special Shabbatot', test: (n) => /^Shabbat/.test(n) },
  { label: 'Rosh Chodesh', test: (n) => /^Rosh Chodesh/.test(n) },
  { label: 'Other', test: () => true },
];

function parshaNumOf(p) {
  return Array.isArray(p.parshaNum) ? p.parshaNum[0] : p.parshaNum;
}

export async function renderSearch(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'Search'),
    el('p', { class: 'muted' }, 'Browse and click any parsha or holiday, or look up a specific calendar date.'),
  ]));

  const modeToggle = el('div', { class: 'toggle-group' }, [
    modeBtn('By parsha', 'parsha'),
    modeBtn('By date', 'date'),
  ]);
  const regionToggle = el('div', { class: 'toggle-group' }, [
    regionBtn('Diaspora', 'diaspora'),
    regionBtn('Israel', 'israel'),
  ]);
  const controls = el('div', { class: 'controls-row' }, [modeToggle, regionToggle]);
  container.append(controls);

  const formHost = el('div', { class: 'search-form' });
  const resultsHost = el('div', { class: 'view-body' });
  container.append(formHost, resultsHost);

  function modeBtn(label, value) {
    return el('button', {
      class: `toggle-btn ${mode === value ? 'active' : ''}`,
      onclick: () => { mode = value; refreshForm(); },
    }, label);
  }
  function regionBtn(label, value) {
    return el('button', {
      class: `toggle-btn ${region === value ? 'active' : ''}`,
      onclick: () => {
        region = value;
        syncToggle(regionToggle, label);
        if (mode === 'date') runDateSearch(currentDateValue());
        else refreshForm();
      },
    }, label);
  }
  function syncToggle(group, activeLabel) {
    [...group.children].forEach((c) => c.classList.toggle('active', c.textContent === activeLabel));
  }

  let dateInputRef = null;
  function currentDateValue() {
    return dateInputRef ? dateInputRef.value : todayISO();
  }

  function refreshForm() {
    syncToggle(modeToggle, mode === 'date' ? 'By date' : 'By parsha');
    // Diaspora/Israel only affects which calendar date maps to which
    // reading -- the parsha/festival browse grid is the same regardless of
    // region, so the toggle would just be a no-op distraction there.
    regionToggle.style.display = mode === 'date' ? '' : 'none';
    formHost.innerHTML = '';
    resultsHost.innerHTML = '';
    if (mode === 'date') {
      const input = el('input', { type: 'date', class: 'text-input', value: todayISO() });
      dateInputRef = input;
      const btn = el('button', { class: 'btn-primary', onclick: () => runDateSearch(input.value) }, 'Look up date');
      formHost.append(el('div', { class: 'search-row' }, [input, btn]));
      runDateSearch(input.value);
    } else {
      resultsHost.append(el('p', { class: 'muted' }, 'Loading…'));
      renderBrowser();
    }
  }

  async function runDateSearch(dateISO) {
    resultsHost.innerHTML = '';
    if (!dateISO) return;
    resultsHost.append(el('p', { class: 'muted' }, 'Loading…'));
    const rows = await findByDate(dateISO, region);
    resultsHost.innerHTML = '';
    if (rows.length === 0) {
      resultsHost.append(el('p', {}, `No Shabbat/chag reading stored for ${formatDateLong(dateISO)} (${region}). It may be a regular weekday.`));
      return;
    }
    for (const row of rows) {
      if (row.type === 'parsha') {
        const detail = await getParshaDetail(row.parshaId);
        if (detail) {
          const banner = el('div', { class: 'date-banner' }, [
            el('span', { class: 'date-banner-date' }, formatDateLong(row.date)),
            row.specialReading ? el('span', { class: 'tag' }, Object.values(row.specialReading)[0]) : null,
          ]);
          resultsHost.append(banner, renderParshaDetail(detail, { eyebrow: 'Parashat HaShavua' }));
        }
      } else {
        const chag = await getChagById(row.chagId);
        if (chag) resultsHost.append(renderChagDetail(chag, { summaries: await getAliyahSummaries() }));
      }
    }
  }

  async function renderBrowser() {
    const [allParshiot, allChagim] = await Promise.all([listAllParshiotForSearch(), getChagim()]);
    resultsHost.innerHTML = '';

    const browser = el('div', { class: 'card parsha-browser' });
    for (const book of BOOK_ORDER) {
      const inBook = allParshiot.filter((p) => p.book === book).sort((a, b) => parshaNumOf(a) - parshaNumOf(b));
      if (!inBook.length) continue;
      browser.append(el('h3', { class: 'book-heading' }, book));
      browser.append(el('div', { class: 'parsha-grid' }, inBook.map(parshaChip)));
    }
    resultsHost.append(browser);
    resultsHost.append(buildChagBrowser(allChagim));
  }

  function buildChagBrowser(allChagim) {
    const withReading = allChagim.filter((c) => (c.aliyot && c.aliyot.length) || c.maftir);
    const byName = new Map();
    for (const c of withReading) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    }
    const wrap = el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Festivals, fasts & special readings'),
      el('p', { class: 'muted small' }, 'Holidays, fast days, Rosh Chodesh, and special-Shabbat Torah readings.'),
    ]);
    const claimed = new Set();
    for (const cat of CHAG_CATEGORIES) {
      const names = [...byName.keys()].filter((n) => !claimed.has(n) && cat.test(n));
      if (!names.length) continue;
      names.forEach((n) => claimed.add(n));
      wrap.append(el('h3', { class: 'book-heading' }, cat.label));
      wrap.append(el('div', { class: 'parsha-grid' }, names.map((n) => chagChip(n, byName.get(n)))));
    }
    return wrap;
  }

  function chagChip(name, entries) {
    const preferred = entries.find((c) => c.region === region) || entries[0];
    return el('a', { href: `#chag/${encodeURIComponent(preferred.id)}`, class: 'chag-chip' }, name);
  }

  function parshaChip(p) {
    return el('a', {
      href: `#parsha/${encodeURIComponent(p.id)}`,
      class: `parsha-chip${p.combinedEntry ? ' combined-chip' : ''}`,
      title: p.combinedEntry ? 'Combined (double) parsha' : '',
    }, displayParshaName(p.englishName || p.id));
  }

  refreshForm();
}
