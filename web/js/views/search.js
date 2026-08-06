import { el, todayISO, formatDateLong, displayParshaName } from '../util.js';
import { findByDate, getParshaDetail, getChagById, listAllParshiotForSearch } from '../data.js';
import { renderParshaDetail, renderChagDetail } from './detail.js';

let mode = 'date';
let region = 'diaspora';

const BOOK_ORDER = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

export async function renderSearch(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'Search'),
    el('p', { class: 'muted' }, 'Look up a specific calendar date, or browse and click any parsha.'),
  ]));

  const modeToggle = el('div', { class: 'toggle-group' }, [
    modeBtn('By date', 'date'),
    modeBtn('By parsha', 'parsha'),
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
      onclick: () => { region = value; syncToggle(regionToggle, label); if (mode === 'date') runDateSearch(currentDateValue()); },
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
    formHost.innerHTML = '';
    resultsHost.innerHTML = '';
    if (mode === 'date') {
      const input = el('input', { type: 'date', class: 'text-input', value: todayISO() });
      dateInputRef = input;
      const btn = el('button', { class: 'btn-primary', onclick: () => runDateSearch(input.value) }, 'Look up date');
      formHost.append(el('div', { class: 'search-row' }, [input, btn]));
      runDateSearch(input.value);
    } else {
      resultsHost.append(el('p', { class: 'muted' }, 'Loading parshiot…'));
      renderParshaBrowser();
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
        if (chag) resultsHost.append(renderChagDetail(chag));
      }
    }
  }

  async function renderParshaBrowser() {
    const all = await listAllParshiotForSearch();
    resultsHost.innerHTML = '';

    const individual = all.filter((p) => !p.combinedEntry).sort((a, b) => a.parshaNum - b.parshaNum);
    const combined = all.filter((p) => p.combinedEntry).sort((a, b) => a.parshaNum[0] - b.parshaNum[0]);

    const browser = el('div', { class: 'card parsha-browser' });
    for (const book of BOOK_ORDER) {
      const inBook = individual.filter((p) => p.book === book);
      if (!inBook.length) continue;
      browser.append(el('h3', { class: 'book-heading' }, book));
      browser.append(el('div', { class: 'parsha-grid' }, inBook.map(parshaChip)));
    }
    resultsHost.append(browser);

    if (combined.length) {
      const combinedCard = el('div', { class: 'card subcard' }, [
        el('h3', {}, 'Combined readings'),
        el('p', { class: 'muted small' }, 'Read together on one Shabbat in some years, with their own aliyah divisions.'),
        el('div', { class: 'parsha-grid' }, combined.map(parshaChip)),
      ]);
      resultsHost.append(combinedCard);
    }
  }

  function parshaChip(p) {
    return el('a', { href: `#parsha/${encodeURIComponent(p.id)}`, class: 'parsha-chip' }, displayParshaName(p.englishName || p.id));
  }

  refreshForm();
}
