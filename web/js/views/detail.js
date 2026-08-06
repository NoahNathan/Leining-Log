import { el, citeRange, displayParshaName, scoreColor, scoreColorBg, scoreLabel } from '../util.js';

function scoreBadge(score, { size = 'md' } = {}) {
  return el('span', {
    class: `badge badge-${size}`,
    style: `color:${scoreColor(score)}; background:${scoreColorBg(score)}; border-color:${scoreColor(score)}33`,
  }, [`${score.toFixed ? (Number.isInteger(score) ? score : score.toFixed(1)) : score}`, ' · ', scoreLabel(score)]);
}

function miniBar(label, score) {
  const pct = Math.max(4, (score / 10) * 100);
  return el('div', { class: 'minibar-row' }, [
    el('span', { class: 'minibar-label' }, label),
    el('div', { class: 'minibar-track' }, [
      el('div', { class: 'minibar-fill', style: `width:${pct}%; background:${scoreColor(score)}` }),
    ]),
    el('span', { class: 'minibar-value' }, String(score)),
  ]);
}

function nusachRow(nusach) {
  if (!nusach) return el('p', { class: 'muted' }, 'No haftarah data.');
  const entries = Object.entries(nusach).filter(([, v]) => v);
  const wrap = el('div', { class: 'nusach-tabs' });
  for (const [name, v] of entries) {
    const text = v.sameAs ? `Same as ${v.sameAs}` : citeRange(v);
    wrap.append(el('div', { class: 'nusach-chip' }, [
      el('span', { class: 'nusach-name' }, name[0].toUpperCase() + name.slice(1)),
      el('span', { class: 'nusach-cite' }, text),
    ]));
  }
  return wrap;
}

export function renderAliyahTable(aliyot, { maftir, difficultyAliyot } = {}) {
  const table = el('table', { class: 'aliyah-table' });
  const thead = el('thead', {}, el('tr', {}, [
    el('th', {}, '#'), el('th', {}, 'Verses'), el('th', {}, 'Count'),
    el('th', {}, 'Difficulty'), el('th', {}, ''),
  ]));
  table.append(thead);
  const tbody = el('tbody');
  const byNum = new Map((difficultyAliyot || []).map((a) => [String(a.aliyah), a]));
  for (const a of aliyot) {
    const d = byNum.get(String(a.aliyah));
    const row = el('tr');
    row.append(el('td', { class: 'aliyah-num' }, aliyahLabel(a.aliyah)));
    row.append(el('td', {}, citeRange(a)));
    row.append(el('td', { class: 'muted' }, `${a.verses}v`));
    row.append(el('td', {}, d ? scoreBadge(d.finalScore, { size: 'sm' }) : '—'));
    const noteText = a.specialTrope || (d && d.note) || '';
    row.append(el('td', { class: 'aliyah-note' }, noteText));
    tbody.append(row);
  }
  table.append(tbody);
  if (maftir) {
    const maftirDifficulty = byNum.get('M');
    const foot = el('div', { class: 'maftir-line' }, [
      el('strong', {}, 'Maftir: '), citeRange(maftir),
      maftir.reason ? el('span', { class: 'tag' }, maftir.reason) : null,
      maftirDifficulty ? scoreBadge(maftirDifficulty.finalScore, { size: 'sm' }) : null,
    ]);
    return el('div', {}, [table, foot]);
  }
  return table;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// aliyah keys are 'M' for maftir, otherwise a number (or numeric string)
function aliyahLabel(key) {
  return key === 'M' ? 'Maftir' : ordinal(Number(key));
}

export function renderParshaDetail({ parsha, haftarah, difficulty }, opts = {}) {
  const card = el('div', { class: 'card detail-card' });

  const header = el('div', { class: 'detail-header' }, [
    el('div', {}, [
      el('div', { class: 'eyebrow' }, opts.eyebrow || 'Parashat HaShavua'),
      el('h2', {}, displayParshaName(parsha.englishName || parsha.id)),
      el('div', { class: 'hebrew-name' }, parsha.hebrewName || ''),
      el('div', { class: 'torah-range' }, parsha.torahRange),
    ]),
    difficulty ? el('div', { class: 'header-score' }, [
      scoreBadge(difficulty.parshaFinalScore, { size: 'lg' }),
      el('div', { class: 'muted small' }, 'overall difficulty'),
    ]) : null,
  ]);
  card.append(header);

  if (parsha.combined) {
    card.append(el('div', { class: 'notice' }, `Combined reading (${parsha.componentParshiot ? parsha.componentParshiot.join(' + ') : 'double parsha'}). Aliyot below reflect the divisions used when read together.`));
  }

  const stats = el('div', { class: 'stat-grid' }, [
    stat('Aliyot', parsha.aliyot.length),
    stat('Total verses', parsha.totalVerses),
    stat('Avg / aliyah', parsha.avgAliyahVerses),
    stat('Longest aliyah', ordinal(parsha.longestAliyah)),
    stat('Shortest aliyah', ordinal(parsha.shortestAliyah)),
  ]);
  card.append(stats);

  if (difficulty) {
    const bars = el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Difficulty breakdown'),
      miniBar('Length', difficulty.parshaScores.length),
      miniBar('Vocabulary', difficulty.parshaScores.vocabulary),
      miniBar('Trope', difficulty.parshaScores.trope),
      miniBar('Repetition', difficulty.parshaScores.repetition),
      miniBar('Hidden challenges', difficulty.parshaScores.hiddenChallenges),
    ]);
    card.append(bars);
    if (difficulty.hardestAliyah) {
      card.append(el('p', { class: 'muted small' }, `Hardest aliyah: ${aliyahLabel(difficulty.hardestAliyah)}. Easiest: ${aliyahLabel(difficulty.easiestAliyah)}.`));
    }
  }

  const tropeNotes = parsha.aliyot.filter((a) => a.specialTrope).map((a) => `Aliyah ${a.aliyah}: ${a.specialTrope}`);
  if (tropeNotes.length) {
    card.append(el('div', { class: 'card subcard notes-card' }, [
      el('h3', {}, 'Interesting / special-trope notes'),
      ...tropeNotes.map((t) => el('p', { class: 'note-line' }, t)),
    ]));
  }

  card.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Aliyot'),
    renderAliyahTable(parsha.aliyot, { maftir: parsha.maftir, difficultyAliyot: difficulty && difficulty.aliyot }),
  ]));

  card.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Haftarah by nusach'),
    nusachRow(haftarah ? haftarah.nusach : null),
  ]));

  return card;
}

function stat(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value' }, String(value)),
    el('div', { class: 'stat-label' }, label),
  ]);
}

export function renderChagDetail(chag) {
  const card = el('div', { class: 'card detail-card' });
  const difficulty = chag.difficulty || null;
  card.append(el('div', { class: 'detail-header' }, [
    el('div', {}, [
      el('div', { class: 'eyebrow' }, chag.region === 'israel' ? 'Israel' : 'Diaspora'),
      el('h2', {}, chag.name),
      el('div', { class: 'torah-range' }, chag.summary || ''),
    ]),
    difficulty ? el('div', { class: 'header-score' }, [
      scoreBadge(difficulty.finalScore, { size: 'lg' }),
      el('div', { class: 'muted small' }, 'overall difficulty'),
    ]) : null,
  ]));
  if (chag.specialTrope) {
    card.append(el('div', { class: 'card subcard notes-card' }, [
      el('h3', {}, 'Special trope / custom'),
      el('p', { class: 'note-line' }, chag.specialTrope),
    ]));
  }
  if (difficulty) {
    const bars = el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Difficulty breakdown'),
      miniBar('Length', difficulty.scores.length),
      miniBar('Vocabulary', difficulty.scores.vocabulary),
      miniBar('Trope', difficulty.scores.trope),
      miniBar('Repetition', difficulty.scores.repetition),
      miniBar('Hidden challenges', difficulty.scores.hiddenChallenges),
    ]);
    card.append(bars);
    if (difficulty.aliyot.length > 1) {
      card.append(el('p', { class: 'muted small' }, `Hardest: ${aliyahLabel(difficulty.hardestAliyah)}. Easiest: ${aliyahLabel(difficulty.easiestAliyah)}.`));
    }
  }
  if (chag.aliyot && chag.aliyot.length) {
    card.append(el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Aliyot'),
      renderAliyahTable(chag.aliyot, { maftir: chag.maftir, difficultyAliyot: difficulty && difficulty.aliyot }),
    ]));
  } else if (chag.maftir) {
    card.append(el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Maftir only'),
      renderAliyahTable([{ aliyah: 'M', ...chag.maftir }], { difficultyAliyot: difficulty && difficulty.aliyot }),
    ]));
  }
  card.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Haftarah by nusach'),
    nusachRow(chag.nusach),
  ]));
  return card;
}
