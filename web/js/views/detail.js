import { el, citeRange, displayParshaName, scoreColor, scoreColorBg, scoreLabel, formatDateLong } from '../util.js';
import { contentTags } from '../contentTags.js';
import { isConfigured, getCurrentUser } from '../auth.js';
import { getMyLeiningLog, addLeiningLogEntry, removeLeiningLogEntry, getParshaDetail, getChagById, getAliyahSummaries } from '../data.js';

function contentTagChips(tags) {
  if (!tags || !tags.length) return null;
  return el('div', { class: 'content-tags' }, tags.map((t) =>
    el('span', { class: `content-tag${t === 'Famous' ? ' content-tag-famous' : ''}` }, t)
  ));
}

const TIKKUN_BOOK_NUMBER = { Genesis: 1, Exodus: 2, Leviticus: 3, Numbers: 4, Deuteronomy: 5 };

// Links to Adat Shalom's ScrollScraper Tikkun, which needs exact
// chapter/verse boundaries in its URL to jump straight to a reading.
function tikkunUrl({ book, start, end }) {
  const bookNum = TIKKUN_BOOK_NUMBER[book];
  if (!bookNum) return null;
  const [startc, startv] = start.split(':').map(Number);
  const [endc, endv] = end.split(':').map(Number);
  const params = new URLSearchParams({
    book: bookNum, audioRepeatCount: 1, coloring: 0, doShading: 'on',
    startc, startv, endc, endv,
  });
  return `https://scrollscraper.adatshalom.net/scrollscraper.cgi?${params}`;
}

function tikkunLink(ref) {
  const url = tikkunUrl(ref);
  if (!url) return null;
  return el('a', { href: url, target: '_blank', rel: 'noopener', class: 'tikkun-link', title: 'Find this reading in the Tikkun' }, 'Tikkun ↗');
}

// Spans the first aliyah's start through the last aliyah's end -- one link
// for the whole reading, rather than having to click through each aliyah.
function wholeReadingTikkunLink(aliyot) {
  if (!aliyot || !aliyot.length) return null;
  const first = aliyot[0];
  const last = aliyot[aliyot.length - 1];
  const url = tikkunUrl({ book: first.book, start: first.start, end: last.end });
  if (!url) return null;
  return el('a', { href: url, target: '_blank', rel: 'noopener', class: 'tikkun-link', title: 'Find the whole reading in the Tikkun' }, 'Whole reading in Tikkun ↗');
}

// A toggle that logs/un-logs a specific aliyah (or 'ALL' for the whole
// reading) as leined, right from wherever the reading is shown -- This
// Week, Search, or a permalink -- not just from the My Leining tab.
// `mine` is a shared Map(aliyahKey -> log row id) for this reading, kept in
// sync across every button on the page so the state stays consistent.
function quickLogButton(userId, readingId, aliyahKey, mine) {
  const btn = el('button', { type: 'button' });
  function update() {
    const logged = mine.has(aliyahKey);
    btn.textContent = logged ? '✓ Leined' : 'Mark leined';
    btn.className = `quicklog-btn${logged ? ' quicklog-btn-active' : ''}`;
    btn.title = logged ? 'Marked as leined -- click to remove' : "Mark this as leined";
  }
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    try {
      if (mine.has(aliyahKey)) {
        await removeLeiningLogEntry(mine.get(aliyahKey));
        mine.delete(aliyahKey);
      } else {
        const id = await addLeiningLogEntry(userId, { parshaId: readingId, aliyahKey });
        mine.set(aliyahKey, id);
      }
    } catch (err) {
      console.error(err);
    }
    btn.disabled = false;
    update();
  });
  update();
  return btn;
}

// Fire-and-forget: renderParshaDetail/renderChagDetail must stay synchronous
// (existing callers append their return value directly), so this resolves
// the logged-in state after the fact and injects quick-log buttons in place
// once it's known, rather than blocking the initial render on a network call.
async function attachQuickLog(card, { readingId, aliyot, maftir }) {
  if (!isConfigured) return;
  let user, log;
  try {
    user = await getCurrentUser();
    if (!user) return;
    log = await getMyLeiningLog(user.id);
  } catch (err) {
    console.error('Quick-log unavailable:', err);
    return;
  }
  const mine = new Map(log.filter((e) => e.parsha_id === readingId).map((e) => [e.aliyah_key, e.id]));

  const actions = card.querySelector('.subcard-actions');
  if (actions) actions.append(quickLogButton(user.id, readingId, 'ALL', mine));

  for (const a of aliyot || []) {
    const row = card.querySelector(`.aliyah-row[data-aliyah-key="${a.aliyah}"]`);
    const cell = row && row.querySelector('.aliyah-note');
    if (cell) cell.append(quickLogButton(user.id, readingId, String(a.aliyah), mine));
  }
  if (maftir) {
    const line = card.querySelector('.maftir-line');
    if (line) line.append(quickLogButton(user.id, readingId, 'M', mine));
  }
}

function scoreBadge(score, { size = 'md' } = {}) {
  return el('span', {
    class: `badge badge-${size}`,
    style: `color:${scoreColor(score)}; background:${scoreColorBg(score)}; border-color:${scoreColor(score)}33`,
  }, [`${score.toFixed ? (Number.isInteger(score) ? score : score.toFixed(1)) : score}`, ' · ', scoreLabel(score)]);
}

const CRITERION_TOOLTIPS = {
  Length: 'How many words — the single biggest factor in the score. Counted in words rather than verses, since verses range from about 6 to 21 words each.',
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

function shareButton(hashPath) {
  const label = '🔗 Copy link';
  const btn = el('button', { class: 'btn-share', title: 'Copy a shareable link to this page', type: 'button' }, label);
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const url = `${location.origin}${location.pathname}#${hashPath}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = label; }, 1500);
  });
  return btn;
}

// Sefaria book names use underscores for spaces (e.g. "I Samuel" -> "I_Samuel"),
// and chapter:verse refs use a dot rather than our data's colon.
// Some haftarot are two non-adjacent excerpts (an array) -- return one URL per part.
function sefariaUrl(ref) {
  if (!ref || ref.sameAs) return null;
  if (Array.isArray(ref)) return ref.map(sefariaUrl).filter(Boolean);
  const book = ref.book.replace(/ /g, '_');
  const start = ref.start.replace(':', '.');
  const end = ref.end.replace(':', '.');
  return `https://www.sefaria.org/${book}.${start}-${end}`;
}

// Nusach names as displayed -- capitalized, otherwise as stored.
function nusachLabel(name) {
  return name[0].toUpperCase() + name.slice(1);
}

// The longest/shortest reading within a tradition, if this one holds the
// record. Length-only (word count) -- not tied to the difficulty score, so
// it applies to sefardi and chabad too even though only ashkenazi is scored.
function haftarahRecordTag(name, haftarahId, lengthRecords) {
  const rec = lengthRecords && haftarahId && lengthRecords[name];
  if (!rec) return null;
  if (rec.longest && rec.longest.includes(haftarahId)) {
    return el('span', { class: 'content-tag content-tag-record' }, `Longest — ${nusachLabel(name)}`);
  }
  if (rec.shortest && rec.shortest.includes(haftarahId)) {
    return el('span', { class: 'content-tag content-tag-record' }, `Shortest — ${nusachLabel(name)}`);
  }
  return null;
}

function nusachRow(nusach, haftScore, summaries, haftarahId, lengthRecords) {
  if (!nusach) return el('p', { class: 'muted' }, 'No haftarah data.');
  const entries = Object.entries(nusach).filter(([, v]) => v);
  const wrap = el('div', { class: 'nusach-tabs' });
  for (const [name, v] of entries) {
    const text = v.sameAs ? `Same as ${v.sameAs}` : citeRange(v);
    const parts = v.sameAs ? [] : (Array.isArray(v) ? v : [v]);
    const haftSummary = summaries
      ? parts.map((q) => summaries[`${q.book} ${q.start}-${q.end}`]).filter(Boolean).join(' ')
      : '';
    const url = sefariaUrl(v);
    const urls = Array.isArray(url) ? url : (url ? [url] : []);
    const links = urls.map((u, i) => el('a', {
      href: u, target: '_blank', rel: 'noopener', class: 'tikkun-link', title: 'Read this on Sefaria',
    }, urls.length > 1 ? `Text ${i + 1} ↗` : 'Text ↗'));
    // Only the ashkenazi reading is scored so far, so only it carries a badge.
    const isScored = name === 'ashkenazi' && haftScore;
    const caret = isScored ? el('span', { class: 'why-caret' }, ' ⌄') : null;
    const nameEl = el('span', { class: `nusach-name${isScored ? ' expandable' : ''}` }, [
      nusachLabel(name),
      isScored ? scoreBadge(haftScore.finalScore, { size: 'sm' }) : null,
      caret,
    ]);
    const recordTag = haftarahRecordTag(name, haftarahId, lengthRecords);
    const chip = el('div', { class: 'nusach-chip' }, [
      nameEl,
      el('span', { class: 'nusach-cite' }, [text, ...links]),
      recordTag ? el('div', { class: 'content-tags' }, [recordTag]) : null,
      haftSummary ? el('p', { class: 'aliyah-summary muted small' }, haftSummary) : null,
      v.specialTrope ? el('p', { class: 'nusach-note muted small' }, `${v.specialTrope.range}: ${v.specialTrope.note}`) : null,
    ]);
    if (isScored) {
      nameEl.addEventListener('click', () => {
        const existing = chip.querySelector('.why-panel');
        if (existing) {
          existing.remove();
          caret.textContent = ' ⌄';
          return;
        }
        caret.textContent = ' ⌃';
        chip.append(buildHaftarahWhyPanel(haftScore));
      });
    }
    wrap.append(chip);
  }
  return wrap;
}

function buildHaftarahWhyPanel(hs) {
  const wrap = el('div', { class: 'why-panel' });
  const criteria = [
    { label: 'Length', score: hs.scores.length },
    { label: 'Vocabulary', score: hs.scores.vocabulary },
    { label: 'Trope', score: hs.scores.trope },
    { label: 'Repetition', score: hs.scores.repetition },
  ];
  const list = el('div', { class: 'why-criteria' });
  for (const c of criteria) {
    list.append(el('div', { class: 'why-criterion' }, [
      el('span', { class: 'why-criterion-label' }, c.label),
      el('span', { class: 'why-criterion-score', style: `color:${scoreColor(c.score)}` }, `${c.score}/10`),
      el('span', { class: 'why-criterion-note muted' }, c.label === 'Length' ? `${hs.verses} verses, ${hs.wordCount} words — ${qualifyHaftarahLength(c.score)}` : qualify(c.label, c.score)),
    ]));
  }
  wrap.append(list);
  const vd = hs.vocabDetail;
  if (vd && vd.rareExamples && vd.rareExamples.length) {
    wrap.append(wordChipRow('Rare words (this exact form appears only a few times across Torah + Nevi\'im)', vd.rareExamples.map((w) => w.occurrencesInCorpus === 1 ? `${w.word} — 1×` : `${w.word} — ${w.occurrencesInCorpus}×`)));
  }
  if (vd && vd.hardToPronounceExamples && vd.hardToPronounceExamples.length) {
    wrap.append(wordChipRow('Tricky to pronounce', vd.hardToPronounceExamples.map((w) => w.word)));
  }
  if (hs.rareTropeMarks && hs.rareTropeMarks.length) {
    wrap.append(wordChipRow('Rare trope mark', hs.rareTropeMarks.map((t) => `${t.mark} -- ${t.word}`)));
  }
  return wrap;
}

// Length is judged against other haftarot, not Torah aliyot -- haftarot run
// far longer on average (median 324 words vs. 195 for an aliyah), so the
// comparison that actually means something is haftarah-to-haftarah.
function qualifyHaftarahLength(score) {
  if (score >= 8) return 'one of the longest haftarot';
  if (score >= 6) return 'longer than most haftarot';
  if (score >= 4) return 'about average length for a haftarah';
  return 'a short haftarah';
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
      el('span', { class: 'why-criterion-note muted' }, c.label === 'Length' ? `${a.verses} verses, ${d.wordCount ?? '?'} words — ${qualify(c.label, c.score)}` : qualify(c.label, c.score)),
    ]));
  }
  wrap.append(list);
  const vd = d.vocabDetail;
  if (vd && vd.rareExamples && vd.rareExamples.length) {
    wrap.append(wordChipRow('Rare words (this exact form appears only a few times in the whole Torah)', vd.rareExamples.map((w) => w.occurrencesInTorah === 1 ? `${w.word} — 1× in the Torah` : `${w.word} — ${w.occurrencesInTorah}× in the Torah`)));
  }
  if (vd && vd.hardToPronounceExamples && vd.hardToPronounceExamples.length) {
    wrap.append(wordChipRow('Tricky to pronounce', vd.hardToPronounceExamples.map((w) => w.word)));
  }
  if (d.ambiguousSpellingExamples && d.ambiguousSpellingExamples.length) {
    wrap.append(wordChipRow('Looks the same without nikkud, read differently', d.ambiguousSpellingExamples.map((w) => w.word)));
    wrap.append(el('p', { class: 'why-note' }, d.ambiguousSpellingExamples[0].note));
  }
  if (d.lookAlikeWordPairs && d.lookAlikeWordPairs.length) {
    wrap.append(wordChipRow('Watch for these look-alikes in this aliyah', d.lookAlikeWordPairs.map((pr) => `${pr.a} / ${pr.b}`)));
    wrap.append(el('p', { class: 'why-note' }, 'Without nikkud, these pairs are either spelled 100% identically (same letters, different vowels only) or differ by just one letter (ו/י) -- worth double-checking you\'re reading the right one.'));
  }
  if (d.rareTropeMarks && d.rareTropeMarks.length) {
    wrap.append(wordChipRow('Rare trope mark in this aliyah', d.rareTropeMarks.map((t) => `${t.mark} -- ${t.word}`)));
    wrap.append(el('p', { class: 'why-note' }, 'This aliyah contains one of the three rarest cantillation marks in the Torah -- each appears at most four times in the entire Chumash (yerach ben yomo appears exactly once), so most readers have never chanted one. Worth looking up the tune before you go up.'));
  }
  return wrap;
}

export function renderAliyahTable(aliyot, { maftir, difficultyAliyot, profile, readingId, summaries } = {}) {
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
    row.dataset.aliyahKey = String(a.aliyah);
    row.append(el('td', { class: 'aliyah-num' }, aliyahLabel(a.aliyah)));
    const tags = contentTags({ profile, aliyahKey: String(a.aliyah), readingId, wellKnown: d && d.wellKnown });
    const summary = summaries && summaries[`${a.book} ${a.start}-${a.end}`];
    row.append(el('td', {}, [
      citeRange(a),
      summary ? el('p', { class: 'aliyah-summary muted small' }, summary) : null,
      contentTagChips(tags),
    ]));
    row.append(el('td', { class: 'muted' }, `${a.verses}v`));
    const caret = d ? el('span', { class: 'why-caret' }, ' ⌄') : null;
    row.append(el('td', {}, d ? [scoreBadge(d.finalScore, { size: 'sm' }), caret] : '—'));
    const noteText = a.specialTrope || (d && d.note) || '';
    const link = tikkunLink(a);
    if (link) link.addEventListener('click', (e) => e.stopPropagation());
    row.append(el('td', { class: 'aliyah-note' }, [noteText, link]));
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
  const scrollWrap = el('div', { class: 'table-scroll' }, table);
  if (maftir) {
    const maftirDifficulty = byNum.get('M');
    const maftirTags = contentTags({ profile, aliyahKey: 'M', readingId, wellKnown: maftirDifficulty && maftirDifficulty.wellKnown });
    const maftirSummary = summaries && summaries[`${maftir.book} ${maftir.start}-${maftir.end}`];
    const foot = el('div', { class: 'maftir-line' }, [
      el('strong', {}, 'Maftir: '), citeRange(maftir),
      maftir.reason ? el('span', { class: 'tag' }, maftir.reason) : null,
      maftirDifficulty ? scoreBadge(maftirDifficulty.finalScore, { size: 'sm' }) : null,
      tikkunLink(maftir),
      contentTagChips(maftirTags),
      maftirSummary ? el('p', { class: 'aliyah-summary muted small' }, maftirSummary) : null,
    ]);
    return el('div', {}, [scrollWrap, foot]);
  }
  return scrollWrap;
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

// A special-Shabbat week (Shekalim/Zachor/Parah/HaChodesh/HaGadol/Shuva,
// Rosh Chodesh, Chanukah-on-Shabbat) doesn't add a second reading alongside
// the week's regular parsha -- it REPLACES part of it. gen_calendar.mjs
// captures exactly which part on the calendar row's specialReading:
// aliyah7Ref (only on a triple-coincidence, e.g. Shekalim also landing on
// Rosh Chodesh -- always Rosh Chodesh's own portion), maftirRef, and the
// haftarah refs. Swap them into the parsha's own data before rendering,
// rather than showing a second card with content that isn't fully what's
// read that week.
function applySpecialReading(parsha, difficulty, sr) {
  let aliyot = parsha.aliyot;
  let maftir = parsha.maftir;
  let difficultyAliyot = difficulty && difficulty.aliyot;
  if (!sr) return { aliyot, maftir, difficultyAliyot };
  if (sr.aliyot) {
    // sr.aliyot carries every aliyah Hebcal actually placed a number on for
    // this specific date -- diff each one against this parsha's own static
    // range rather than assuming only aliyah 7 moved, since reassigning
    // aliyah 7 to Rosh Chodesh also RESHAPES aliyah 6 (it absorbs what would
    // normally be aliyah 7's opening verses, e.g. Terumah's aliyah 6 grows
    // from Ex 27:1-8 to 27:1-19) -- diffing generically catches that too.
    // gen_calendar.mjs attaches a real difficulty score onto each changed
    // aliyah's override (aliyah 7 reuses the "Shabbat Rosh Chodesh" chag
    // score, aliyah 6 gets its own freshly-scored merged range) -- swap that
    // in for the changed aliyah instead of just dropping its score.
    const changedNums = new Set();
    const replacementDifficulty = [];
    aliyot = aliyot.map((a) => {
      const override = sr.aliyot[String(a.aliyah)];
      if (!override) return a;
      const same = override.book === a.book && override.start === a.start && override.end === a.end;
      if (same) return a;
      changedNums.add(String(a.aliyah));
      if (override.difficulty) replacementDifficulty.push({ ...override.difficulty, aliyah: a.aliyah });
      const note = String(a.aliyah) === '7'
        ? `Read from the Rosh Chodesh scroll, not ${displayParshaName(parsha.englishName || parsha.id)}'s own text.`
        : `Extends to cover what would normally be the next aliyah too, since that one moves to the Rosh Chodesh scroll.`;
      return { ...a, ...override, specialTrope: note };
    });
    if (difficultyAliyot) {
      difficultyAliyot = difficultyAliyot.filter((a) => !changedNums.has(String(a.aliyah))).concat(replacementDifficulty);
    }
  }
  if (sr.maftirRef) {
    maftir = { ...sr.maftirRef, reason: sr.label };
    if (difficultyAliyot) {
      difficultyAliyot = difficultyAliyot.filter((a) => String(a.aliyah) !== 'M');
      if (sr.maftirRef.difficulty) difficultyAliyot = difficultyAliyot.concat([{ ...sr.maftirRef.difficulty, aliyah: 'M' }]);
    }
  }
  return { aliyot, maftir, difficultyAliyot };
}

// Lays out, in order, exactly which Torah scroll each part of this week's
// reading comes from -- the whole point being that a reader can tell at a
// glance "my aliyah is from the regular parsha" vs. "aliyah 7 is Rosh
// Chodesh's portion, not [parsha]'s own text".
function buildScrollNotice(parshaName, sr) {
  if (!sr) return null;
  const lines = [];
  if (sr.scrollCount >= 2) {
    const lastRegular = sr.aliyah7Ref ? '6th' : '7th';
    lines.push(`1st–${lastRegular} aliyah: ${parshaName} (this parsha's own reading)`);
    if (sr.aliyah7Ref) lines.push(`7th aliyah: Rosh Chodesh — ${citeRange(sr.aliyah7Ref)}`);
    if (sr.maftirRef) lines.push(`Maftir: ${sr.label} — ${citeRange(sr.maftirRef)}`);
  } else if (sr.haftaraRef) {
    lines.push(`Torah reading: ${parshaName}, unchanged`);
  }
  if (sr.haftaraRef) lines.push(`Haftarah: ${sr.label} — ${citeRange(sr.haftaraRef)}`);
  if (!lines.length) return null;
  const title = sr.scrollCount >= 2
    ? `This week: ${sr.label} — ${sr.scrollCount} Torah scrolls`
    : `This week's haftarah is different: ${sr.label}`;
  return el('div', { class: 'card subcard notes-card' }, [
    el('h3', {}, title),
    ...lines.map((l) => el('p', { class: 'note-line' }, l)),
  ]);
}

export function renderParshaDetail({ parsha, haftarah, difficulty, haftarahScore, summaries, haftarahLengthRecords }, opts = {}) {
  const card = el('div', { class: 'card detail-card' });
  const sr = opts.specialReading || null;
  const parshaName = displayParshaName(parsha.englishName || parsha.id);
  const { aliyot, maftir, difficultyAliyot } = applySpecialReading(parsha, difficulty, sr);

  const header = el('div', { class: 'detail-header' }, [
    el('div', {}, [
      el('div', { class: 'eyebrow-row' }, [
        el('div', { class: 'eyebrow' }, opts.eyebrow || 'Parashat HaShavua'),
        shareButton(`parsha/${encodeURIComponent(parsha.id)}`),
      ]),
      el('h2', {}, parshaName),
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

  const scrollNotice = buildScrollNotice(parshaName, sr);
  if (scrollNotice) card.append(scrollNotice);

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
    el('div', { class: 'subcard-heading-row' }, [el('h3', {}, 'Aliyot'), el('div', { class: 'subcard-actions' }, [wholeReadingTikkunLink(parsha.aliyot)])]),
    renderAliyahTable(aliyot, { maftir, difficultyAliyot, profile: difficulty && difficulty.profile, readingId: parsha.id, summaries }),
  ]));

  const haftarahOverridden = !!(sr && sr.haftaraRef);
  const nusachToShow = haftarahOverridden
    ? { ashkenazi: sr.haftaraRef, sefardi: sr.haftaraRefSefardi || { sameAs: 'ashkenazi' }, chabad: sr.haftaraRefChabad || { sameAs: 'ashkenazi' } }
    : (haftarah ? haftarah.nusach : null);
  card.append(el('div', { class: 'card subcard' }, [
    el('div', { class: 'subcard-heading-row' }, [
      el('h3', {}, 'Haftarah by nusach'),
      // Which haftarah this actually is -- the parsha's own regular one, or
      // a special-Shabbat/Rosh-Chodesh substitute -- since a reader looking
      // straight at this card (rather than the scroll-count notice above)
      // would otherwise have no way to tell the two apart.
      el('span', { class: 'tag' }, haftarahOverridden ? sr.label : `${parshaName}'s own haftarah`),
    ]),
    nusachRow(nusachToShow, haftarahOverridden ? (sr.haftarahDifficulty || null) : haftarahScore, summaries, haftarahOverridden ? null : (haftarah ? haftarah.id : null), haftarahLengthRecords),
  ]));

  attachQuickLog(card, { readingId: parsha.id, aliyot: parsha.aliyot, maftir: parsha.maftir });
  return card;
}

function stat(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value' }, String(value)),
    el('div', { class: 'stat-label' }, label),
  ]);
}

export function renderChagDetail(chag, { summaries } = {}) {
  const card = el('div', { class: 'card detail-card' });
  const difficulty = chag.difficulty || null;
  card.append(el('div', { class: 'detail-header' }, [
    el('div', {}, [
      el('div', { class: 'eyebrow-row' }, [
        el('div', { class: 'eyebrow' }, chag.region === 'israel' ? 'Israel' : 'Diaspora'),
        shareButton(`chag/${encodeURIComponent(chag.id)}`),
      ]),
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
      el('div', { class: 'subcard-heading-row' }, [el('h3', {}, 'Aliyot'), el('div', { class: 'subcard-actions' }, [wholeReadingTikkunLink(chag.aliyot)])]),
      renderAliyahTable(chag.aliyot, { maftir: chag.maftir, difficultyAliyot: difficulty && difficulty.aliyot, profile: difficulty && difficulty.profile, readingId: chag.id, summaries }),
    ]));
    attachQuickLog(card, { readingId: chag.id, aliyot: chag.aliyot, maftir: chag.maftir });
  } else if (chag.maftir) {
    card.append(el('div', { class: 'card subcard' }, [
      el('h3', {}, 'Maftir only'),
      renderAliyahTable([{ aliyah: 'M', ...chag.maftir }], { difficultyAliyot: difficulty && difficulty.aliyot, profile: difficulty && difficulty.profile, readingId: chag.id, summaries }),
    ]));
    attachQuickLog(card, { readingId: chag.id, aliyot: [{ aliyah: 'M' }], maftir: null });
  }
  card.append(el('div', { class: 'card subcard' }, [
    el('h3', {}, 'Haftarah by nusach'),
    nusachRow(chag.nusach, chag.haftarahScore || null, summaries),
  ]));
  return card;
}

// Renders every calendar row for one date as detail cards. A special-
// Shabbat date (Shekalim/Zachor/Parah/HaChodesh/HaGadol/Shuva, Rosh
// Chodesh, Chanukah-on-Shabbat) never carries a second 'holiday' row --
// gen_calendar.mjs folds that week's actual reading directly into the
// parsha row's specialReading, and renderParshaDetail applies it -- so
// there's exactly one card per date except for Chol HaMoed Shabbat and
// genuinely independent festivals (Pesach/Sukkot/Rosh Hashana/Yom Kippur/
// Shavuot), which still stand alone as their own 'holiday' row/card since
// no parsha competes with them that week.
export async function renderDateCards(rows, { parshaEyebrow = 'Parashat HaShavua', showDate = false, extraBanner = [] } = {}) {
  const summaries = await getAliyahSummaries();
  const nodes = [];
  for (const row of rows) {
    if (row.type === 'parsha') {
      const detail = await getParshaDetail(row.parshaId);
      if (!detail) continue;
      const bannerParts = [];
      if (showDate) bannerParts.push(el('span', { class: 'date-banner-date' }, formatDateLong(row.date)));
      bannerParts.push(...extraBanner);
      if (bannerParts.length) nodes.push(el('div', { class: 'date-banner' }, bannerParts));
      nodes.push(renderParshaDetail(detail, { eyebrow: parshaEyebrow, specialReading: row.specialReading }));
    } else {
      const chag = await getChagById(row.chagId);
      if (chag) nodes.push(renderChagDetail(chag, { summaries }));
    }
  }
  return nodes;
}
