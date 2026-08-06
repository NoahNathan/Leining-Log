// Computes, for every aliyah (individual and combined parshiot), a
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
const NIQQUD = /[ְ-ׇּׁׂ]/g;
const DAGESH = /ּ/g;
const CHATAF = /[ֱֲֳ]/;
const HEBREW_LETTER = /[א-ת]/;
const NON_LETTER = /[^א-תְ-ׇּׁׂ֑-֯]/g;
const GUTTURALS = /[אהחע]/g;

function tokenizeVerse(text) {
  return text.split(/[\s־]+/) // whitespace or maqaf
    .map(t => t.replace(NON_LETTER, ''))
    .filter(t => HEBREW_LETTER.test(t));
}
const stripTrope = (w) => w.replace(TROPE, '');
const stripNiqqud = (w) => w.replace(NIQQUD, '');
const consonantal = (w) => stripNiqqud(stripTrope(w));

// ---- pass 1: load every Torah verse once, tokenize, build frequency table ----
const versesByBookChapter = {}; // { Genesis: { 1: [{verse, words:[{surface, consonantal}]}] } }
const freq = new Map(); // consonantal form -> count
const allTokenCount = { n: 0 };

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
        allTokenCount.n++;
        return { surface, consonantal: cons };
      });
      return { verse: v.verse, words };
    });
    ch++;
  }
}
console.log('Loaded Torah text:', allTokenCount.n, 'word tokens,', freq.size, 'unique consonantal forms');

// ---- rarity score: percentile rank of (rarity = 1/frequency) across ALL tokens ----
const allFreqs = [];
for (const [bookEn] of Object.entries(BOOK_EN_TO_HE)) {
  for (const ch of Object.values(versesByBookChapter[bookEn])) {
    for (const v of ch) for (const w of v.words) allFreqs.push(freq.get(w.consonantal));
  }
}
allFreqs.sort((a, b) => b - a); // descending: most frequent first
function rarityScore(consonantalWord) {
  const f = freq.get(consonantalWord) || 1;
  // rarer (lower f) => higher index in the descending-sorted list => higher score
  let idx = allFreqs.length - 1;
  // binary search for first index where allFreqs[idx] <= f (list is descending)
  let lo = 0, hi = allFreqs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (allFreqs[mid] <= f) { idx = mid; hi = mid - 1; } else { lo = mid + 1; }
  }
  const pct = idx / (allFreqs.length - 1);
  return clamp(1 + pct * 9);
}

// ---- pronunciation-complexity score ----
const allPronRaw = [];
function pronRaw(surfaceWord) {
  const lettersOnly = surfaceWord.replace(NIQQUD, '').replace(TROPE, '');
  const len = lettersOnly.length;
  const gutturals = (lettersOnly.match(GUTTURALS) || []).length;
  const hasChataf = CHATAF.test(surfaceWord) ? 1 : 0;
  const dageshCount = (surfaceWord.match(DAGESH) || []).length;
  return len + gutturals * 2 + hasChataf * 3 + Math.min(dageshCount, 2);
}
for (const [bookEn] of Object.entries(BOOK_EN_TO_HE)) {
  for (const ch of Object.values(versesByBookChapter[bookEn])) {
    for (const v of ch) for (const w of v.words) allPronRaw.push(pronRaw(w.surface));
  }
}
allPronRaw.sort((a, b) => a - b); // ascending
function pronunciationScore(surfaceWord) {
  const raw = pronRaw(surfaceWord);
  // allPronRaw is ascending; find first index where value >= raw (binary search)
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

function analyzeAliyah(bookEn, startRef, endRef) {
  const verses = getVerseRange(bookEn, startRef, endRef);
  const words = verses.flatMap(v => v.words);
  if (words.length === 0) return null;
  const rarities = words.map(w => rarityScore(w.consonantal));
  const prons = words.map(w => pronunciationScore(w.surface));
  const rarity = round1(rarities.reduce((s, v) => s + v, 0) / rarities.length);
  const pronunciation = round1(prons.reduce((s, v) => s + v, 0) / prons.length);
  const vocab = clamp(Math.round((rarity + pronunciation) / 2));

  // illustrative examples: rarest words and hardest-to-pronounce words in this aliyah
  const seen = new Set();
  const rareExamples = [];
  for (const w of [...words].sort((a, b) => freq.get(a.consonantal) - freq.get(b.consonantal))) {
    if (seen.has(w.consonantal)) continue;
    seen.add(w.consonantal);
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

  return {
    wordCount: words.length,
    rarity, pronunciation, vocab,
    rareExamples, hardToPronounceExamples: hardExamples,
  };
}

// ---- run over every individual + combined parsha's aliyot ----
const parshiot = JSON.parse(readFileSync('../data/parshiot.json', 'utf8')).parshiot;
const combined = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8')).combinedParshiot;

const result = {};
for (const p of [...parshiot, ...combined]) {
  result[p.id] = {};
  for (const a of p.aliyot) {
    result[p.id][a.aliyah] = analyzeAliyah(a.book, a.start, a.end);
  }
  if (p.maftir) {
    result[p.id].M = analyzeAliyah(p.maftir.book, p.maftir.start, p.maftir.end);
  }
}

writeFileSync('../data/word-difficulty.json', JSON.stringify({
  description: "Per-aliyah vocabulary-difficulty statistics computed directly from the Masoretic Torah text (via @shafeh/tanach), not guessed from a content-profile category. 'rarity' (0-10) is the percentile rank of how infrequently this aliyah's words appear across the whole Torah (~80,000 word tokens, 5 books); 'pronunciation' (0-10) is the percentile rank of a word-complexity heuristic (consonant length + guttural-letter density + presence of a chataf/reduced vowel + dagesh). 'vocab' is the rounded average of the two, and feeds directly into difficulty-scores.json's vocabulary criterion. Includes individual AND combined (double) parshiot, keyed the same way as parshiot.json / parshiot-combined.json.",
  corpus: { totalWordTokens: allTokenCount.n, uniqueConsonantalForms: freq.size },
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  aliyot: result,
}, null, 2));

console.log('Wrote word-difficulty.json for', Object.keys(result).length, 'parshiot (individual + combined)');
