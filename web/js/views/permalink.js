import { el, todayISO, formatDateLong } from '../util.js';
import { getParshaDetail, getChagById, findUpcomingOccurrences, getAliyahSummaries } from '../data.js';
import { renderParshaDetail, renderChagDetail } from './detail.js';

function backLink() {
  return el('a', { href: '#search', class: 'back-link' }, '← Back to search');
}

export async function renderParshaPermalink(container, id, region = 'diaspora') {
  container.innerHTML = '';
  container.append(backLink(), el('p', { class: 'muted' }, 'Loading…'));
  const detail = await getParshaDetail(id);
  container.innerHTML = '';
  container.append(backLink());
  if (!detail) {
    container.append(el('p', {}, `Couldn't find a parsha called "${id}".`));
    return;
  }
  container.append(renderParshaDetail(detail, { eyebrow: 'Parsha lookup' }));
  const upcoming = await findUpcomingOccurrences(id, region, todayISO(), 3);
  if (upcoming.length) {
    container.append(el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Next occurrences'),
      el('ul', { class: 'plain-list' }, upcoming.map((r) => el('li', {}, formatDateLong(r.date)))),
    ]));
  }
}

export async function renderChagPermalink(container, id) {
  container.innerHTML = '';
  container.append(backLink(), el('p', { class: 'muted' }, 'Loading…'));
  const chag = await getChagById(id);
  container.innerHTML = '';
  container.append(backLink());
  if (!chag) {
    container.append(el('p', {}, `Couldn't find that reading.`));
    return;
  }
  container.append(renderChagDetail(chag, { summaries: await getAliyahSummaries() }));
}
