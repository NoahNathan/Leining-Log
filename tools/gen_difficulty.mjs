import { readFileSync, writeFileSync } from 'fs';

const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));
const { combinedParshiot } = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8'));
const { chagim } = JSON.parse(readFileSync('../data/chagim.json', 'utf8'));
const wordDifficulty = JSON.parse(readFileSync('../data/word-difficulty.json', 'utf8')).aliyot;

// ---- Content-profile tags -> baseline sub-scores (0-10) for trope/repetition/hidden ----
// Vocabulary is NOT driven by these anymore -- see word-difficulty.json (real
// word-frequency + pronunciation-complexity data computed from the Masoretic
// text). These profiles now only inform the three criteria that genuinely
// can't be measured directly from the text: trope, repetition, hidden challenges.
//
// "repetition" here means formulaic, learnable-pattern repetition (the same
// phrasing repeated with one changing detail) -- and it LOWERS difficulty:
// once a reader has the template, each repetition is easier than genuinely
// novel text, not harder. (An earlier version of this rubric scored it the
// opposite way; see difficulty-rubric.md for why that was wrong.) The
// residual real risk of formulaic text -- losing your place, defaulting to
// autopilot and saying the wrong day's number -- is captured under "hidden
// challenges" instead, on the specific aliyot where it applies, not baked
// into the repetition score itself.
const PROFILES = {
  NARRATIVE:  { trope: 3, repetition: 3, hidden: 2 }, // no repetition to lean on, but nothing else hidden either
  GENEALOGY:  { trope: 4, repetition: 2, hidden: 6 }, // formulaic lists (census, gift lists) -- the pattern eases it; tracking which entry you're on is the real risk
  POETRY:     { trope: 9, repetition: 3, hidden: 8 }, // Shirah layout + rare trope combos
  LEGAL:      { trope: 4, repetition: 3, hidden: 5 }, // dense mitzvot, frequent topic shifts
  RITUAL:     { trope: 5, repetition: 3, hidden: 5 }, // technical/priestly/construction content, often formulaic itself
  TOCHACHA:   { trope: 4, repetition: 3, hidden: 8 }, // emotionally loaded, read fast & quiet
};

// Parsha-level profile blend: [primary, secondary?]
const PARSHA_PROFILE = {
  'Bereshit': ['NARRATIVE','GENEALOGY'], 'Noach': ['NARRATIVE','GENEALOGY'],
  'Lech-Lecha': ['NARRATIVE'], 'Vayera': ['NARRATIVE'], 'Chayei Sara': ['NARRATIVE'],
  'Toldot': ['NARRATIVE'], 'Vayetzei': ['NARRATIVE'], 'Vayishlach': ['NARRATIVE','GENEALOGY'],
  'Vayeshev': ['NARRATIVE'], 'Miketz': ['NARRATIVE'], 'Vayigash': ['NARRATIVE','GENEALOGY'],
  'Vayechi': ['NARRATIVE','POETRY'],
  'Shemot': ['NARRATIVE'], 'Vaera': ['NARRATIVE','GENEALOGY'], 'Bo': ['NARRATIVE','RITUAL'],
  'Beshalach': ['NARRATIVE','POETRY'], 'Yitro': ['NARRATIVE','POETRY'], 'Mishpatim': ['LEGAL'],
  'Terumah': ['RITUAL'], 'Tetzaveh': ['RITUAL'], 'Ki Tisa': ['NARRATIVE','RITUAL'],
  'Vayakhel': ['RITUAL'], 'Pekudei': ['RITUAL'],
  'Vayikra': ['RITUAL'], 'Tzav': ['RITUAL'], 'Shmini': ['NARRATIVE','RITUAL'],
  'Tazria': ['RITUAL'], 'Metzora': ['RITUAL'], 'Achrei Mot': ['RITUAL','LEGAL'],
  'Kedoshim': ['LEGAL'], 'Emor': ['LEGAL','RITUAL'], 'Behar': ['LEGAL'],
  'Bechukotai': ['LEGAL','TOCHACHA'],
  'Bamidbar': ['GENEALOGY'], 'Nasso': ['GENEALOGY','RITUAL'], "Beha'alotcha": ['NARRATIVE','LEGAL'],
  "Sh'lach": ['NARRATIVE','LEGAL'], 'Korach': ['NARRATIVE','RITUAL'], 'Chukat': ['RITUAL','NARRATIVE'],
  'Balak': ['NARRATIVE','POETRY'], 'Pinchas': ['GENEALOGY','RITUAL'], 'Matot': ['LEGAL','NARRATIVE'],
  'Masei': ['GENEALOGY','LEGAL'],
  'Devarim': ['NARRATIVE'], 'Vaetchanan': ['NARRATIVE','POETRY'], 'Eikev': ['NARRATIVE'],
  "Re'eh": ['LEGAL'], 'Shoftim': ['LEGAL'], 'Ki Teitzei': ['LEGAL'], 'Ki Tavo': ['LEGAL','TOCHACHA'],
  'Nitzavim': ['NARRATIVE'], 'Vayeilech': ['NARRATIVE'], "Ha'azinu": ['POETRY'],
  'Vezot Haberakhah': ['POETRY','NARRATIVE'],
  // The 7 combined (double) parshiot -- blended from their two components'
  // profiles above (deduplicated; order doesn't matter, blendProfile averages).
  'Vayakhel-Pekudei': ['RITUAL'],
  'Tazria-Metzora': ['RITUAL'],
  'Achrei Mot-Kedoshim': ['RITUAL','LEGAL'],
  'Behar-Bechukotai': ['LEGAL','TOCHACHA'],
  'Chukat-Balak': ['RITUAL','NARRATIVE','POETRY'],
  'Matot-Masei': ['LEGAL','NARRATIVE','GENEALOGY'],
  'Nitzavim-Vayeilech': ['NARRATIVE'],
};

// Specific, well-documented per-aliyah overrides (additive, capped at 10).
// key = `${parshaId}:${aliyahNum}` -- every aliyah number below was checked
// against this parsha's actual verse ranges in parshiot.json /
// parshiot-combined.json, not assumed.
//
// What belongs here now: only the things the text itself cannot reveal.
// Trope density, rare cantillation marks and formulaicity are all measured
// per-aliyah from the real text (see gen_word_stats.mjs), so overrides for
// those have been deleted rather than left to drift out of sync. What
// remains is special melodies and scroll layouts (`tropeFloor`), reading
// customs like the Tochacha, and the risk of losing your place inside a
// repeated formula -- none of which are visible in the words or the marks.
const ALIYAH_OVERRIDES = {
  // `tropeFloor` sets a MINIMUM trope score, applied after the measured
  // mark-density. It exists because a handful of passages are hard to chant
  // for a reason the marks themselves cannot show: the reader has to learn a
  // separate melody or read from an unusual scroll layout. Shirat Ha'azinu
  // is the clearest case -- it is chanted to its own tune from a two-column
  // layout, yet its cantillation marks are entirely ordinary, so pure
  // density scores it near the bottom. Floors, not bumps, because the
  // difficulty is "there is a whole other melody to learn," which doesn't
  // scale with how busy the marks happen to be.
  'Beshalach:4':   { trope: +3, tropeFloor: 9, hidden: +2, note: 'Shirat HaYam / Az Yashir (Ex 15:1-19) -- special brick-layout & elevated melody' },
  'Yitro:6':       { trope: +3, tropeFloor: 9, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
  'Vaetchanan:4':  { trope: +2, tropeFloor: 9, hidden: +1, note: 'Aseret HaDibrot repeated (Deut 5:6-18) -- ta\'am elyon in many congregations' },
  "Ha'azinu:1":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu (Deut 32:1-43) -- its own melody, read from a two-column layout' },
  "Ha'azinu:2":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:3":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:4":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:5":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:6":    { tropeFloor: 9, hidden: +1, note: 'Shirat Ha\'azinu concludes (through Deut 32:43) -- its own melody, read from a two-column layout' },
  // NOTE: the four shalshelet entries that used to live here (Vayera:3,
  // Chayei Sara:3, Vayeshev:6, Tzav:6) have been REMOVED -- rare trope marks
  // are now detected directly from the cantillation in the text. The
  // auto-detection reproduces all four exactly, and additionally catches the
  // four merkha kefula and the single yerach ben yomo (Num 35:5, the rarest
  // mark in the Torah) that hand-curation had missed.
  //
  // Likewise, the `repetition:` adjustments that used to sit on Nasso:5-7,
  // Masei:1-2, Matot-Masei:4 and the Sukkot chol-hamoed readings are gone:
  // formulaicity is measured per-aliyah now. That also silently fixed a
  // mis-targeting -- the Sukkot repetition override sat on aliyah 1, which
  // measures 0% internal repetition, while the actually-formulaic reading is
  // aliyah 4. What remains below is only the part text can't see: the risk of
  // losing your place inside a formula and reading the wrong day's or
  // nasi's paragraph.
  'Nasso:5':       { hidden: +1, note: 'Start of the 12 nearly-identical Nesiim offerings (Num 7:1-41) -- easy to grab the wrong nasi\'s paragraph' },
  'Nasso:6':       { hidden: +1, note: 'Nesiim offerings continue (Num 7:42-71) -- same formula, same risk of losing track of which day/nasi you\'re on' },
  'Nasso:7':       { hidden: +1, note: 'Nesiim offerings conclude (Num 7:72-89) -- same formula, same risk of losing track of which day/nasi you\'re on' },
  'Masei:2':       { hidden: +1, note: 'Bulk of the 42 journey-stations list (Num 33:11-49) -- a long sequence of distinct place names to keep straight' },
  'Matot-Masei:4': { hidden: +1, note: 'Contains the bulk of the 42 journey-stations list (Num 33:1-49) alongside the Reuven/Gad settlement narrative -- many station names to keep straight' },
  'Bechukotai:3':  { hidden: +3, note: 'Tochacha (curses, Lev 26:14-46) -- traditional custom to read quickly and quietly' },
  'Behar-Bechukotai:5': { hidden: +3, note: 'Tochacha (curses, Lev 26:14-46) -- traditional custom to read quickly and quietly' },
  'Ki Tavo:5':     { hidden: +1, note: 'The 12 curses of Har Eival (Deut 27:15-26) -- repetitive "cursed be... amen" refrain' },
  'Ki Tavo:6':     { hidden: +3, note: 'Tochacha (curses, Deut 28:15-68) -- traditional custom to read quickly and quietly; the longest aliyah in the Torah by verse count' },
  'Chukat:6':      { trope: +1, hidden: +1, note: 'Includes the archaic poetic fragment "Az Yashir Yisrael" and a quote from the Book of the Wars of Hashem' },
  'Chukat-Balak:3':{ trope: +1, hidden: +1, note: 'Includes the archaic poetic fragment "Az Yashir Yisrael" (Num 21:17-20) and a quote from the Book of the Wars of Hashem' },
};

// ---- "Known leining": passages recited so often in davening that most
// regular daveners already know the text and cadence by heart. This does
// NOT reduce trope difficulty (familiarity with the words doesn't teach you
// the cantillation) or length (it's still that many verses) -- it only
// discounts the vocabulary score (real word-rarity/pronunciation data still
// applies in full underneath, this just softens the *felt* difficulty) and
// hidden challenges (unfamiliarity itself is much of what "hidden
// challenge" means here). None of these seven aliyot are ever part of a
// combined (double) parsha, so no combined-parsha entries are needed here.
const FAMILIAR_PASSAGE_DISCOUNTS = {
  'Vaetchanan:6': { vocab: -3, hidden: -4, note: 'Contains the Shema and V\'ahavta (Deut 6:4-9), recited twice daily -- most regular daveners already know this passage by heart, which offsets much of the unfamiliarity-driven difficulty (the words still must be read correctly from the text, not recited from memory).' },
  'Eikev:6':      { vocab: -2, hidden: -3, note: 'Contains the second paragraph of the Shema (Deut 11:13-21), recited twice daily -- widely known by heart.' },
  "Sh'lach:7":    { vocab: -1, hidden: -2, note: 'Ends with the third paragraph of the Shema / the tzitzit passage (Num 15:37-41), recited twice daily -- widely known by heart, though it is only the tail of this aliyah.' },
  'Yitro:6':      { vocab: -2, hidden: -1, note: 'The Aseret HaDibrot are also one of the most familiar passages in the Torah -- this softens the vocabulary/unfamiliarity difficulty even though the ta\'am elyon trope override above still applies in full.' },
  'Vaetchanan:4': { vocab: -2, hidden: -1, note: 'The Aseret HaDibrot are also one of the most familiar passages in the Torah -- this softens the vocabulary/unfamiliarity difficulty even though the ta\'am elyon trope override above still applies in full.' },
  'Nasso:4':      { vocab: -1, hidden: -1, note: 'Ends with Birkat Kohanim (Num 6:24-26), recited daily by kohanim and heard weekly by the whole congregation during duchening -- familiar, though it is only the tail of a long aliyah otherwise dominated by the (unfamiliar) sotah and nazir laws.' },
  'Beshalach:4':  { vocab: -2, hidden: -1, note: 'Az Yashir is recited daily in Pesukei D\'Zimra -- most daveners know the words well, though that familiarity doesn\'t fully prepare a reader to lead its special trope solo.' },
};

function clamp10(n) { return Math.max(0, Math.min(10, Math.round(n))); }

// Deliberately a direct count threshold, NOT a percentile rank. Percentile-
// ranking lookAlikePairCount was tried first and rejected: the count
// distribution is heavily zero-inflated (0-1 pairs in ~78% of aliyot), so
// percentile rank compresses almost the entire corpus into the top half of
// the 1-10 scale -- a single incidental pair (21% of aliyot) landed at the
// SAME bump as the genuinely dense tail, which is worse than not scoring it
// at all. A flat count threshold keeps the common case (0-1 pairs) at zero
// and only rewards aliyot that are actually unusual, in line with how many
// pairs realistically occur (see the corpus distribution in
// difficulty-rubric.md).
// All the text-measured gotcha signals, pooled into one weighted bump rather
// than several independent ones that could stack unpredictably.
//
// The weights reflect what actually catches readers out on an unvocalised
// scroll. Two words with identical consonants differing only in nekudot
// (אֹתוֹ / אִתּוֹ) are the worst case -- there is nothing on the parchment to
// tell them apart -- and formal Ketiv/Qere is the same problem by Masoretic
// decree. A one-letter ו/י near-miss is milder: it is at least visible if
// you look. Rare cantillation and dense runs of unfamiliar names are real
// but secondary.
//
// Counts are used, not just presence. Previously any number of Ketiv/Qere
// scored a flat +1, so an aliyah with seven of them ranked level with one
// that had a single instance; 44 aliyot carry two or more.
function measuredGotchaPoints(wd) {
  if (!wd) return 0;
  const homographs = wd.homographPairCount || 0;
  const nearMisses = wd.nearMissPairCount || 0;
  const ambiguous = (wd.ambiguousSpellingExamples || []).length;
  const rareTrope = (wd.rareTropeMarks || []).length;
  const names = wd.properNames || 1; // 1-10 percentile of proper-name density

  let pts = 0;
  pts += homographs * 2.0; // identical letters, different nekudot
  pts += ambiguous * 1.5;  // הוא/הִיא and formal Ketiv/Qere
  pts += rareTrope * 2.0;  // shalshelet / yerach ben yomo / merkha kefula
  pts += nearMisses * 0.5; // one internal ו/י apart
  if (names >= 9) pts += 1.5;
  else if (names >= 7) pts += 0.75;
  return pts;
}

// Raw points run 0 to 15.25 and are 34% zero, so they are NOT percentile-
// ranked -- that is the same zero-inflation trap documented for pair counts
// earlier in difficulty-rubric.md. A fixed ladder keeps the top end
// distinguishable instead of collapsing everything above 8 points together.
function measuredGotchaScore(pts) {
  if (pts >= 14) return 10;
  if (pts >= 11) return 9;
  if (pts >= 8) return 8;
  if (pts >= 6) return 7;
  if (pts >= 4.5) return 6;
  if (pts >= 3) return 5;
  if (pts >= 2) return 4;
  if (pts >= 1) return 3;
  if (pts > 0) return 2;
  return 0;
}
function blendProfile(tags) {
  const profs = tags.map(t => PROFILES[t]);
  const keys = ['trope','repetition','hidden'];
  const out = {};
  for (const k of keys) out[k] = profs.reduce((s,p)=>s+p[k],0) / profs.length;
  return out;
}

// ---- length score: percentile rank of WORD count across ALL individual-parsha aliyot ----
// (Combined parshiot and chagim are scored against this same fixed scale --
// not re-based on their own population -- so a 200-word aliyah always means
// the same length score everywhere in the dataset.)
//
// Word count, not verse count. Verses are not equal units: across the
// dataset they run from 6.1 to 21.0 words each, a 3.4x spread. Ranking by
// verses instead of words moves some aliyot by more than 200 places out of
// 858 -- e.g. Tazria 7 is 5 verses but 102 words (20.4 w/v), while the
// Sukkot chol-hamoed 4th aliyot are 6 verses but only 54 words (9.0 w/v),
// so the "shorter" reading is nearly twice the text. Since length carries
// half the final score, that error dominated everything else in the rubric.
const MEAN_WORDS_PER_VERSE = 13.57; // dataset mean, only used if word data is missing
const allCounts = [];
for (const p of parshiot) {
  for (const a of p.aliyot) {
    const wc = wordDifficulty[p.id]?.[String(a.aliyah)]?.wordCount;
    if (wc) allCounts.push(wc);
  }
}
allCounts.sort((a,b)=>a-b);
function lengthScore(wordCount) {
  let idx = allCounts.findIndex(v => v >= wordCount);
  if (idx === -1) idx = allCounts.length - 1;
  const pct = idx / (allCounts.length - 1); // 0..1
  return clamp10(1 + pct * 9); // 1..10
}

// Length dominates the final score by design (see difficulty-rubric.md):
// 50% length, 20% hidden challenges (gotchas), 10% each for vocabulary,
// trope, and repetition.
const RUBRIC_WEIGHTS = { length: 5, vocab: 1, trope: 1, repetition: 1, hidden: 2 };
const TOTAL_WEIGHT = Object.values(RUBRIC_WEIGHTS).reduce((s, w) => s + w, 0);

// ---- pass 1: score every reading's aliyot with RAW (unrescaled) final values ----
// Generic scorer: given a reading's items (each with a key + verse count),
// its content-profile tags, and any specific overrides/familiarity
// discounts keyed `${id}:${itemKey}`, produces the same shape of result for
// parshiot, combined parshiot, and chagim alike.
function scoreReadingRaw(id, items, tags, overridesMap, familiarMap) {
  const base = blendProfile(tags);
  const itemScores = [];
  for (const item of items) {
    const ov = overridesMap[`${id}:${item.key}`] || {};
    const fam = familiarMap[`${id}:${item.key}`] || {};
    const wd = wordDifficulty[id]?.[item.key];
    const vocabBase = wd ? wd.vocab : 5; // fallback should never actually trigger
    const vocab = clamp10(vocabBase + (fam.vocab || 0));
    // Trope is now measured per-aliyah from the actual cantillation in the
    // text (density of genuinely uncommon marks -- see TROPE_TIER_B in
    // gen_word_stats.mjs), not inferred from the parsha's general character.
    // The hand overrides that remain are the ones text can't show: special
    // melodies (Az Yashir, ta'am elyon) that a reader must learn separately.
    const trope = Math.max(
      clamp10((wd ? wd.tropeRarity : base.trope) + (ov.trope || 0)),
      ov.tropeFloor || 0,
    );
    // Formulaic text is EASIER once the template is learned, so the measured
    // formulaicity (1-10, higher = more repetitive) is inverted into a
    // "how much genuinely novel text" score that adds to difficulty.
    const repetition = clamp10((wd ? 11 - wd.formulaicity : base.repetition) + (ov.repetition || 0));
    // MAX, not sum. Gotchas has two independent sources: textual traps we can
    // measure (nekudot homographs, Ketiv/Qere, rare marks, name runs) and
    // contextual risks we can't (the Tochacha read-quiet custom, a two-column
    // poetic layout, a reading that comes round once a year). An aliyah is
    // risky if EITHER is high, so the score takes whichever dominates.
    //
    // Summing them was wrong and produced a visible ranking failure:
    // Ha'azinu 3, with barely a third of the measured signal of Vayishlach 5,
    // outscored it 10 to 9 purely because POETRY carries a base of 8 while
    // NARRATIVE carries 2. Hand overrides still add on top, since those
    // encode a risk genuinely additional to both.
    const measured = measuredGotchaScore(measuredGotchaPoints(wd));
    const hidden = clamp10(Math.max(base.hidden, measured) + (ov.hidden || 0) + (fam.hidden || 0));
    const length = lengthScore(wd ? wd.wordCount : Math.round(item.verses * MEAN_WORDS_PER_VERSE));
    const rawFinal = (length*RUBRIC_WEIGHTS.length + vocab*RUBRIC_WEIGHTS.vocab + trope*RUBRIC_WEIGHTS.trope +
                       repetition*RUBRIC_WEIGHTS.repetition + hidden*RUBRIC_WEIGHTS.hidden) / TOTAL_WEIGHT;
    const entry = {
      aliyah: item.key, verses: item.verses,
      scores: { length, vocabulary: vocab, trope, repetition, hiddenChallenges: hidden },
      rawFinal,
    };
    if (wd) {
      entry.wordCount = wd.wordCount; // length is scored on words, so show them
      entry.vocabDetail = { rarity: wd.rarity, pronunciation: wd.pronunciation, rareExamples: wd.rareExamples, hardToPronounceExamples: wd.hardToPronounceExamples };
      if (wd.ambiguousSpellingExamples && wd.ambiguousSpellingExamples.length) {
        entry.ambiguousSpellingExamples = wd.ambiguousSpellingExamples;
      }
      if (wd.lookAlikeWordPairs && wd.lookAlikeWordPairs.length) {
        entry.lookAlikeWordPairs = wd.lookAlikeWordPairs;
      }
      if (wd.rareTropeMarks && wd.rareTropeMarks.length) {
        entry.rareTropeMarks = wd.rareTropeMarks;
      }
    }
    const notes = [ov.note, fam.note].filter(Boolean);
    if (notes.length) entry.note = notes.join(' ');
    if (fam.note) entry.wellKnown = true;
    itemScores.push(entry);
  }
  return { profile: tags, aliyot: itemScores };
}

function readingItemsForParsha(p) {
  return p.aliyot.map(a => ({ key: String(a.aliyah), verses: a.verses }));
}
function readingItemsForChag(c) {
  return [
    ...(c.aliyot || []).map(a => ({ key: String(a.aliyah), verses: a.verses })),
    ...(c.maftir ? [{ key: 'M', verses: c.maftir.verses }] : []),
  ];
}

// Chagim: content-profile tags by id-prefix pattern (DIASPORA/IL pairs share
// identical Torah content in every case in this dataset, so one pattern
// covers both regions). Verified against actual chagim.json book/verse
// ranges, not assumed -- see difficulty-rubric.md for specifics.
function chagProfile(name) {
  if (/^Rosh Chodesh/.test(name)) return ['RITUAL'];
  if (/^Chanukah/.test(name)) return ['RITUAL', 'GENEALOGY']; // Nesiim-family repetitive gift lists (Num 7), same text as Nasso
  if (/^(Purim|Shushan Purim)$/.test(name)) return ['NARRATIVE'];
  if (/^(Asara B'Tevet|Ta'anit Esther|Tzom Gedaliah|Tzom Tammuz)$/.test(name)) return ['NARRATIVE'];
  if (/^Tish'a B'Av/.test(name)) return ['NARRATIVE', 'TOCHACHA']; // borrows TOCHACHA's "read slow/quiet, emotionally loaded" baseline, not curses content
  if (/^Rosh Hashana/.test(name)) return ['NARRATIVE'];
  if (/^Yom Kippur/.test(name)) return ['RITUAL', 'LEGAL'];
  if (/^(Pesach I|Pesach VIII)$/.test(name)) return ['NARRATIVE', 'RITUAL'];
  if (/^Pesach (II|III|IV|V|VI)( |$)/.test(name)) return ['RITUAL'];
  if (/^Pesach VII/.test(name)) return ['NARRATIVE', 'POETRY'];
  if (/^Sukkot (I|II)$/.test(name)) return ['RITUAL'];
  if (/^Sukkot (III|IV|V|VI|VII)/.test(name)) return ['RITUAL'];
  if (/^Shmini Atzeret/.test(name)) return ['LEGAL'];
  if (/^Simchat Torah/.test(name)) return ['POETRY', 'NARRATIVE'];
  if (/^Shavuot/.test(name)) return ['NARRATIVE', 'POETRY'];
  if (/^Shabbat (Shekalim|Parah|HaChodesh)/.test(name)) return ['RITUAL'];
  if (/^Shabbat Zachor/.test(name)) return ['NARRATIVE'];
  if (/^Yom HaAtzma'ut/.test(name)) return ['NARRATIVE'];
  return ['NARRATIVE'];
}

// Chag-specific overrides -- same idea as ALIYAH_OVERRIDES above, keyed
// `${chagId}:${itemKey}` where itemKey is the numbered aliyah or 'M' for
// maftir. Each verified against the actual book/verse range in chagim.json.
const CHAG_OVERRIDES = {};
for (const region of ['DIASPORA', 'IL']) {
  Object.assign(CHAG_OVERRIDES, {
    [`Shavuot I__${region}:4`]: { trope: +3, tropeFloor: 9, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
    [`Shavuot__${region}:4`]:   { trope: +3, tropeFloor: 9, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
    [`Pesach VII__${region}:5`]:{ trope: +3, tropeFloor: 9, hidden: +2, note: 'Shirat HaYam / Az Yashir (Ex 14:26-15:26) -- special brick-layout & elevated melody' },
    // Repetition adjustments removed here too -- measured per-aliyah now,
    // which also corrects these: the formulaic reading on these days is
    // aliyah 4 (which re-covers two days' paragraphs), not aliyah 1. What
    // stays is the genuine hidden risk these notes describe.
    [`Sukkot III (CH''M)__${region}:1`]: { hidden: +1, note: 'Start of the daily-decreasing bull count (Num 29) -- each day\'s bull count is one lower than the day before, so it\'s easy to default to the wrong number' },
    [`Sukkot IV (CH''M)__${region}:1`]:  { hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same risk of defaulting to the wrong day\'s number' },
    [`Sukkot V (CH''M)__${region}:1`]:   { hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same risk of defaulting to the wrong day\'s number' },
    [`Sukkot VI (CH''M)__${region}:1`]:  { hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same risk of defaulting to the wrong day\'s number' },
    [`Sukkot VII (Hoshana Raba)__${region}:1`]: { hidden: +1, note: 'Daily-decreasing bull count concludes (Num 29) -- same risk of defaulting to the wrong day\'s number' },
  });
}
const CHAG_FAMILIAR = {};
for (const region of ['DIASPORA', 'IL']) {
  Object.assign(CHAG_FAMILIAR, {
    [`Shavuot I__${region}:4`]: { vocab: -2, hidden: -1, note: 'The Aseret HaDibrot are one of the most familiar passages in the Torah -- softens the vocabulary/unfamiliarity difficulty even though the ta\'am elyon trope override still applies in full.' },
    [`Shavuot__${region}:4`]:   { vocab: -2, hidden: -1, note: 'The Aseret HaDibrot are one of the most familiar passages in the Torah -- softens the vocabulary/unfamiliarity difficulty even though the ta\'am elyon trope override still applies in full.' },
    [`Pesach VII__${region}:5`]:{ vocab: -2, hidden: -1, note: 'Az Yashir is recited daily in Pesukei D\'Zimra -- most daveners know the words well, though that familiarity doesn\'t fully prepare a reader to lead its special trope solo.' },
  });
}

const rawParshiot = parshiot.map(p => ({
  p, combined: false,
  raw: scoreReadingRaw(p.id, readingItemsForParsha(p), PARSHA_PROFILE[p.id] || ['NARRATIVE'], ALIYAH_OVERRIDES, FAMILIAR_PASSAGE_DISCOUNTS),
}));
const rawCombined = combinedParshiot.map(p => ({
  p, combined: true,
  raw: scoreReadingRaw(p.id, readingItemsForParsha(p), PARSHA_PROFILE[p.id] || ['NARRATIVE'], ALIYAH_OVERRIDES, FAMILIAR_PASSAGE_DISCOUNTS),
}));
const rawChagim = chagim
  .map(c => {
    const items = readingItemsForChag(c);
    if (items.length === 0) return null; // e.g. Shabbat HaGadol/Shuva, Erev Purim/Tisha B'Av -- no distinct Torah reading
    return { c, raw: scoreReadingRaw(c.id, items, chagProfile(c.name), CHAG_OVERRIDES, CHAG_FAMILIAR) };
  })
  .filter(Boolean);

// ---- pass 2: rescale every aliyah's raw final score against the WHOLE pool ----
// (parshiot + combined parshiot + chagim together, ~860 aliyot) so the full
// 1-10 range is actually used -- the single hardest aliyah in the dataset
// becomes a real 10, the single easiest becomes a real 1, exactly the way
// every other criterion (length, vocabulary, pronunciation) already works.
// Without this, the final score is a weighted average of several
// independent-ish 0-10 measurements, which mathematically clusters well
// short of both ends (see difficulty-rubric.md for the full explanation --
// this replaces the earlier version's "that's just how weighted averages
// work" answer with an actual fix).
const allRaw = [...rawParshiot, ...rawCombined, ...rawChagim]
  .flatMap(r => r.raw.aliyot.map(a => a.rawFinal));
const rawMin = Math.min(...allRaw);
const rawMax = Math.max(...allRaw);
function rescaleFinal(rawFinal) {
  const pct = (rawFinal - rawMin) / (rawMax - rawMin);
  return clamp10(1 + pct * 9);
}

function finalizeReading(raw) {
  for (const a of raw.aliyot) {
    a.finalScore = rescaleFinal(a.rawFinal);
    delete a.rawFinal;
  }
  const avg = (key) => Math.round((raw.aliyot.reduce((s,a)=>s+a.scores[key],0)/raw.aliyot.length)*10)/10;
  const finalScore = Math.round((raw.aliyot.reduce((s,a)=>s+a.finalScore,0)/raw.aliyot.length)*10)/10;
  return {
    profile: raw.profile,
    aliyot: raw.aliyot,
    scores: {
      length: avg('length'), vocabulary: avg('vocabulary'), trope: avg('trope'),
      repetition: avg('repetition'), hiddenChallenges: avg('hiddenChallenges'),
    },
    finalScore,
    hardestAliyah: raw.aliyot.reduce((m,a)=>a.finalScore>m.finalScore?a:m, raw.aliyot[0]).aliyah,
    easiestAliyah: raw.aliyot.reduce((m,a)=>a.finalScore<m.finalScore?a:m, raw.aliyot[0]).aliyah,
  };
}

const results = rawParshiot.map(({ p, combined, raw }) => {
  const scored = finalizeReading(raw);
  const result = {
    parshaId: p.id, combined,
    profile: scored.profile, aliyot: scored.aliyot,
    parshaScores: scored.scores, parshaFinalScore: scored.finalScore,
    hardestAliyah: scored.hardestAliyah, easiestAliyah: scored.easiestAliyah,
  };
  if (combined) result.componentParshiot = p.id.split('-');
  return result;
});
const combinedResults = rawCombined.map(({ p, combined, raw }) => {
  const scored = finalizeReading(raw);
  return {
    parshaId: p.id, combined,
    profile: scored.profile, aliyot: scored.aliyot,
    parshaScores: scored.scores, parshaFinalScore: scored.finalScore,
    hardestAliyah: scored.hardestAliyah, easiestAliyah: scored.easiestAliyah,
    componentParshiot: p.id.split('-'),
  };
});
const allResults = [...results, ...combinedResults].sort((a,b) => b.parshaFinalScore - a.parshaFinalScore);

const chagResults = rawChagim.map(({ c, raw }) => {
  const scored = finalizeReading(raw);
  return {
    chagId: c.id, name: c.name, region: c.region,
    profile: scored.profile, aliyot: scored.aliyot,
    scores: scored.scores, finalScore: scored.finalScore,
    hardestAliyah: scored.hardestAliyah, easiestAliyah: scored.easiestAliyah,
  };
}).sort((a,b) => b.finalScore - a.finalScore);

writeFileSync('../data/difficulty-scores.json', JSON.stringify({
  description: "Difficulty ratings (0-10 per criterion, plus a length-weighted, then dataset-wide-rescaled final score) for every aliyah of every parsha -- including the 7 combined (double) parshiot, each scored against its own combined-reading aliyah divisions rather than averaged from its two components -- AND every chag/fast/Rosh Chodesh/special-Shabbat reading in chagim.json (see the separate 'chagim' array). Generated with a transparent rule-based methodology, NOT a survey of actual leining outcomes. Vocabulary is computed from real word-frequency + pronunciation-complexity data over the Masoretic Torah text (see word-difficulty.json); the other four criteria are a content-profile heuristic. Final scores are rescaled against the full pool of ~860 aliyot (parshiot + combined + chagim) so the hardest aliyah in the dataset is a real 10 and the easiest a real 1. See difficulty-rubric.md for the full methodology and honest caveats.",
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  count: allResults.length,
  individualCount: results.length,
  combinedCount: combinedResults.length,
  parshiot: allResults,
  chagimCount: chagResults.length,
  chagim: chagResults,
}, null, 2));

console.log('Wrote difficulty-scores.json:', results.length, 'individual +', combinedResults.length, 'combined parshiot,', chagResults.length, 'chagim entries');
console.log('Top 5 hardest parshiot:', allResults.slice(0,5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Top 5 easiest parshiot:', allResults.slice(-5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Top 5 hardest chagim:', chagResults.slice(0,5).map(r=>`${r.chagId} (${r.finalScore})`));
console.log('Top 5 easiest chagim:', chagResults.slice(-5).map(r=>`${r.chagId} (${r.finalScore})`));
