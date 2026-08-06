import { el, todayISO, formatDateLong, displayParshaName } from '../util.js';
import { findByDate, getParshaDetail, getChagById, listAllParshiotForSearch, findUpcomingOccurrences } from '../data.js';
import { renderParshaDetail, renderChagDetail } from './detail.js';

let mode = 'date';
let region = 'diaspora';

export async function renderSearch(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'Search'),
    el('p', { class: 'muted' }, 'Look up a specific calendar date, or jump straight to a parsha.'),
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

  const allParshiot = await listAllParshiotForSearch();
  const datalist = el('datalist', { id: 'parsha-options' });
  const nameToId = new Map();
  for (const p of allParshiot.sort((a, b) => a.parshaNum > b.parshaNum ? 1 : -1)) {
    const label = displayParshaName(p.englishName || p.id);
    nameToId.set(label, p.id);
    datalist.append(el('option', { value: label }));
  }
  document.body.append(datalist);

  function modeBtn(label, value) {
    return el('button', {
      class: `toggle-btn ${mode === value ? 'active' : ''}`,
      onclick: () => { mode = value; refreshForm(); },
    }, label);
  }
  function regionBtn(label, value) {
    return el('button', {
      class: `toggle-btn ${region === value ? 'active' : ''}`,
      onclick: () => { region = value; syncToggle(regionToggle, label); },
    }, label);
  }
  function syncToggle(group, activeLabel) {
    [...group.children].forEach((c) => c.classList.toggle('active', c.textContent === activeLabel));
  }

  function refreshForm() {
    syncToggle(modeToggle, mode === 'date' ? 'By date' : 'By parsha');
    formHost.innerHTML = '';
    resultsHost.innerHTML = '';
    if (mode === 'date') {
      const input = el('input', { type: 'date', class: 'text-input', value: todayISO() });
      const btn = el('button', { class: 'btn-primary', onclick: () => runDateSearch(input.value) }, 'Look up date');
      formHost.append(el('div', { class: 'search-row' }, [input, btn]));
      runDateSearch(input.value);
    } else {
      const input = el('input', {
        type: 'text', class: 'text-input', list: 'parsha-options',
        placeholder: 'Start typing a parsha name…',
      });
      const btn = el('button', {
        class: 'btn-primary',
        onclick: () => runParshaSearch(nameToId.get(input.value) || input.value),
      }, 'Look up parsha');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
      formHost.append(el('div', { class: 'search-row' }, [input, btn]));
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

  async function runParshaSearch(id) {
    resultsHost.innerHTML = '';
    if (!id) return;
    resultsHost.append(el('p', { class: 'muted' }, 'Loading…'));
    const detail = await getParshaDetail(id);
    resultsHost.innerHTML = '';
    if (!detail) {
      resultsHost.append(el('p', {}, `Couldn't find a parsha called "${id}". Pick one from the suggestions.`));
      return;
    }
    resultsHost.append(renderParshaDetail(detail, { eyebrow: 'Parsha lookup' }));
    const upcoming = await findUpcomingOccurrences(id, region, todayISO(), 3);
    if (upcoming.length) {
      resultsHost.append(el('div', { class: 'card subcard' }, [
        el('h3', {}, 'Next occurrences'),
        el('ul', { class: 'plain-list' }, upcoming.map((r) => el('li', {}, formatDateLong(r.date)))),
      ]));
    }
  }

  refreshForm();
}
