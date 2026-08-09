// Per-haftarah text statistics, computed the same way as the Torah aliyah
// stats in gen_word_stats.mjs but over Nevi'im, and with one deliberate
// difference in what gets measured.
//
// A haftarah is chanted from a printed, VOCALIZED text -- nekudot and trope
// marks are both on the page. That removes almost the entire "gotchas"
// category at a stroke: there is no guessing which vowels a bare consonantal
// skeleton takes, no same-letters-different-nekudot trap, and formal
// Ketiv/Qere is resolved for you in print. Those signals are therefore NOT
// computed here -- not because they are hard to compute, but because they do
// not describe a real risk for this kind of reading.
//
// What does still vary between haftarot, and is measured:
//   - length, in words
//   - vocabulary: word rarity and pronunciation complexity
//   - cantillation: density of genuinely uncommon marks
//   - formulaicity: repeated phrasing is still easier to chant
//
// Scored for the ASHKENAZI reading only for now; haftarot.json also carries
// sefardi and chabad variants.
import { getChapter } from '@shafeh/tanach';
import { readFileSync, writeFileSync } from 'fs';

// haftarot.json uses English book names; the text package uses transliterated
// Hebrew ones.
const BOOK_TO_TANACH = {
  'Joshua': 'Yehoshua', 'Judges': 'Shoftim',
  'I Samuel': 'Shmuel I', 'II Samuel': 'Shmuel II',
  'I Kings': 'Melachim I', 'II Kings': 'Melachim II',
  'Isaiah': 'Yeshayahu', 'Jeremiah': 'Yirmiyahu', 'Ezekiel': 'Yechezkel',
  'Hosea': 'Hoshea', 'Joel': 'Yoel', 'Amos': 'Amos', 'Obadiah': 'Ovadiah',
  'Jonah': 'Yonah', 'Micah': 'Michah', 'Nahum': 'Nachum', 'Habakkuk': 'Chavakuk',
  'Zephaniah': 'Tzefaniah', 'Haggai': 'Chaggai', 'Zechariah': 'Zechariah',
  'Malachi': 'Malachi',
};
const TORAH = { Genesis: 'Bereishit', Exodus: 'Shemot', Leviticus: 'Vayikra', Numbers: 'Bamidbar', Deuteronomy: 'Devarim' };

const TROPE = /[֑-֯]/g;
const NIQQUD = /[ְ-ׇּׁׂ]/g;
const CHATAF = /[ֱֲֳ]/;
const DAGESH = /ּ/g;
const HEBREW_LETTER = /[א-ת]/;
const NON_LETTER = /[^א-תְ-ׇּׁׂ֑-֯]/g;
const GUTTURALS = /[אהחע]/g;
const RARE_OCCURRENCE_THRESHOLD = 5;

// Same two tiers as the Torah pipeline -- see gen_word_stats.mjs for how the
// cut-offs were measured.
const TROPE_TIER_A = new Map([['֪','yerach ben yomo'],['֓','shalshelet'],['֦','merkha kefula'],['֟','karnei parah']]);
const TROPE_TIER_B = new Map([['֡','pazer'],['֠','telisha gedola'],['֩','telisha qetana'],['֚','yetiv'],['֘','zarqa'],['֒','segol'],['֞','gershayim'],['֕','zaqef gadol']]);

const tokenize = (t) => t.split(/[\s־]+/).map((x) => x.replace(NON_LETTER, '')).filter((x) => HEBREW_LETTER.test(x));
const stripTrope = (w) => w.replace(TROPE, '');
const stripNiqqud = (w) => w.replace(NIQQUD, '');

function loadBook(tanachName) {
  const out = {};
  let ch = 1;
  while (true) {
    const chapter = getChapter(tanachName, ch);
    if (!chapter || chapter.length === 0) break;
    out[ch] = chapter.map((v) => {
      const words = tokenize(v.text).map((raw) => {
        const surface = stripTrope(raw);
        return { surface, consonantal: stripNiqqud(surface), withTrope: raw };
      });
      let tierB = 0; const tierA = [];
      for (const w of words) for (const c of w.withTrope) {
        const a = TROPE_TIER_A.get(c);
        if (a) tierA.push({ mark: a, word: w.surface });
        else if (TROPE_TIER_B.has(c)) tierB++;
      }
      return { verse: v.verse, words, tierA, tierB };
    });
    ch++;
  }
  return out;
}

// ---- frequency corpus: Torah + every Nevi'im book the haftarot draw on ----
// Rarity is judged against what a reader has actually been exposed to. For a
// haftarah that means the Torah they hear every week PLUS the prophetic books
// -- not the Torah alone, which would make ordinary prophetic vocabulary look
// far rarer than it functionally is.
const books = {};
const freq = new Map();
let corpusTokens = 0;
for (const name of [...Object.values(TORAH), ...new Set(Object.values(BOOK_TO_TANACH))]) {
  const b = loadBook(name);
  if (Object.keys(b).length === 0) continue;
  books[name] = b;
  for (const chapter of Object.values(b)) for (const v of chapter) for (const w of v.words) {
    freq.set(w.consonantal, (freq.get(w.consonantal) || 0) + 1);
    corpusTokens++;
  }
}
console.log('Corpus (Torah + Nevi\'im):', corpusTokens, 'tokens,', freq.size, 'unique forms across', Object.keys(books).length, 'books');

function pronRaw(surface) {
  const letters = surface.replace(NIQQUD, '').replace(TROPE, '');
  return letters.length
    + (letters.match(GUTTURALS) || []).length * 2
    + (CHATAF.test(surface) ? 3 : 0)
    + Math.min((surface.match(DAGESH) || []).length, 2);
}

// Percentile scales built over every word token in the corpus, mirroring the
// Torah pipeline so the two sets of sub-scores mean the same thing.
const allFreqs = [], allPron = [];
for (const b of Object.values(books)) for (const chapter of Object.values(b)) for (const v of chapter) for (const w of v.words) {
  allFreqs.push(freq.get(w.consonantal)); allPron.push(pronRaw(w.surface));
}
allFreqs.sort((a, b) => b - a);
allPron.sort((a, b) => a - b);
const clamp = (n) => Math.max(0, Math.min(10, n));
function wordRarity(consonantal) {
  const f = freq.get(consonantal) || 1;
  let lo = 0, hi = allFreqs.length - 1, idx = allFreqs.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (allFreqs[m] <= f) { idx = m; hi = m - 1; } else lo = m + 1; }
  return clamp(1 + (idx / (allFreqs.length - 1)) * 9);
}
function wordPron(surface) {
  const r = pronRaw(surface);
  let lo = 0, hi = allPron.length - 1, idx = allPron.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (allPron[m] >= r) { idx = m; hi = m - 1; } else lo = m + 1; }
  return clamp(1 + (idx / (allPron.length - 1)) * 9);
}

function versesIn(bookEnglish, start, end) {
  const tn = BOOK_TO_TANACH[bookEnglish];
  const b = tn && books[tn];
  if (!b) return null;
  const [sc, sv] = start.split(':').map(Number);
  const [ec, ev] = end.split(':').map(Number);
  const out = [];
  for (let ch = sc; ch <= ec; ch++) {
    const chapter = b[ch];
    if (!chapter) continue;
    for (const v of chapter) if (v.verse >= (ch === sc ? sv : -Infinity) && v.verse <= (ch === ec ? ev : Infinity)) out.push(v);
  }
  return out;
}

function recurringNgramShare(words, n = 4) {
  if (words.length < n * 2) return 0;
  const seen = new Map();
  for (let i = 0; i + n <= words.length; i++) { const g = words.slice(i, i + n).join(' '); seen.set(g, (seen.get(g) || 0) + 1); }
  let dup = 0, total = 0;
  for (const c of seen.values()) { total += c; if (c > 1) dup += c; }
  return total === 0 ? 0 : dup / total;
}
function repeatedVerseOpeningShare(verses) {
  if (verses.length < 3) return 0;
  const opens = new Map();
  for (const v of verses) { const f = v.words[0]?.consonantal; if (f) opens.set(f, (opens.get(f) || 0) + 1); }
  let r = 0; for (const c of opens.values()) if (c > 1) r += c;
  return r / verses.length;
}

// ---- measure every haftarah ----
const { haftarot } = JSON.parse(readFileSync('../data/haftarot.json', 'utf8'));
const raws = [];
const missing = [];
for (const h of haftarot) {
  const ash = h.nusach?.ashkenazi;
  if (!ash || ash.sameAs) continue;
  const parts = Array.isArray(ash) ? ash : [ash];
  let verses = [];
  let ok = true;
  for (const p of parts) {
    const vs = versesIn(p.book, p.start, p.end);
    if (!vs || vs.length === 0) { ok = false; missing.push(`${h.id}: ${p.book} ${p.start}-${p.end}`); break; }
    verses = verses.concat(vs);
  }
  if (!ok) continue;
  const words = verses.flatMap((v) => v.words);
  if (words.length === 0) continue;

  const rarityVals = words.map((w) => wordRarity(w.consonantal));
  const pronVals = words.map((w) => wordPron(w.surface));
  const seen = new Set(); const rareExamples = [];
  for (const w of [...words].sort((a, b) => (freq.get(a.consonantal) || 0) - (freq.get(b.consonantal) || 0))) {
    if (seen.has(w.consonantal)) continue;
    const occ = freq.get(w.consonantal) || 0;
    if (occ > RARE_OCCURRENCE_THRESHOLD) break;
    seen.add(w.consonantal);
    rareExamples.push({ word: w.surface, occurrencesInCorpus: occ });
    if (rareExamples.length >= 3) break;
  }
  const seenH = new Set(); const hardExamples = [];
  for (const w of [...words].sort((a, b) => pronRaw(b.surface) - pronRaw(a.surface))) {
    if (seenH.has(w.surface)) continue;
    seenH.add(w.surface);
    hardExamples.push({ word: w.surface });
    if (hardExamples.length >= 3) break;
  }
  const rareTropeMarks = [];
  let tierB = 0;
  for (const v of verses) { for (const t of v.tierA) rareTropeMarks.push({ mark: t.mark, word: t.word, verse: v.verse }); tierB += v.tierB; }

  raws.push({
    id: h.id,
    parsha: h.parsha || h.id,
    ref: parts.map((p) => ({ book: p.book, start: p.start, end: p.end, verses: p.verses })),
    verseCount: verses.length,
    wordCount: words.length,
    rawRarity: rarityVals.reduce((s, v) => s + v, 0) / rarityVals.length,
    rawPron: pronVals.reduce((s, v) => s + v, 0) / pronVals.length,
    uncommonTropeDensity: tierB / words.length,
    repetitionRatio: Math.max(recurringNgramShare(words.map((w) => w.consonantal), 4), repeatedVerseOpeningShare(verses)),
    rareExamples, hardToPronounceExamples: hardExamples, rareTropeMarks,
  });
}
if (missing.length) console.log('Could not resolve text for', missing.length, 'haftarah range(s):', missing.slice(0, 5).join('; '));

// Percentile-rank each haftarah against the others, the same way aliyot are
// ranked against aliyot.
const sortedAsc = (k) => raws.map((r) => r[k]).sort((a, b) => a - b);
const rarities = sortedAsc('rawRarity'), prons = sortedAsc('rawPron');
const tropes = sortedAsc('uncommonTropeDensity'), reps = sortedAsc('repetitionRatio');
function pct(arr, v) {
  let i = arr.findIndex((x) => x >= v);
  if (i === -1) i = arr.length - 1;
  return clamp(1 + (i / (arr.length - 1)) * 9);
}
const round1 = (n) => Math.round(n * 10) / 10;

const out = {};
for (const r of raws) {
  const rarity = round1(pct(rarities, r.rawRarity));
  const pronunciation = round1(pct(prons, r.rawPron));
  out[r.id] = {
    parsha: r.parsha, nusach: 'ashkenazi', ref: r.ref,
    verseCount: r.verseCount, wordCount: r.wordCount,
    rarity, pronunciation,
    vocab: clamp(Math.round((rarity + pronunciation) / 2)),
    tropeRarity: round1(pct(tropes, r.uncommonTropeDensity)),
    formulaicity: round1(pct(reps, r.repetitionRatio)),
    rareExamples: r.rareExamples,
    hardToPronounceExamples: r.hardToPronounceExamples,
    rareTropeMarks: r.rareTropeMarks,
  };
}

writeFileSync('../data/haftarah-difficulty.json', JSON.stringify({
  description: "Per-haftarah text statistics for the ASHKENAZI reading, computed from the Masoretic text of Nevi'im (via @shafeh/tanach). Mirrors the Torah aliyah pipeline in gen_word_stats.mjs with one deliberate difference: the nekudot-homograph, Ketiv/Qere and look-alike-pair signals are NOT computed. A haftarah is chanted from a printed vocalized text with both nekudot and trope marks on the page, so those traps -- which all depend on reading unpointed letters off a scroll -- do not describe a real risk here. Word rarity is measured against a Torah + Nevi'im corpus rather than the Torah alone, since that is the text a haftarah reader has actually been exposed to; judging prophetic vocabulary against the Chumash alone would make ordinary Nevi'im words look far rarer than they functionally are. Sub-scores are percentile-ranked against the other haftarot, the same way aliyot are ranked against aliyot.",
  corpus: { tokens: corpusTokens, uniqueForms: freq.size, books: Object.keys(books).length },
  nusach: 'ashkenazi',
  methodology: 'difficulty-rubric.md',
  generatedAt: new Date().toISOString(),
  count: Object.keys(out).length,
  haftarot: out,
}, null, 2));
console.log('Wrote haftarah-difficulty.json for', Object.keys(out).length, 'haftarot');
const wc = raws.map((r) => r.wordCount).sort((a, b) => a - b);
console.log('  word count: min', wc[0], ' median', wc[Math.floor(wc.length / 2)], ' max', wc[wc.length - 1]);
