// Computes, for every aliyah (individual parshiot, combined parshiot, AND
// every chag/fast/Rosh Chodesh/special Shabbat reading in chagim.json), a
// vocabulary-difficulty score based on two real, measurable properties of
// its actual Hebrew words -- not a guessed content-profile baseline:
//
//   1. Rarity: how often that exact word form appears across the whole
//      Torah (5,845 verses / ~80,000 word tokens). A word a reader has
//      seen dozens of times elsewhere is easier than a hapax legomenon.
//   2. Pronunciation complexity: word length, guttural-letter density,
//      presence of a chataf (reduced) vowel, and presence of a dagesh --
//      concrete, checkable features that correlate with how often a
//      reader stumbles over a word, not a subjective guess.
//
// Source text: @shafeh/tanach (a full Masoretic Hebrew Bible text with
// niqqud + cantillation). This script only reads it locally to compute
// statistics -- the text itself is not redistributed in /data.
import { getChapter } from '@shafeh/tanach';
import { readFileSync, writeFileSync } from 'fs';

const BOOK_EN_TO_HE = {
  Genesis: 'Bereishit',
  Exodus: 'Shemot',
  Leviticus: 'Vayikra',
  Numbers: 'Bamidbar',
  Deuteronomy: 'Devarim',
};

const TROPE = /[֑-֯]/g;
const NIQQUD = /[ְ-ׇּׁׂ]/g;
const DAGESH = /ּ/g;
const CHATAF = /[ֱֲֳ]/;
const HEBREW_LETTER = /[א-ת]/;
const NON_LETTER = /[^א-תְ-ׇּׁׂ֑-֯]/g;
const GUTTURALS = /[אהחע]/g;

function tokenizeVerse(text) {
  return text.split(/[\s־]+/) // whitespace or maqaf
    .map(t => t.replace(NON_LETTER, ''))
    .filter(t => HEBREW_LETTER.test(t));
}
const stripTrope = (w) => w.replace(TROPE, '');
const stripNiqqud = (w) => w.replace(NIQQUD, '');

// ---- pass 1: load every Torah verse once, tokenize, build frequency table ----
const versesByBookChapter = {}; // { Genesis: { 1: [{verse, words:[{surface, consonantal}]}] } }
const freq = new Map(); // consonantal form -> count
let totalTokens = 0;

for (const [bookEn, bookHe] of Object.entries(BOOK_EN_TO_HE)) {
  versesByBookChapter[bookEn] = {};
  let ch = 1;
  while (true) {
    const chapter = getChapter(bookHe, ch);
    if (!chapter || chapter.length === 0) break;
    versesByBookChapter[bookEn][ch] = chapter.map(v => {
      const words = tokenizeVerse(v.text).map(surfaceTrope => {
        const surface = stripTrope(surfaceTrope); // niqqud, no trope -- used for pronunciation
        const cons = stripNiqqud(surface); // consonants only -- used for frequency
        freq.set(cons, (freq.get(cons) || 0) + 1);
        totalTokens++;
        return { surface, consonantal: cons };
      });
      return { verse: v.verse, words };
    });
    ch++;
  }
}
console.log('Loaded Torah text:', totalTokens, 'word tokens,', freq.size, 'unique consonantal forms');

// ---- per-word rarity: percentile rank of (rarity = 1/frequency) across ALL word tokens ----
const allFreqs = [];
for (const bookEn of Object.keys(BOOK_EN_TO_HE)) {
  for (const ch of Object.values(versesByBookChapter[bookEn])) {
    for (const v of ch) for (const w of v.words) allFreqs.push(freq.get(w.consonantal));
  }
}
allFreqs.sort((a, b) => b - a); // descending: most frequent first
function wordRarityScore(consonantalWord) {
  const f = freq.get(consonantalWord) || 1;
  let lo = 0, hi = allFreqs.length - 1, idx = allFreqs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (allFreqs[mid] <= f) { idx = mid; hi = mid - 1; } else { lo = mid + 1; }
  }
  const pct = idx / (allFreqs.length - 1);
  return clamp(1 + pct * 9);
}

// ---- per-word pronunciation-complexity ----
function pronRaw(surfaceWord) {
  const lettersOnly = surfaceWord.replace(NIQQUD, '').replace(TROPE, '');
  const len = lettersOnly.length;
  const gutturals = (lettersOnly.match(GUTTURALS) || []).length;
  const hasChataf = CHATAF.test(surfaceWord) ? 1 : 0;
  const dageshCount = (surfaceWord.match(DAGESH) || []).length;
  return len + gutturals * 2 + hasChataf * 3 + Math.min(dageshCount, 2);
}
const allPronRaw = [];
for (const bookEn of Object.keys(BOOK_EN_TO_HE)) {
  for (const ch of Object.values(versesByBookChapter[bookEn])) {
    for (const v of ch) for (const w of v.words) allPronRaw.push(pronRaw(w.surface));
  }
}
allPronRaw.sort((a, b) => a - b); // ascending
function wordPronunciationScore(surfaceWord) {
  const raw = pronRaw(surfaceWord);
  let lo = 0, hi = allPronRaw.length - 1, idx = allPronRaw.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (allPronRaw[mid] >= raw) { idx = mid; hi = mid - 1; } else { lo = mid + 1; }
  }
  const pct = idx / (allPronRaw.length - 1);
  return clamp(1 + pct * 9);
}

function clamp(n) { return Math.max(0, Math.min(10, n)); }
function round1(n) { return Math.round(n * 10) / 10; }

function getVerseRange(bookEn, startRef, endRef) {
  const [startCh, startV] = startRef.split(':').map(Number);
  const [endCh, endV] = endRef.split(':').map(Number);
  const out = [];
  for (let ch = startCh; ch <= endCh; ch++) {
    const chapter = versesByBookChapter[bookEn][ch];
    if (!chapter) continue;
    const vLo = ch === startCh ? startV : -Infinity;
    const vHi = ch === endCh ? endV : Infinity;
    for (const v of chapter) if (v.verse >= vLo && v.verse <= vHi) out.push(v);
  }
  return out;
}

// ---- pass 2: collect each aliyah's RAW word-level stats (not yet 0-10) ----
// A straight per-token mean of the individual word scores above is real but
// heavily compressed: Biblical Hebrew's morphology means most tokens in ANY
// aliyah land in a similar mid-range (a sea of "et"/"asher"/"vayomer" pulls
// every aliyah's mean toward the same value), so raw means alone barely
// differ between a genealogy and a plain narrative passage. The fix mirrors
// how "length" is already scored elsewhere in this pipeline: compute each
// aliyah's raw mean, then percentile-rank that mean AGAINST EVERY OTHER
// ALIYAH (not against individual words) to produce the final 1-10 score.
// That guarantees the full 0-10 range is actually used and meaningful,
// exactly the way "the longest aliyah in the Torah scores 10 for length"
// already works -- rather than every aliyah's word-level average clustering
// in the same narrow band.
function rawAliyahStats(bookEn, startRef, endRef) {
  const verses = getVerseRange(bookEn, startRef, endRef);
  const words = verses.flatMap(v => v.words);
  if (words.length === 0) return null;
  const rarityVals = words.map(w => wordRarityScore(w.consonantal));
  const pronVals = words.map(w => wordPronunciationScore(w.surface));
  const rawRarity = rarityVals.reduce((s, v) => s + v, 0) / rarityVals.length;
  const rawPron = pronVals.reduce((s, v) => s + v, 0) / pronVals.length;

  const seenR = new Set();
  const rareExamples = [];
  for (const w of [...words].sort((a, b) => freq.get(a.consonantal) - freq.get(b.consonantal))) {
    if (seenR.has(w.consonantal)) continue;
    seenR.add(w.consonantal);
    rareExamples.push({ word: w.surface, occurrencesInTorah: freq.get(w.consonantal) });
    if (rareExamples.length >= 3) break;
  }
  const seenH = new Set();
  const hardExamples = [];
  for (const w of [...words].sort((a, b) => pronRaw(b.surface) - pronRaw(a.surface))) {
    if (seenH.has(w.surface)) continue;
    seenH.add(w.surface);
    hardExamples.push({ word: w.surface });
    if (hardExamples.length >= 3) break;
  }

  return { wordCount: words.length, rawRarity, rawPron, rareExamples, hardToPronounceExamples: hardExamples };
}

// ---- gather every aliyah (individual parshiot, combined parshiot, chagim) ----
const parshiot = JSON.parse(readFileSync('../data/parshiot.json', 'utf8')).parshiot;
const combinedParshiot = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8')).combinedParshiot;
const chagim = JSON.parse(readFileSync('../data/chagim.json', 'utf8')).chagim;

const entries = []; // { groupId, aliyahKey, raw }
for (const p of [...parshiot, ...combinedParshiot]) {
  for (const a of p.aliyot) {
    const raw = rawAliyahStats(a.book, a.start, a.end);
    if (raw) entries.push({ groupId: p.id, aliyahKey: String(a.aliyah), raw });
  }
  if (p.maftir) {
    const raw = rawAliyahStats(p.maftir.book, p.maftir.start, p.maftir.end);
    if (raw) entries.push({ groupId: p.id, aliyahKey: 'M', raw });
  }
}
for (const c of chagim) {
  for (const a of (c.aliyot || [])) {
    const raw = rawAliyahStats(a.book, a.start, a.end);
    if (raw) entries.push({ groupId: c.id, aliyahKey: String(a.aliyah), raw });
  }
  if (c.maftir) {
    const raw = rawAliyahStats(c.maftir.book, c.maftir.start, c.maftir.end);
    if (raw) entries.push({ groupId: c.id, aliyahKey: 'M', raw });
  }
}

// ---- percentile-rank each aliyah's raw stats against all other aliyot ----
const rawRarities = entries.map(e => e.raw.rawRarity).sort((a, b) => a - b);
const rawPronunciations = entries.map(e => e.raw.rawPron).sort((a, b) => a - b);
function percentileRank(sortedAsc, value) {
  let idx = sortedAsc.findIndex(v => v >= value);
  if (idx === -1) idx = sortedAsc.length - 1;
  const pct = idx / (sortedAsc.length - 1);
  return clamp(1 + pct * 9);
}

const result = {};
for (const e of entries) {
  const rarity = round1(percentileRank(rawRarities, e.raw.rawRarity));
  const pronunciation = round1(percentileRank(rawPronunciations, e.raw.rawPron));
  const vocab = clamp(Math.round((rarity + pronunciation) / 2));
  result[e.groupId] ??= {};
  result[e.groupId][e.aliyahKey] = {
    wordCount: e.raw.wordCount,
    rarity, pronunciation, vocab,
    rareExamples: e.raw.rareExamples,
    hardToPronounceExamples: e.raw.hardToPronounceExamples,
  };
}

writeFileSync('../data/word-difficulty.json', JSON.stringify({
  description: "Per-aliyah vocabulary-difficulty statistics computed directly from the Masoretic Torah text (via @shafeh/tanach), not guessed from a content-profile category. Covers every individual parsha, every combined (double) parsha, and every chag/fast/Rosh Chodesh/special-Shabbat reading in chagim.json. For each aliyah: raw word-frequency rarity and pronunciation-complexity are averaged across its actual words, then percentile-ranked against every OTHER aliyah in this same dataset (mirroring how the 'length' criterion is scored) so the full 1-10 range is meaningfully used rather than clustering in a narrow band. 'vocab' is the rounded average of 'rarity' and 'pronunciation', and feeds directly into difficulty-scores.json's vocabulary criterion.",
  corpus: { totalWordTokens: totalTokens, uniqueConsonantalForms: freq.size, aliyotScored: entries.length },
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  aliyot: result,
}, null, 2));

console.log('Wrote word-difficulty.json for', Object.keys(result).length, 'groups (parshiot + combined + chagim),', entries.length, 'aliyot total');
