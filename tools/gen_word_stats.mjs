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
const METEG = /ֽ/g; // secondary-stress mark, not a real vowel -- see stripMeteg below
const DAGESH = /ּ/g;
const CHATAF = /[ֱֲֳ]/;
const HEBREW_LETTER = /[א-ת]/;
const NON_LETTER = /[^א-תְ-ׇּׁׂ֑-֯]/g;
const GUTTURALS = /[אהחע]/g;

// A word is only surfaced in the UI as a "rare word" if its exact form
// (with any attached prefix/suffix) appears at most this many times across
// the whole Torah (~80,000 word tokens) -- not merely "less often than the
// other words in this one aliyah."
const RARE_OCCURRENCE_THRESHOLD = 5;

function tokenizeVerse(text) {
  return text.split(/[\s־]+/) // whitespace or maqaf
    .map(t => t.replace(NON_LETTER, ''))
    .filter(t => HEBREW_LETTER.test(t));
}
const stripTrope = (w) => w.replace(TROPE, '');
const stripNiqqud = (w) => w.replace(NIQQUD, '');
const stripMeteg = (w) => w.replace(METEG, '');
// Dagesh is two unrelated things wearing the same mark: gemination (a letter
// doubling, purely orthographic -- e.g. the lamed in לּוֹ "to him" vs לוֹ,
// same word) vs. part of the vowel itself when it lands on a vav (shuruk,
// לוּ, vs. cholam-vav, לוֹ -- genuinely different sound). Distinguishable by
// which letter carries it: only strip the gemination kind.
const stripGeminationDagesh = (w) => w.replace(/(?<!ו)ּ/g, '');
const vowelSignature = (w) => stripGeminationDagesh(stripMeteg(w));

// A narrow, text-grounded "gotcha": the Torah spells the 3rd-person feminine
// pronoun "hi" (she) the same as the masculine "hu" (he) -- both ה-ו-א --
// through most of the Torah, relying on the reader to know from the niqqud
// (chirik under the heh, הִוא, vs. shuruk in the vav, הוּא) which one it is.
// It's the canonical example of "looks identical without nikkudot, but is
// pronounced (and means) something different" -- detected directly from the
// vocalized text itself, not guessed.
const ARCHAIC_FEMININE_HU = /הִוא$/;
function isArchaicFeminineHu(surface) { return ARCHAIC_FEMININE_HU.test(surface); }

// A second, broader source of the same kind of gotcha: formal Ketiv/Qere --
// the ~70 places in the Chumash where the Torah scroll's actual written
// letters (ketiv) differ from what's traditionally read aloud (qere), by
// long-standing Masoretic tradition. @shafeh/tanach marks every one of these
// explicitly in its source markup (the qere word appears in the running
// text, immediately followed by an inline "(כתיב ...)" note giving the
// ketiv) -- this reads that annotation directly rather than maintaining a
// hand-typed list, so it can't drift from the actual text.
const KSIV_RE = /([֑-״]+)<span class="instructional ksiv"> \(כתיב ([^)]+?)\s*\)\s*<\/span>/g;
function extractKetivQere(rawText) {
  const out = [];
  for (const m of rawText.matchAll(KSIV_RE)) {
    out.push({ qere: stripNiqqud(stripTrope(m[1])), ketiv: m[2].trim() });
  }
  return out;
}

// Two distinct words within the SAME aliyah that differ by exactly one
// internal ו/י (i.e. one is the other with a single vowel-letter inserted)
// look nearly identical without nikkud -- a real misreading risk when
// reading from an unvocalized scroll, independent of whether the two words
// happen to share a root. Deliberately NOT used to detect "the same word
// spelled two ways" (see difficulty-rubric.md for why that was tried and
// rejected) -- this only needs the two forms to be visually near-identical,
// not to know whether they're etymologically related.
function isOneLetterApart(a, b) {
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 1; i < longer.length - 1; i++) { // internal positions only
    if (!'וי'.includes(longer[i])) continue;
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }
  return false;
}

// A strictly worse case than isOneLetterApart above: distinct words that
// share the EXACT same consonantal skeleton (zero letters apart -- 100%
// visually identical on a real, unvocalized Torah scroll) and differ only
// in nikkud. Tried detecting this generically before settling on an
// allowlist: a whole-Torah scan found 2,149 skeletons with 2+ distinct
// vocalizations, and even restricting to two such vocalizations actually
// co-occurring in the SAME aliyah still hit ~95% of aliyot -- almost all of
// it ordinary grammatical vowel variance (a dagesh appearing or not,
// construct-vs-absolute noun forms, meteg) that no fluent reader would
// actually confuse, not real word-confusion traps. This list is the
// signal left after manually verifying real occurrences and discarding
// that noise -- the same reasoning as the hand-picked הוא/הִיא case above,
// just covering more than one pattern. See difficulty-rubric.md.
const HOMOGRAPH_SKELETONS = new Map([
  // Bare 'את' deliberately excluded: it's overwhelmingly the direct-object
  // marker alternating between its two ordinary vowel forms (אֶת/אֵת, a
  // pausal-form grammar rule -- not a different word) rather than the much
  // rarer "you" (fem., אַתְּ) contrast -- tested and found ~96% noise, common
  // enough (the object marker is one of the most frequent words in the
  // Torah) that it would have flooded nearly every aliyah.
  ['אתי', '"me" (direct object) vs. "with me"'],
  ['אתו', '"him" (direct object) vs. "with him"'],
  ['אתה', '"you" (masc.) vs. "her" (direct object)'],
  ['אתם', '"them" (direct object) vs. "with them" vs. "you all" (masc.)'],
  ['אתכם', '"you all" (direct object) vs. "with you all"'],
  ['לו', '"to him" vs. "if only"'],
  ['מן', '"from" vs. "manna"'],
  ['עשו', '"Esau" vs. "they made/did"'],
  ['אם', '"if" vs. "mother"'],
]);

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
      return { verse: v.verse, words, ketivQere: extractKetivQere(v.text) };
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

  // Only surface a word as a "rare example" if it genuinely clears an
  // absolute rarity bar -- not just "the least-common word in this
  // particular aliyah," which for a short, ordinary-vocabulary aliyah could
  // still be a perfectly common word. Words are sorted ascending by Torah-
  // wide frequency, so once one exceeds the threshold the rest do too.
  const seenR = new Set();
  const rareExamples = [];
  for (const w of [...words].sort((a, b) => freq.get(a.consonantal) - freq.get(b.consonantal))) {
    if (seenR.has(w.consonantal)) continue;
    const occ = freq.get(w.consonantal);
    if (occ > RARE_OCCURRENCE_THRESHOLD) break;
    seenR.add(w.consonantal);
    rareExamples.push({ word: w.surface, occurrencesInTorah: occ });
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

  const seenA = new Set();
  const ambiguousSpellingExamples = [];
  for (const w of words) {
    if (!isArchaicFeminineHu(w.surface) || seenA.has(w.surface)) continue;
    seenA.add(w.surface);
    ambiguousSpellingExamples.push({ word: w.surface, note: 'Spelled the same as הוּא ("hu", he) but read here as "hi" (she) -- an archaic Torah spelling.' });
  }
  const seenK = new Set();
  for (const v of verses) {
    for (const kq of v.ketivQere) {
      const key = `${kq.ketiv}>${kq.qere}`;
      if (seenK.has(key)) continue;
      seenK.add(key);
      ambiguousSpellingExamples.push({ word: kq.qere, note: `Formal Ketiv/Qere: the Torah scroll is written ${kq.ketiv} but traditionally read aloud as ${kq.qere}.` });
    }
  }

  // Count is folded into the Gotchas score (percentile-ranked below, like
  // rarity/pronunciation); the capped list below is just for display.
  // Two flavors, most to least severe -- see comments on HOMOGRAPH_SKELETONS
  // and isOneLetterApart above for what counts as each:
  //   1. identical consonants, different vowels (allowlisted skeletons only)
  //   2. one internal ו/י apart
  const distinctForms = new Map(); // consonantal -> first surface seen
  for (const w of words) if (!distinctForms.has(w.consonantal)) distinctForms.set(w.consonantal, w.surface);
  const consList = [...distinctForms.keys()];
  const lookAlikePairsRaw = []; // [{ a, b, severity }]

  const byHomographVowel = new Map(); // consonantal -> Map(vowelSig -> surface)
  for (const w of words) {
    if (!HOMOGRAPH_SKELETONS.has(w.consonantal)) continue;
    const vowelSig = vowelSignature(w.surface);
    if (!byHomographVowel.has(w.consonantal)) byHomographVowel.set(w.consonantal, new Map());
    byHomographVowel.get(w.consonantal).set(vowelSig, w.surface);
  }
  for (const vowelMap of byHomographVowel.values()) {
    if (vowelMap.size < 2) continue;
    const forms = [...vowelMap.values()];
    for (let i = 0; i < forms.length; i++) {
      for (let j = i + 1; j < forms.length; j++) {
        lookAlikePairsRaw.push({ a: forms[i], b: forms[j], severity: 2 });
      }
    }
  }

  for (let i = 0; i < consList.length; i++) {
    for (let j = i + 1; j < consList.length; j++) {
      if (isOneLetterApart(consList[i], consList[j])) {
        lookAlikePairsRaw.push({ a: distinctForms.get(consList[i]), b: distinctForms.get(consList[j]), severity: 1 });
      }
    }
  }

  // Most severe first, then shortest -- short, common words are the ones
  // actually at risk of a quick misread.
  lookAlikePairsRaw.sort((x, y) => y.severity - x.severity || (x.a.length + x.b.length) - (y.a.length + y.b.length));
  const lookAlikeWordPairs = lookAlikePairsRaw.slice(0, 3).map(({ a, b }) => ({ a, b }));

  return { wordCount: words.length, rawRarity, rawPron, rareExamples, hardToPronounceExamples: hardExamples, ambiguousSpellingExamples, lookAlikeWordPairs, lookAlikePairCount: lookAlikePairsRaw.length };
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
    ambiguousSpellingExamples: e.raw.ambiguousSpellingExamples,
    lookAlikeWordPairs: e.raw.lookAlikeWordPairs,
    lookAlikePairCount: e.raw.lookAlikePairCount,
  };
}

writeFileSync('../data/word-difficulty.json', JSON.stringify({
  description: "Per-aliyah vocabulary-difficulty statistics computed directly from the Masoretic Torah text (via @shafeh/tanach), not guessed from a content-profile category. Covers every individual parsha, every combined (double) parsha, and every chag/fast/Rosh Chodesh/special-Shabbat reading in chagim.json. For each aliyah: raw word-frequency rarity and pronunciation-complexity are averaged across its actual words, then percentile-ranked against every OTHER aliyah in this same dataset (mirroring how the 'length' criterion is scored) so the full 1-10 range is meaningfully used rather than clustering in a narrow band. 'vocab' is the rounded average of 'rarity' and 'pronunciation', and feeds directly into difficulty-scores.json's vocabulary criterion. 'ambiguousSpellingExamples' flags two distinct, text-grounded 'written one way, read another' gotchas -- not a guessed or hand-typed list: (1) the archaic הוא/הִיא feminine-pronoun spelling, detected from the niqqud in the vocalized text itself; (2) every formal Ketiv/Qere in the Chumash (the Torah scroll's written letters vs. what's traditionally read aloud), read directly out of @shafeh/tanach's own ketiv/qere markup. It feeds into difficulty-scores.json's hiddenChallenges criterion. 'lookAlikeWordPairs' (up to 3, for display) and 'lookAlikePairCount' (the true total) flag pairs of distinct words within the same aliyah that a reader could genuinely conflate without nikkud, in two flavors, most to least severe: (1) identical consonants, different vowels -- restricted to a short, hand-verified allowlist (HOMOGRAPH_SKELETONS in gen_word_stats.mjs) rather than auto-detected, since both a whole-Torah scan and a same-aliyah co-occurrence scan came back ~95% saturated with ordinary grammatical vowel variance (dagesh presence, construct-state shifts) that no fluent reader would actually confuse -- see difficulty-rubric.md; (2) one internal ו/י apart. 'lookAlikePairCount' feeds a small, threshold-based (not percentile-ranked -- see difficulty-rubric.md for why percentile-ranking this specific count backfired) bump into difficulty-scores.json's hiddenChallenges, so the ~58% of aliyot with 0-1 pairs (the common case) get no bump, and only the genuinely pair-dense tail scores higher. There's still no reliable way to tell from spelling alone whether an unlisted one-letter-apart pair is genuinely two different words or just the same root in different grammatical forms (see difficulty-rubric.md for a related normalization attempt that was tried and rejected for the same reason) -- that flavor measures density of near-identical spellings, not a confirmed count of true word-confusion traps.",
  corpus: { totalWordTokens: totalTokens, uniqueConsonantalForms: freq.size, aliyotScored: entries.length },
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  aliyot: result,
}, null, 2));

console.log('Wrote word-difficulty.json for', Object.keys(result).length, 'groups (parshiot + combined + chagim),', entries.length, 'aliyot total');
