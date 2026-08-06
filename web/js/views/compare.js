import { el, scoreColor, scoreColorBg, scoreLabel, displayParshaName } from '../util.js';
import { listScoredParshiot, getParshaDetail } from '../data.js';
import { renderParshaDetail } from './detail.js';

const COLUMNS = [
  { key: 'parshaFinalScore', label: 'Final', path: (p) => p.parshaFinalScore },
  { key: 'length', label: 'Length', path: (p) => p.parshaScores.length },
  { key: 'vocabulary', label: 'Vocab', path: (p) => p.parshaScores.vocabulary },
  { key: 'trope', label: 'Trope', path: (p) => p.parshaScores.trope },
  { key: 'repetition', label: 'Repeat.', path: (p) => p.parshaScores.repetition },
  { key: 'hiddenChallenges', label: 'Hidden', path: (p) => p.parshaScores.hiddenChallenges },
];

let sortKey = 'parshaFinalScore';
let sortDir = -1; // hardest first
let expandedId = null;

export async function renderCompare(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'Compare Parshiot'),
    el('p', { class: 'muted' }, 'Sort every parsha by difficulty, or line two up side by side.'),
  ]));

  const all = await listScoredParshiot();

  container.append(buildSideBySide(all));

  const tableHost = el('div', { class: 'card' });
  container.append(tableHost);

  function draw() {
    tableHost.innerHTML = '';
    const sorted = [...all].sort((a, b) => {
      const col = COLUMNS.find((c) => c.key === sortKey);
      return (col.path(a) - col.path(b)) * sortDir;
    });
    const table = el('table', { class: 'compare-table' });
    const thead = el('thead');
    const headRow = el('tr', {}, [
      el('th', {}, '#'),
      el('th', {}, 'Parsha'),
      ...COLUMNS.map((c) => sortableHeader(c)),
    ]);
    thead.append(headRow);
    table.append(thead);
    const tbody = el('tbody');
    sorted.forEach((p, i) => {
      const row = el('tr', { class: 'compare-row', onclick: () => toggleExpand(p.parshaId, tbody, row) });
      row.append(el('td', { class: 'muted' }, String(i + 1)));
      row.append(el('td', { class: 'parsha-cell' }, displayParshaName(p.parshaId)));
      for (const c of COLUMNS) {
        const val = c.path(p);
        row.append(el('td', {}, el('span', {
          class: 'score-pill',
          style: `color:${scoreColor(val)}; background:${scoreColorBg(val)}`,
        }, String(val))));
      }
      tbody.append(row);
    });
    table.append(tbody);
    tableHost.append(table);
  }

  function sortableHeader(col) {
    const active = sortKey === col.key;
    const arrow = active ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
    return el('th', {
      class: `sortable ${active ? 'active' : ''}`,
      onclick: () => {
        if (sortKey === col.key) sortDir *= -1; else { sortKey = col.key; sortDir = -1; }
        draw();
      },
    }, col.label + arrow);
  }

  async function toggleExpand(id, tbody, row) {
    const existing = tbody.querySelector('.expand-row');
    if (existing) existing.remove();
    if (expandedId === id) { expandedId = null; return; }
    expandedId = id;
    const tr = el('tr', { class: 'expand-row' });
    const td = el('td', { colspan: String(2 + COLUMNS.length) });
    td.append(el('p', { class: 'muted' }, 'Loading…'));
    tr.append(td);
    row.after(tr);
    const detail = await getParshaDetail(id);
    td.innerHTML = '';
    if (detail) td.append(renderParshaDetail(detail, { eyebrow: 'Parsha detail' }));
  }

  draw();
}

function buildSideBySide(all) {
  const wrap = el('div', { class: 'card subcard' });
  wrap.append(el('h3', {}, 'Side-by-side'));
  const options = all
    .slice()
    .sort((a, b) => a.parshaId.localeCompare(b.parshaId))
    .map((p) => el('option', { value: p.parshaId }, displayParshaName(p.parshaId)));

  const selA = el('select', { class: 'text-input' }, options.map((o) => o.cloneNode(true)));
  const selB = el('select', { class: 'text-input' }, options.map((o) => o.cloneNode(true)));
  selA.value = all[0] && all[0].parshaId;
  selB.value = all[1] && all[1].parshaId;
  const resultHost = el('div', { class: 'sbs-result' });
  const btn = el('button', { class: 'btn-primary', onclick: () => draw() }, 'Compare');

  function draw() {
    resultHost.innerHTML = '';
    const pa = all.find((p) => p.parshaId === selA.value);
    const pb = all.find((p) => p.parshaId === selB.value);
    if (!pa || !pb) return;
    resultHost.append(sbsColumn(pa), sbsColumn(pb));
  }

  wrap.append(
    el('div', { class: 'search-row' }, [selA, el('span', { class: 'vs' }, 'vs'), selB, btn]),
    resultHost,
  );
  draw();
  return wrap;
}

function sbsColumn(p) {
  const col = el('div', { class: 'sbs-col' });
  col.append(el('h4', {}, displayParshaName(p.parshaId)));
  col.append(el('div', {
    class: 'badge badge-lg',
    style: `color:${scoreColor(p.parshaFinalScore)}; background:${scoreColorBg(p.parshaFinalScore)}; border-color:${scoreColor(p.parshaFinalScore)}33`,
  }, `${p.parshaFinalScore} · ${scoreLabel(p.parshaFinalScore)}`));
  for (const c of COLUMNS.slice(1)) {
    const val = c.path(p);
    col.append(el('div', { class: 'minibar-row' }, [
      el('span', { class: 'minibar-label' }, c.label),
      el('div', { class: 'minibar-track' }, [
        el('div', { class: 'minibar-fill', style: `width:${Math.max(4, val * 10)}%; background:${scoreColor(val)}` }),
      ]),
      el('span', { class: 'minibar-value' }, String(val)),
    ]));
  }
  return col;
}
