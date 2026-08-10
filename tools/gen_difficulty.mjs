import { readFileSync, writeFileSync } from 'fs';

const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));
const { combinedParshiot } = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8'));
const { chagim } = JSON.parse(readFileSync('../data/chagim.json', 'utf8'));
const wordDifficulty = JSON.parse(readFileSync('../data/word-difficulty.json', 'utf8')).aliyot;
const haftarahStats = JSON.parse(readFileSync('../data/haftarah-difficulty.json', 'utf8')).haftarot;

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
  // POETRY's hidden baseline was 8 and is now 3. Measured evidence: across
  // the 56 poetry-tagged aliyot, raw gotcha points average 2.42 versus 2.48
  // for everything else -- statistically indistinguishable. The tag was
  // adding difficulty that nothing in the text supports, and doing it three
  // times over: the melody and layout are already carried by trope
  // (tropeFloor 9), and whatever the words cost is already carried by the
  // measured vocabulary score. The one genuine gotcha unique to a Song --
  // losing your place in the two-column layout -- is now an explicit +2 on
  // the Song passages themselves rather than a blanket parsha-wide 8.
  POETRY:     { trope: 9, repetition: 3, hidden: 3 },
  LEGAL:      { trope: 4, repetition: 3, hidden: 5 }, // dense mitzvot, frequent topic shifts
  RITUAL:     { trope: 5, repetition: 3, hidden: 5 }, // technical/priestly/construction content, often formulaic itself
  // TOCHACHA's hidden baseline dropped 8 -> 5 (i.e. no special baseline) for
  // the same reason as POETRY. The Tochacha is ONE aliyah in Bechukotai and
  // two in Ki Tavo, but a parsha-level tag inflated all 14: Bechukotai 7 has
  // zero measured gotcha points and was scoring 7 purely by association. The
  // read-fast-and-quiet custom is real, so its weight moved onto the actual
  // curse aliyot as a larger explicit override, leaving their scores where
  // they were while the surrounding aliyot fall back to ordinary LEGAL.
  TOCHACHA:   { trope: 4, repetition: 3, hidden: 5 },
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
  "Ha'azinu:1":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu (Deut 32:1-43) -- its own melody, read from a two-column layout' },
  "Ha'azinu:2":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:3":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:4":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:5":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu -- its own melody, read from a two-column layout' },
  "Ha'azinu:6":    { tropeFloor: 9, hidden: +2, note: 'Shirat Ha\'azinu concludes (through Deut 32:43) -- its own melody, read from a two-column layout' },
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
  'Bechukotai:3':  { hidden: +5, note: 'Tochacha (curses, Lev 26:14-46) -- traditional custom to read quickly and quietly' },
  'Behar-Bechukotai:5': { hidden: +5, note: 'Tochacha (curses, Lev 26:14-46) -- traditional custom to read quickly and quietly' },
  'Ki Tavo:5':     { hidden: +2, note: 'The 12 curses of Har Eival (Deut 27:15-26) -- repetitive "cursed be... amen" refrain' },
  'Ki Tavo:6':     { hidden: +5, note: 'Tochacha (curses, Deut 28:15-68) -- traditional custom to read quickly and quietly; the longest aliyah in the Torah by verse count' },
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
  const ketivQere = wd.ketivQereCount || 0;
  const archaicHu = wd.archaicHuCount || 0;
  const confusable = wd.confusableLetterPairCount || 0;
  const rareTrope = (wd.rareTropeMarks || []).length;
  const names = wd.properNames || 1; // 1-10 percentile of proper-name density

  let pts = 0;
  pts += homographs * 2.0; // identical letters, different nekudot
  pts += ketivQere * 2.0;  // formal Ketiv/Qere -- rare (7% of aliyot) and genuinely obscure
  pts += rareTrope * 2.0;  // shalshelet / yerach ben yomo / merkha kefula
  pts += archaicHu * 1.0;  // הוא/הִיא -- 2.2x more common than Ketiv/Qere, and most
                           // regular readers handle it automatically, so it scores lower
  pts += confusable * 0.75; // letters that look alike in scroll script (ד/ר, ה/ח, ב/כ ...)
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
  return [
    ...p.aliyot.map(a => ({ key: String(a.aliyah), verses: a.verses })),
    // Maftir was previously omitted here, so all 53 parsha maftir readings
    // were computed in word-difficulty.json and then never scored. Chagim
    // already included theirs, which is why special maftirs (Shekalim,
    // Zachor, Parah, HaChodesh, Rosh Chodesh, Chanukah) were present while
    // ordinary ones were missing.
    ...(p.maftir ? [{ key: 'M', verses: p.maftir.verses }] : []),
  ];
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
// Anchored on the numbered aliyot of the 54 ordinary parshiot ONLY.
// Previously the pool also held 431 chag/special readings (median 65 words
// against 195 for a parsha aliyah) and the 7 combined parshiot, which
// re-score the same verses as their components. Half the population defining
// "a 10" was therefore short holiday text and duplicates. Combined parshiot
// and chagim are still scored -- they are simply measured against the
// ordinary-Shabbat scale rather than helping to set it, so a short special
// reading now correctly lands low instead of dragging the scale down to meet
// it. Maftir is excluded from the anchor too, since on an ordinary Shabbat it
// re-reads the end of aliyah 7.
const allRaw = rawParshiot
  .flatMap(r => r.raw.aliyot.filter(a => a.aliyah !== 'M').map(a => a.rawFinal));
const rawMin = Math.min(...allRaw);
const rawMax = Math.max(...allRaw);
function rescaleFinal(rawFinal) {
  // pct is clamped to 0..1 because the anchor now covers ordinary parsha
  // aliyot only: a chag reading or a short maftir can sit below the shortest
  // parsha aliyah, which would otherwise produce a score under 1 (and, via
  // clamp10's zero floor, a meaningless 0). The scale is 1-10 by definition,
  // so anything at or below the anchor floor is simply a 1.
  const pct = Math.max(0, Math.min(1, (rawFinal - rawMin) / (rawMax - rawMin)));
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

// ---- Reshaped aliyah 6, for the parshiot that can host a 3-scroll week --
// Shabbat Shekalim/HaChodesh/Rosh Chodesh Chanukah landing on Rosh Chodesh,
// which reassigns aliyah 7 to Rosh Chodesh's own scroll and, in doing so,
// extends aliyah 6 to absorb what would otherwise be aliyah 7's opening
// verses (see gen_calendar.mjs). That merged range is real parsha text, so
// it's scored exactly like any other aliyah -- scoreReadingRaw + the same
// rescaleFinal anchor as everything else -- using the pseudo word-stats
// entry gen_word_stats.mjs computed under RESHAPED__<parshaId>.
const RESHAPED_SIXTH_ALIYAH_PARSHIOT = ['Miketz', 'Mishpatim', 'Pekudei', 'Tazria', 'Terumah', 'Vayikra'];
const reshapedAliyotResults = RESHAPED_SIXTH_ALIYAH_PARSHIOT.map((parshaId) => {
  const p = parshiot.find((x) => x.id === parshaId);
  const a6 = p.aliyot.find((a) => String(a.aliyah) === '6');
  const a7 = p.aliyot.find((a) => String(a.aliyah) === '7');
  const raw = scoreReadingRaw(`RESHAPED__${parshaId}`, [{ key: '6', verses: a6.verses + a7.verses }], PARSHA_PROFILE[parshaId] || ['NARRATIVE'], {}, {});
  const entry = raw.aliyot[0];
  entry.finalScore = rescaleFinal(entry.rawFinal);
  delete entry.rawFinal;
  return { parshaId, ...entry };
});


// ---- Haftarot ----------------------------------------------------------
// A haftarah is chanted from a printed, vocalized text: nekudot and trope
// marks are both on the page. That removes the single largest source of
// leining risk -- guessing the vowels on an unpointed scroll,
// same-letters-different-nekudot pairs, unmarked Ketiv/Qere -- so the entire
// gotchas criterion, 20% of the Torah score, simply does not apply. Errors
// are also less halachically fraught, and it is one continuous passage read
// by one person.
//
// Not a separate 1-7 scale. The final score is computed on the exact same
// 1-10 anchor as every Torah reading (rescaleFinal, below), then weighted
// down by a flat 70% -- haftarah trope is a genuinely separate melody that
// has to be learned on its own, Nevi'im vocabulary is harder than Chumash,
// and haftarot are not short (median 324 words against 195 for a parsha
// aliyah), so a hard haftarah is a real undertaking, just capped short of
// the hardest Torah reading. The result is displayed exactly like any other
// score (out of 10, same badge, same color/label logic) -- there is
// deliberately no "out of 7" caveat on the page itself; see
// difficulty-rubric.md / How It Works for the reasoning.
const HAFTARAH_WEIGHT_FACTOR = 0.7;
// Vocabulary carries more weight here than in Torah reading and gotchas is
// gone entirely: with the pointing supplied, what is actually left to trip
// over is unfamiliar and hard-to-pronounce words.
const HAFTARAH_WEIGHTS = { length: 4, vocab: 3, trope: 2, repetition: 1 };
const HAFTARAH_TOTAL = Object.values(HAFTARAH_WEIGHTS).reduce((s, w) => s + w, 0);

// Length is ranked against OTHER HAFTAROT, not Torah aliyot -- haftarot run
// far longer on average (median 324 words vs. 195), so ranking them against
// the Torah aliyot pool made nearly every haftarah read as "one of the
// longest in the leining" regardless of how it actually compares to other
// haftarot.
const haftarahWordCounts = Object.values(haftarahStats).map((h) => h.wordCount).sort((a, b) => a - b);
function haftarahLengthScore(wordCount) {
  let idx = haftarahWordCounts.findIndex((v) => v >= wordCount);
  if (idx === -1) idx = haftarahWordCounts.length - 1;
  const pct = idx / (haftarahWordCounts.length - 1);
  return clamp10(1 + pct * 9);
}

const rawHaftarot = Object.entries(haftarahStats).map(([id, h]) => {
  const length = haftarahLengthScore(h.wordCount);
  const vocab = clamp10(h.vocab);
  const trope = clamp10(h.tropeRarity);
  const repetition = clamp10(11 - h.formulaicity);
  const rawFinal = (length * HAFTARAH_WEIGHTS.length + vocab * HAFTARAH_WEIGHTS.vocab
    + trope * HAFTARAH_WEIGHTS.trope + repetition * HAFTARAH_WEIGHTS.repetition) / HAFTARAH_TOTAL;
  return { id, h, length, vocab, trope, repetition, rawFinal };
});
const haftarahResults = rawHaftarot.map((r) => {
  // Same anchor (ordinary parsha aliyot raw range) as every other reading in
  // the dataset, unrounded, then weighted down -- see comment above.
  const pct = Math.max(0, Math.min(1, (r.rawFinal - rawMin) / (rawMax - rawMin)));
  const full10 = 1 + pct * 9;
  const finalScore = Math.round(full10 * HAFTARAH_WEIGHT_FACTOR * 10) / 10;
  const e = {
    haftarahId: r.id, parsha: r.h.parsha, nusach: 'ashkenazi', ref: r.h.ref,
    verses: r.h.verseCount, wordCount: r.h.wordCount,
    scores: { length: r.length, vocabulary: r.vocab, trope: r.trope, repetition: r.repetition },
    vocabDetail: { rarity: r.h.rarity, pronunciation: r.h.pronunciation, rareExamples: r.h.rareExamples, hardToPronounceExamples: r.h.hardToPronounceExamples },
    finalScore,
  };
  if (r.h.chagId) e.chagId = r.h.chagId;
  if (r.h.rareTropeMarks && r.h.rareTropeMarks.length) e.rareTropeMarks = r.h.rareTropeMarks;
  return e;
}).sort((a, b) => b.finalScore - a.finalScore);

writeFileSync('../data/difficulty-scores.json', JSON.stringify({
  description: "Difficulty ratings (0-10 per criterion, plus a length-weighted, then dataset-wide-rescaled final score) for every aliyah of every parsha -- including the 7 combined (double) parshiot, each scored against its own combined-reading aliyah divisions rather than averaged from its two components -- AND every chag/fast/Rosh Chodesh/special-Shabbat reading in chagim.json (see the separate 'chagim' array). Generated with a transparent rule-based methodology, NOT a survey of actual leining outcomes. Vocabulary is computed from real word-frequency + pronunciation-complexity data over the Masoretic Torah text (see word-difficulty.json); the other four criteria are a content-profile heuristic. Final scores are rescaled against the full pool of ~860 aliyot (parshiot + combined + chagim) so the hardest aliyah in the dataset is a real 10 and the easiest a real 1. 'haftarot' entries carrying a 'chagId' are special-Shabbat/chag haftarot (Shekalim, Zachor, Parah, HaChodesh, HaGadol, Rosh Chodesh alone, Chanukah, etc.) scored the same way as the 61 parsha haftarot, in the same percentile pool -- see gen_haftarah_stats.mjs; not every special-Shabbat haftarah has one, since a few (Shabbat Shuva's variable compositions, and the haftarah-only labels with no chagim.json entry at all) have no single fixed text to score against. 'reshapedAliyot' scores the merged aliyah 6 that appears on a 3-scroll week (Shekalim/HaChodesh/Rosh Chodesh Chanukah landing on Rosh Chodesh), for the 6 parshiot that can ever host one -- see gen_calendar.mjs for how it's attached to actual calendar rows. See difficulty-rubric.md for the full methodology and honest caveats.",
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  count: allResults.length,
  individualCount: results.length,
  combinedCount: combinedResults.length,
  parshiot: allResults,
  chagimCount: chagResults.length,
  chagim: chagResults,
  haftarotCount: haftarahResults.length,
  haftarot: haftarahResults,
  reshapedAliyot: reshapedAliyotResults,
}, null, 2));

console.log('Wrote difficulty-scores.json:', results.length, 'individual +', combinedResults.length, 'combined parshiot,', chagResults.length, 'chagim entries');
console.log('Top 5 hardest parshiot:', allResults.slice(0,5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Top 5 easiest parshiot:', allResults.slice(-5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Top 5 hardest chagim:', chagResults.slice(0,5).map(r=>`${r.chagId} (${r.finalScore})`));
console.log('Top 5 easiest chagim:', chagResults.slice(-5).map(r=>`${r.chagId} (${r.finalScore})`));
console.log('Haftarot scored:', haftarahResults.length, '(ashkenazi, same 1-10 scale as Torah readings, weighted down ' + Math.round((1 - HAFTARAH_WEIGHT_FACTOR) * 100) + '%)');
console.log('  hardest:', haftarahResults.slice(0,4).map(r=>`${r.parsha} (${r.finalScore})`).join(', '));
console.log('  easiest:', haftarahResults.slice(-4).map(r=>`${r.parsha} (${r.finalScore})`).join(', '));
