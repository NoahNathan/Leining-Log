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

// ---- Cantillation (trope) marks, by how often they actually occur ----
// Counted directly across all 5,846 Torah verses rather than assumed. The
// two tiers below are cut by measured frequency, not by reputation:
//
//   Tier A -- 4 or fewer occurrences in the ENTIRE Torah. A reader may go
//   years without meeting one. Verified counts: yerach ben yomo 1x
//   (Num 35:5 -- the single rarest mark in the Torah), shalshelet 4x,
//   merkha kefula 4x. Karnei parah is listed for completeness but does not
//   appear as its own codepoint in this source text.
//
//   Tier B -- uncommon but not exotic: present in roughly 2-9% of verses.
//   Density of these is what makes one aliyah's cantillation genuinely
//   busier than another's.
//
// Everything else (tipcha, munach, merkha, etnachta, zaqef qatan, pashta,
// qadma, mahpach, tevir, revia, geresh, darga) appears in 17-99% of verses
// -- ordinary furniture, deliberately not scored.
const TROPE_TIER_A = new Map([
  ['֪', 'yerach ben yomo'],
  ['֓', 'shalshelet'],
  ['֦', 'merkha kefula'],
  ['֟', 'karnei parah'],
]);
const TROPE_TIER_B = new Map([
  ['֡', 'pazer'],
  ['֠', 'telisha gedola'],
  ['֩', 'telisha qetana'],
  ['֚', 'yetiv'],
  ['֘', 'zarqa'],
  ['֒', 'segol'],
  ['֞', 'gershayim'],
  ['֕', 'zaqef gadol'],
]);
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

// A third look-alike flavour: two words of the SAME length differing in
// exactly one position, where those two letters are genuinely hard to tell
// apart in STA"M scroll script. Distinct from the ו/י check below, which is
// about a vowel-letter being present or absent rather than two letters
// looking similar.
//
// ה/ת is deliberately EXCLUDED despite looking alike. Testing showed its
// hits are overwhelmingly the ordinary absolute-vs-construct noun ending
// (מִנְחָה/מִנְחַת, שִׁבְעָה/שִׁבְעַת, אִשָּׁה/אֵשֶׁת) -- a grammar rule every reader
// knows, not a trap. That is the same noise already rejected for the nekudot
// work. What remains catches real pairs: לָהֶם/לֶחֶם, תּוֹרַת/תּוֹדַת, וַיְהִי/וַיְחִי.
const CONFUSABLE_LETTERS = [['ד','ר'], ['ב','כ'], ['ה','ח'], ['ו','ז'], ['ם','ס'], ['ג','נ'], ['פ','ף'], ['ן','ו']];
const CONFUSABLE_SET = new Set();
for (const [a, b] of CONFUSABLE_LETTERS) { CONFUSABLE_SET.add(a + b); CONFUSABLE_SET.add(b + a); }
function confusableLetterDiff(a, b) {
  if (a.length !== b.length || a.length < 3) return null;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (at >= 0) return null; // more than one position differs
    at = i;
  }
  if (at < 0) return null;
  return CONFUSABLE_SET.has(a[at] + b[at]) ? `${a[at]}/${b[at]}` : null;
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
  // Unlike bare את above, this ISN'T two different words -- it's the same
  // word (2mp perfect "you have not known") with a rare pausal-position
  // vowel shift (תָּם) instead of the usual ending (תֶּם). Included anyway
  // because, unlike את, it's genuinely rare enough not to be noise: 7 total
  // occurrences in the whole Torah, only 1 of which (Deut 13:3, in Re'eh)
  // is the pausal form -- a real trap for a reader used to the usual ending.
  ['ידעתם', '"you (masc. pl.) have not known" -- usual ending (תֶּם) vs. rare pausal ending (תָּם)'],

  // A systematic re-scan of every aliyah (not just spot-checking one report)
  // for this same "identical letters, colliding vowels within one aliyah"
  // pattern, filtered to genuinely rare skeletons and hand-verified against
  // the real verses (not guessed from the vowel pattern alone) -- see
  // difficulty-rubric.md for the full methodology and why most of the ~500
  // raw candidates found this way were rejected as the same "ordinary
  // grammar" noise already ruled out earlier (construct/absolute nouns,
  // pausal verb endings, definite-article vowel shifts). These are the ones
  // that survived: genuinely different words, or (like ידעתם) a rare same-
  // word pausal form.
  ['הבל', '"Hevel/Abel" (proper name) -- usual form vs. rare pausal ending, Genesis 4'],
  ['קין', '"Cain" (proper name) -- usual form vs. rare pausal ending, Genesis 4'],
  ['ורבו', '"multiply!" (command) vs. "they will increase" (a promise, not a command)'],
  ['ויעבר', '"he crossed over" vs. "he brought/led across" -- different verb stems, back-to-back in the Yabok story (Genesis 32)'],
  ['אכלו', '"his ration/food" vs. "they ate" -- a noun vs. a verb'],
  ['ויקרבו', '"they drew near" vs. "they brought/offered" -- different verb stems, both in the same Shemini narrative (Leviticus 9)'],
  ['ישחט', '"he slaughters" -- usual form vs. rare pausal-type form, both in the very same verse, Leviticus 17:3'],
  ['ועבדתם', '"you (masc. pl.) shall serve" -- usual ending vs. rare pausal ending, same pattern as ידעתם above'],
  ['בהרת', '"bright spot" (singular) vs. "bright spots" (plural), Leviticus 13'],
  ['מרים', '"Miriam" (proper name) vs. "bitter" vs. "one who lifts" -- three different words'],
  ['ילד', '"he fathered/begat" (active) vs. "he was born" (passive) -- opposite grammatical voice'],
  ['רעה', '"shepherd" vs. "evil/bad" -- about as different as two meanings get, and they appear in the very same verse, Genesis 37:2'],
]);

// How formulaic an aliyah is -- measured, not inferred from the parsha's
// general character. Formulaic text is EASIER to prepare (once you have the
// template, each repeat costs less than equivalent novel text), so this
// feeds difficulty negatively; see difficulty-rubric.md.
//
// Two different shapes of repetition need catching, and one measure alone
// misses half of them:
//
//   1. Verbatim block repetition -- the Nesiim offerings (Num 7) repeat
//      whole paragraphs near-identically. Recurring word 4-grams catch this.
//   2. Template repetition -- the 42 journey stations (Num 33) repeat the
//      frame "traveled from X, camped at Y" while every content word
//      changes. 4-grams score this a flat 0%; repeated verse-openings catch
//      it at 90%. Genealogies and the daily-offering lists behave the same.
//
// Taking the max of the two means an aliyah counts as formulaic if EITHER
// kind of pattern is present, which is what a reader actually experiences.
function recurringNgramShare(words, n = 4) {
  if (words.length < n * 2) return 0;
  const seen = new Map();
  for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n).join(' ');
    seen.set(g, (seen.get(g) || 0) + 1);
  }
  let dup = 0, total = 0;
  for (const c of seen.values()) { total += c; if (c > 1) dup += c; }
  return total === 0 ? 0 : dup / total;
}
function repeatedVerseOpeningShare(verses) {
  if (verses.length < 3) return 0; // too few verses for "a pattern" to mean anything
  const opens = new Map();
  for (const v of verses) {
    const first = v.words[0]?.consonantal;
    if (!first) continue;
    opens.set(first, (opens.get(first) || 0) + 1);
  }
  let repeated = 0;
  for (const c of opens.values()) if (c > 1) repeated += c;
  return repeated / verses.length;
}

// ---- Proper-name detection, without a hand-typed list of names ----
// Hebrew doesn't capitalise, and no part-of-speech data ships with the text,
// so names are found structurally: certain words reliably introduce one
// ("ben X", "eretz X", "har X", "vayachanu be-X"). A word is treated as a
// name if it repeatedly sits in that slot, or is uncommon and sits there at
// least once.
//
// Deliberately misses מצרים and אהרן, and that is correct rather than a bug:
// they are far too frequent to clear the ratio test, and nobody fumbles
// "Egypt" or "Aaron". What this captures is the unfamiliar names that
// actually cause trouble -- דפקה, אלוש, רפידם. Verified independent of the
// existing vocabulary score (correlation with word rarity is only 0.22), so
// it adds information rather than counting rare words twice.
const NAME_TRIGGERS = new Set(['בן','בני','בת','בנות','ארץ','הר','מדבר','עיר','למטה','ממטה','למשפחת','משפחת','שם','ושם','ויחנו','ויסעו','נחל','מלך','אלהי','בית','אבי','אחי']);
// Strip one inseparable prefix so "בדפקה" resolves to "דפקה".
const nameBase = (w) => (w.length > 3 ? w.replace(/^[ובלמהכש]/, '') : w);

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
        return { surface, consonantal: cons, withTrope: surfaceTrope };
      });
      // Cantillation actually present in this verse, kept alongside the
      // stripped forms so trope can be measured per-aliyah from the real
      // text instead of inferred from the parsha's general character.
      const tierA = [];
      let tierB = 0;
      for (const w of words) {
        for (const chr of w.withTrope) {
          const a = TROPE_TIER_A.get(chr);
          if (a) tierA.push({ mark: a, word: stripTrope(w.withTrope) });
          else if (TROPE_TIER_B.has(chr)) tierB++;
        }
      }
      return { verse: v.verse, words, ketivQere: extractKetivQere(v.text), tierA, tierB };
    });
    ch++;
  }
}
console.log('Loaded Torah text:', totalTokens, 'word tokens,', freq.size, 'unique consonantal forms');

// ---- build the proper-name lexicon (needs the whole text, so it runs here) ----
const nameSlotHits = new Map(); // base form -> times seen right after a trigger
const baseTotals = new Map();   // base form -> total occurrences
for (const bookEn of Object.keys(BOOK_EN_TO_HE)) {
  for (const chapter of Object.values(versesByBookChapter[bookEn])) {
    for (const v of chapter) {
      for (let i = 0; i < v.words.length; i++) {
        const b = nameBase(v.words[i].consonantal);
        baseTotals.set(b, (baseTotals.get(b) || 0) + 1);
        const prev = i > 0 ? v.words[i - 1].consonantal : null;
        if (prev && (NAME_TRIGGERS.has(prev) || NAME_TRIGGERS.has(nameBase(prev)))) {
          nameSlotHits.set(b, (nameSlotHits.get(b) || 0) + 1);
        }
      }
    }
  }
}
const PROPER_NAMES = new Set();
for (const [w, hits] of nameSlotHits) {
  if (w.length < 3) continue;
  const total = baseTotals.get(w) || 1;
  if (hits >= 2 && hits / total >= 0.30) PROPER_NAMES.add(w);      // repeatedly name-positioned
  else if (hits >= 1 && total <= 20) PROPER_NAMES.add(w);          // uncommon, seen in a name slot
}
console.log('Proper-name lexicon:', PROPER_NAMES.size, 'forms (structural cues, no hand-typed list)');

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
    ambiguousSpellingExamples.push({ word: w.surface, kind: 'archaic-hu', note: 'Spelled the same as הוּא ("hu", he) but read here as "hi" (she) -- an archaic Torah spelling.' });
  }
  const seenK = new Set();
  for (const v of verses) {
    for (const kq of v.ketivQere) {
      const key = `${kq.ketiv}>${kq.qere}`;
      if (seenK.has(key)) continue;
      seenK.add(key);
      ambiguousSpellingExamples.push({ word: kq.qere, kind: 'ketiv-qere', note: `Formal Ketiv/Qere: the Torah scroll is written ${kq.ketiv} but traditionally read aloud as ${kq.qere}.` });
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

  const confusableLetterPairs = [];
  for (let i = 0; i < consList.length; i++) {
    for (let j = i + 1; j < consList.length; j++) {
      const cl = confusableLetterDiff(consList[i], consList[j]);
      if (cl) confusableLetterPairs.push({ a: distinctForms.get(consList[i]), b: distinctForms.get(consList[j]), letters: cl });
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

  // ---- measured cantillation (see TROPE_TIER_A/B above) ----
  // Tier A marks are surfaced individually: a shalshelet or a yerach ben
  // yomo is a discrete "you will meet this once in years" event, not a
  // density. Tier B is a density -- how busy this aliyah's trope is
  // relative to its length.
  const rareTropeMarks = [];
  const seenMark = new Set();
  let uncommonTropeCount = 0;
  for (const v of verses) {
    for (const t of v.tierA) {
      const key = `${t.mark}@${v.verse}`;
      if (seenMark.has(key)) continue;
      seenMark.add(key);
      rareTropeMarks.push({ mark: t.mark, word: t.word, verse: v.verse });
    }
    uncommonTropeCount += v.tierB;
  }
  const uncommonTropeDensity = uncommonTropeCount / words.length;

  const repetitionRatio = Math.max(
    recurringNgramShare(words.map(w => w.consonantal), 4),
    repeatedVerseOpeningShare(verses),
  );

  // The two look-alike flavours are counted SEPARATELY as well as pooled.
  // Pooling them alone understated the thing that actually trips readers up:
  // an identical-consonant pair differing only in nekudot is invisible on an
  // unvocalised scroll, whereas a one-letter ו/י difference is at least
  // visible if you look. The consumer weights them differently.
  const homographPairCount = lookAlikePairsRaw.filter((p) => p.severity === 2).length;
  const nearMissPairCount = lookAlikePairsRaw.filter((p) => p.severity === 1).length;

  const archaicHuCount = ambiguousSpellingExamples.filter((e) => e.kind === 'archaic-hu').length;
  const ketivQereCount = ambiguousSpellingExamples.filter((e) => e.kind === 'ketiv-qere').length;

  const properNameCount = words.filter((w) => PROPER_NAMES.has(nameBase(w.consonantal))).length;
  const properNameDensity = properNameCount / words.length;

  return { wordCount: words.length, rawRarity, rawPron, rareExamples, hardToPronounceExamples: hardExamples, ambiguousSpellingExamples, lookAlikeWordPairs, lookAlikePairCount: lookAlikePairsRaw.length, homographPairCount, nearMissPairCount, archaicHuCount, ketivQereCount, confusableLetterPairs: confusableLetterPairs.slice(0, 3), confusableLetterPairCount: confusableLetterPairs.length, rareTropeMarks, uncommonTropeDensity, repetitionRatio, properNameCount, properNameDensity };
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

// ---- reshaped aliyah 6, for the handful of parshiot that can host a
// 3-scroll week (Shabbat Shekalim/HaChodesh/Rosh Chodesh Chanukah landing on
// Rosh Chodesh) ----
// When aliyah 7 is reassigned to Rosh Chodesh's own scroll, aliyah 6 isn't
// just left as-is -- it RESHAPES to absorb what would otherwise be aliyah
// 7's opening verses (verified: Terumah's static aliyah 6 is Ex 27:1-8, but
// on a Shekalim+Rosh-Chodesh Shabbat it's actually Ex 27:1-19). That merged
// range is real parsha text (not Rosh Chodesh's), so it can and should be
// scored the same way as any other aliyah -- just once per hosting parsha,
// keyed distinctly (RESHAPED__<parshaId>) so it doesn't collide with or
// overwrite that parsha's own static aliyah 6 entry. Checked against the
// generated 100-year calendar (see gen_calendar.mjs): only these 6 parshiot
// ever actually produce a 3-scroll week across 2026-2126 -- Miketz,
// Mishpatim, Pekudei, Tazria, Terumah, Vayikra -- but the reshape itself is
// a fixed function of aliyah 6/7's own boundaries, not of the calendar, so
// listing them here doesn't need to track the calendar going forward.
const RESHAPED_SIXTH_ALIYAH_PARSHIOT = ['Miketz', 'Mishpatim', 'Pekudei', 'Tazria', 'Terumah', 'Vayikra'];
for (const parshaId of RESHAPED_SIXTH_ALIYAH_PARSHIOT) {
  const p = parshiot.find((x) => x.id === parshaId);
  const a6 = p?.aliyot.find((a) => String(a.aliyah) === '6');
  const a7 = p?.aliyot.find((a) => String(a.aliyah) === '7');
  if (!a6 || !a7) continue;
  const raw = rawAliyahStats(a6.book, a6.start, a7.end);
  if (raw) entries.push({ groupId: `RESHAPED__${parshaId}`, aliyahKey: '6', raw });
}

// ---- percentile-rank each aliyah's raw stats against all other aliyot ----
const rawRarities = entries.map(e => e.raw.rawRarity).sort((a, b) => a - b);
const rawPronunciations = entries.map(e => e.raw.rawPron).sort((a, b) => a - b);
const rawTropeDensities = entries.map(e => e.raw.uncommonTropeDensity).sort((a, b) => a - b);
const rawRepetitions = entries.map(e => e.raw.repetitionRatio).sort((a, b) => a - b);
const rawNameDensities = entries.map(e => e.raw.properNameDensity).sort((a, b) => a - b);
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
  // Both percentile-ranked against every other aliyah, the same way rarity
  // and pronunciation already are -- these are continuous, well-spread
  // measurements, which is exactly the case percentile-ranking suits (unlike
  // the zero-inflated lookAlikePairCount; see difficulty-rubric.md).
  // 'formulaicity' is oriented so HIGHER = more repetitive; the consumer
  // inverts it, since formulaic text is easier to prepare, not harder.
  const tropeRarity = round1(percentileRank(rawTropeDensities, e.raw.uncommonTropeDensity));
  const formulaicity = round1(percentileRank(rawRepetitions, e.raw.repetitionRatio));
  const properNames = round1(percentileRank(rawNameDensities, e.raw.properNameDensity));
  result[e.groupId] ??= {};
  result[e.groupId][e.aliyahKey] = {
    wordCount: e.raw.wordCount,
    rarity, pronunciation, vocab,
    tropeRarity, formulaicity, properNames,
    homographPairCount: e.raw.homographPairCount,
    nearMissPairCount: e.raw.nearMissPairCount,
    archaicHuCount: e.raw.archaicHuCount,
    ketivQereCount: e.raw.ketivQereCount,
    confusableLetterPairs: e.raw.confusableLetterPairs,
    confusableLetterPairCount: e.raw.confusableLetterPairCount,
    rareTropeMarks: e.raw.rareTropeMarks,
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
