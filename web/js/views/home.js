import { el, todayISO, formatDateLong, scoreColor, scoreColorBg, scoreLabel } from '../util.js';
import { findUpcomingParsha, findByDate, findHolidaysBefore, getChagById } from '../data.js';
import { renderDateCards } from './detail.js';

let region = 'diaspora';

function scoreBadge(score) {
  return el('span', {
    class: 'badge badge-sm',
    style: `color:${scoreColor(score)}; background:${scoreColorBg(score)}; border-color:${scoreColor(score)}33`,
  }, `${Number.isInteger(score) ? score : score.toFixed(1)} · ${scoreLabel(score)}`);
}

// A midweek Yom Tov, fast day, or Rosh Chodesh between today and the
// upcoming Shabbat is easy to miss if the home page only ever shows the
// next parsha -- this surfaces it as a compact heads-up, not the full
// reading (that's one tap away via the link).
async function renderUpcomingHolidays(holidayRows) {
  if (!holidayRows.length) return null;
  const chags = await Promise.all(holidayRows.map((r) => getChagById(r.chagId)));
  const list = el('div', { class: 'log-list' });
  holidayRows.forEach((row, i) => {
    const chag = chags[i];
    const score = chag && chag.difficulty ? chag.difficulty.finalScore : null;
    list.append(el('a', { href: `#chag/${encodeURIComponent(row.chagId)}`, class: 'log-row' }, [
      el('div', {}, [
        el('span', { class: 'log-parsha' }, row.name),
        el('span', { class: 'muted small' }, ` · ${formatDateLong(row.date)}`),
      ]),
      score != null ? scoreBadge(score) : null,
    ]));
  });
  return el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Before this Shabbat'),
    el('p', { class: 'muted small' }, 'A holiday, fast, or Rosh Chodesh reading falls before the upcoming parsha.'),
    list,
  ]);
}

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
    // findUpcomingParsha only returns the parsha row; fetch every row on
    // this date (findByDate) so renderDateCards can also pick up a Chol
    // HaMoed / independent-festival row on weeks where one applies -- a
    // special-Shabbat week like Shekalim has no second row at all, its
    // override lives directly on the parsha row's specialReading.
    const rows = await findByDate(row.date, region);
    const holidaysBefore = await findHolidaysBefore(region, today, row.date);
    const holidayBox = await renderUpcomingHolidays(holidaysBefore);
    const cards = await renderDateCards(rows, {
      parshaEyebrow: 'Upcoming Parashat HaShavua',
      showDate: true,
      extraBanner: row.date === today ? [el('span', { class: 'tag tag-today' }, 'Today')] : [],
    });
    if (cards.length === 0) {
      body.append(el('p', {}, `No data found for ${row.parshaId}.`));
      return;
    }
    if (holidayBox) body.append(holidayBox);
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
