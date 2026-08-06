import { el, citeRange, displayParshaName, scoreColor, scoreColorBg, scoreLabel } from '../util.js';

function scoreBadge(score, { size = 'md' } = {}) {
  return el('span', {
    class: `badge badge-${size}`,
    style: `color:${scoreColor(score)}; background:${scoreColorBg(score)}; border-color:${scoreColor(score)}33`,
  }, [`${score.toFixed ? (Number.isInteger(score) ? score : score.toFixed(1)) : score}`, ' · ', scoreLabel(score)]);
}

const CRITERION_TOOLTIPS = {
  Length: 'How many verses — the single biggest factor in the score.',
  Vocabulary: 'How rare and hard-to-pronounce the words are, based on real word-frequency data from the Torah.',
  Trope: 'How complex or unusual the cantillation (trop) is.',
  Repetition: 'Repeated, formulaic phrasing — this actually makes an aliyah easier, so a low score here helps.',
  Gotchas: 'Easy-to-fumble details that are not captured by length, vocab, trope, or repetition alone — similar-sounding names, numbers, or look-alike words.',
};

function miniBar(label, score) {
  const pct = Math.max(4, (score / 10) * 100);
  return el('div', { class: 'minibar-row' }, [
    el('span', { class: 'minibar-label', title: CRITERION_TOOLTIPS[label] || '' }, label),
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

function qualify(label, score) {
  if (label === 'Length') {
    if (score >= 8) return 'one of the longest aliyot in the leining';
    if (score >= 6) return 'longer than most aliyot';
    if (score >= 4) return 'about average length';
    return 'a short aliyah';
  }
  if (label === 'Vocabulary') {
    if (score >= 7) return 'several rare or hard-to-pronounce words';
    if (score >= 5) return 'some uncommon vocabulary';
    if (score >= 3) return 'mostly familiar words';
    return 'very familiar, common vocabulary';
  }
  if (label === 'Trope') {
    if (score >= 7) return 'complex, less-common cantillation patterns';
    if (score >= 5) return 'moderately varied trope';
    return 'straightforward, common trope patterns';
  }
  if (label === 'Repetition') {
    if (score <= 3) return 'repeated / formulaic phrasing — actually makes it easier to follow';
    if (score >= 7) return 'little repetition to lean on, so it is easy to lose your place';
    return 'some repeated structure';
  }
  if (label === 'Gotchas') {
    if (score >= 7) return 'several easy-to-fumble details (similar names, numbers, look-alike words)';
    if (score >= 4) return 'a few subtle traps';
    return 'not much to trip you up';
  }
  return '';
}

function wordChipRow(label, words) {
  return el('div', { class: 'why-words' }, [
    el('span', { class: 'why-words-label' }, label + ':'),
    el('div', { class: 'word-chips' }, words.map((w) => el('span', { class: 'word-chip' }, w))),
  ]);
}

function buildWhyPanel(d, a) {
  const wrap = el('div', { class: 'why-panel' });
  if (d.note) {
    wrap.append(el('p', { class: 'why-note' }, d.note));
  }
  const criteria = [
    { label: 'Length', score: d.scores.length },
    { label: 'Vocabulary', score: d.scores.vocabulary },
    { label: 'Trope', score: d.scores.trope },
    { label: 'Repetition', score: d.scores.repetition },
    { label: 'Gotchas', score: d.scores.hiddenChallenges },
  ];
  const list = el('div', { class: 'why-criteria' });
  for (const c of criteria) {
    list.append(el('div', { class: 'why-criterion' }, [
      el('span', { class: 'why-criterion-label' }, c.label),
      el('span', { class: 'why-criterion-score', style: `color:${scoreColor(c.score)}` }, `${c.score}/10`),
      el('span', { class: 'why-criterion-note muted' }, c.label === 'Length' ? `${a.verses} verses — ${qualify(c.label, c.score)}` : qualify(c.label, c.score)),
    ]));
  }
  wrap.append(list);
  const vd = d.vocabDetail;
  if (vd && vd.rareExamples && vd.rareExamples.length) {
    wrap.append(wordChipRow('Rare words (seldom appear elsewhere in the Torah)', vd.rareExamples.map((w) => w.occurrencesInTorah === 1 ? `${w.word} (1×)` : `${w.word} (${w.occurrencesInTorah}×)`)));
  }
  if (vd && vd.hardToPronounceExamples && vd.hardToPronounceExamples.length) {
    wrap.append(wordChipRow('Tricky to pronounce', vd.hardToPronounceExamples.map((w) => w.word)));
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
    const row = el('tr', { class: d ? 'aliyah-row expandable' : 'aliyah-row' });
    row.append(el('td', { class: 'aliyah-num' }, aliyahLabel(a.aliyah)));
    row.append(el('td', {}, citeRange(a)));
    row.append(el('td', { class: 'muted' }, `${a.verses}v`));
    const caret = d ? el('span', { class: 'why-caret' }, ' ⌄') : null;
    row.append(el('td', {}, d ? [scoreBadge(d.finalScore, { size: 'sm' }), caret] : '—'));
    const noteText = a.specialTrope || (d && d.note) || '';
    row.append(el('td', { class: 'aliyah-note' }, noteText));
    if (d) {
      row.addEventListener('click', () => {
        const isOpen = row.dataset.expanded === 'true';
        tbody.querySelectorAll('.why-row').forEach((n) => n.remove());
        tbody.querySelectorAll('.aliyah-row').forEach((r) => {
          r.dataset.expanded = 'false';
          const c = r.querySelector('.why-caret');
          if (c) c.textContent = ' ⌄';
        });
        if (isOpen) return;
        row.dataset.expanded = 'true';
        caret.textContent = ' ⌃';
        const tr = el('tr', { class: 'why-row' });
        const td = el('td', { colspan: '5' });
        td.append(buildWhyPanel(d, a));
        tr.append(td);
        row.after(tr);
      });
    }
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
      miniBar('Gotchas', difficulty.parshaScores.hiddenChallenges),
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
      miniBar('Gotchas', difficulty.scores.hiddenChallenges),
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
