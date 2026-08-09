import { el, todayISO } from '../util.js';
import { findUpcomingParsha, findByDate } from '../data.js';
import { renderDateCards } from './detail.js';

let region = 'diaspora';

export async function renderHome(container) {
  container.innerHTML = '';
  const regionToggle = el('div', { class: 'toggle-group' }, [
    toggleBtn('Diaspora', 'diaspora'),
    toggleBtn('Israel', 'israel'),
  ]);
  const heading = el('div', { class: 'view-heading' }, [
    el('h1', {}, "This Week's Leining"),
    el('p', { class: 'muted' }, "Defaults to the upcoming Shabbat's parsha, aliyot, haftarah, and difficulty."),
  ]);
  const controls = el('div', { class: 'controls-row' }, [regionToggle]);
  const body = el('div', { class: 'view-body' }, [el('p', { class: 'muted' }, 'Loading…')]);
  container.append(heading, controls, body);

  async function load() {
    body.innerHTML = '';
    body.append(el('p', { class: 'muted' }, 'Loading…'));
    const today = todayISO();
    const row = await findUpcomingParsha(region, today);
    body.innerHTML = '';
    if (!row) {
      body.append(el('p', {}, 'Could not find an upcoming parsha in the stored calendar range.'));
      return;
    }
    // A special-Shabbat date can carry a second (holiday-type) calendar row
    // alongside the parsha itself -- e.g. Shabbat Shekalim's own maftir and
    // haftarah, which supersede Mishpatim's regular ones that week. Fetch
    // every row on this date, not just the parsha, so it actually shows.
    const rows = await findByDate(row.date, region);
    const cards = await renderDateCards(rows, {
      parshaEyebrow: 'Upcoming Parashat HaShavua',
      showDate: true,
      extraBanner: row.date === today ? [el('span', { class: 'tag tag-today' }, 'Today')] : [],
    });
    if (cards.length === 0) {
      body.append(el('p', {}, `No data found for ${row.parshaId}.`));
      return;
    }
    body.append(...cards);
  }

  function toggleBtn(label, value) {
    const btn = el('button', {
      class: `toggle-btn ${region === value ? 'active' : ''}`,
      onclick: async () => {
        region = value;
        [...regionToggle.children].forEach((c) => c.classList.toggle('active', c.textContent === label));
        await load();
      },
    }, label);
    return btn;
  }

  await load();
}
