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
// Note on repetition overrides below: formulaic repeated passages (Nesiim,
// journey-stations) get a NEGATIVE repetition adjustment (easier once
// you've got the template) plus a small hidden-challenge bump (the real
// risk is losing track of which repetition you're on, not the repetition
// itself). Eisav's genealogy (Gen 36) has no such override anymore -- it's
// not a repeated formula, just many distinct rare names in a row, which
// the real word-frequency vocabulary score already captures accurately
// (see word-difficulty.json) without double-counting it here too.
const ALIYAH_OVERRIDES = {
  'Beshalach:4':   { trope: +3, hidden: +2, note: 'Shirat HaYam / Az Yashir (Ex 15:1-19) -- special brick-layout & elevated melody' },
  'Yitro:6':       { trope: +3, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
  'Vaetchanan:4':  { trope: +2, hidden: +1, note: 'Aseret HaDibrot repeated (Deut 5:6-18) -- ta\'am elyon in many congregations' },
  "Ha'azinu:1":    { trope: +1, hidden: +1, note: 'Opening of Shirat Ha\'azinu -- poetic column layout' },
  'Vayera:3':      { hidden: +2, note: 'Contains a shalshelet (Gen 19:16, Lot lingers) -- a trope mark used only 4x in the whole Torah' },
  'Chayei Sara:3': { hidden: +2, note: 'Contains a shalshelet (Gen 24:12, Eliezer prays)' },
  'Vayeshev:6':    { hidden: +2, note: 'Contains a shalshelet (Gen 39:8, Yosef refuses)' },
  'Tzav:6':        { hidden: +2, note: 'Contains a shalshelet (Lev 8:23, miluim blood on Aharon\'s ear)' },
  'Nasso:5':       { repetition: -3, hidden: +1, note: 'Start of the 12 nearly-identical Nesiim offerings (Num 7:1-41) -- the repeated formula is easier once learned, but it\'s easy to grab the wrong nasi\'s paragraph' },
  'Nasso:6':       { repetition: -3, hidden: +1, note: 'Nesiim offerings continue (Num 7:42-71) -- same formula, same risk of losing track of which day/nasi you\'re on' },
  'Nasso:7':       { repetition: -3, hidden: +1, note: 'Nesiim offerings conclude (Num 7:72-89) -- same formula, same risk of losing track of which day/nasi you\'re on' },
  'Masei:1':       { repetition: -1, note: 'Journey-stations list begins (Num 33:1-10)' },
  'Masei:2':       { repetition: -3, hidden: +1, note: 'Bulk of the 42 journey-stations list (Num 33:11-49) -- the repeated "traveled from...camped at..." formula is easier once learned, but it\'s a long sequence of distinct place names to keep straight' },
  'Matot-Masei:4': { repetition: -2, hidden: +1, note: 'Contains the bulk of the 42 journey-stations list (Num 33:1-49) alongside the Reuven/Gad settlement narrative -- the list\'s repeated formula eases it, but it\'s a long, 72-verse aliyah with many station names to keep straight' },
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
function blendProfile(tags) {
  const profs = tags.map(t => PROFILES[t]);
  const keys = ['trope','repetition','hidden'];
  const out = {};
  for (const k of keys) out[k] = profs.reduce((s,p)=>s+p[k],0) / profs.length;
  return out;
}

// ---- length score: percentile rank of verse count across ALL individual-parsha aliyot ----
// (Combined parshiot and chagim are scored against this same fixed scale --
// not re-based on their own population -- so a 20-verse aliyah always means
// the same length score everywhere in the dataset.)
const allCounts = [];
for (const p of parshiot) for (const a of p.aliyot) allCounts.push(a.verses);
allCounts.sort((a,b)=>a-b);
function lengthScore(verses) {
  let idx = allCounts.findIndex(v => v >= verses);
  if (idx === -1) idx = allCounts.length - 1;
  const pct = idx / (allCounts.length - 1); // 0..1
  return clamp10(1 + pct * 9); // 1..10
}

// Length now dominates the final score by design (see difficulty-rubric.md):
// it alone counts for as much as all four other criteria combined.
const RUBRIC_WEIGHTS = { length: 4, vocab: 1, trope: 1, repetition: 1, hidden: 1 };
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
    const trope = clamp10(base.trope + (ov.trope || 0));
    const repetition = clamp10(base.repetition + (ov.repetition || 0));
    const ambiguousBump = wd && wd.ambiguousSpellingExamples && wd.ambiguousSpellingExamples.length ? 1 : 0;
    const hidden = clamp10(base.hidden + (ov.hidden || 0) + (fam.hidden || 0) + ambiguousBump);
    const length = lengthScore(item.verses);
    const rawFinal = (length*RUBRIC_WEIGHTS.length + vocab*RUBRIC_WEIGHTS.vocab + trope*RUBRIC_WEIGHTS.trope +
                       repetition*RUBRIC_WEIGHTS.repetition + hidden*RUBRIC_WEIGHTS.hidden) / TOTAL_WEIGHT;
    const entry = {
      aliyah: item.key, verses: item.verses,
      scores: { length, vocabulary: vocab, trope, repetition, hiddenChallenges: hidden },
      rawFinal,
    };
    if (wd) {
      entry.vocabDetail = { rarity: wd.rarity, pronunciation: wd.pronunciation, rareExamples: wd.rareExamples, hardToPronounceExamples: wd.hardToPronounceExamples };
      if (wd.ambiguousSpellingExamples && wd.ambiguousSpellingExamples.length) {
        entry.ambiguousSpellingExamples = wd.ambiguousSpellingExamples;
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
    [`Shavuot I__${region}:4`]: { trope: +3, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
    [`Shavuot__${region}:4`]:   { trope: +3, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
    [`Pesach VII__${region}:5`]:{ trope: +3, hidden: +2, note: 'Shirat HaYam / Az Yashir (Ex 14:26-15:26) -- special brick-layout & elevated melody' },
    [`Sukkot III (CH''M)__${region}:1`]: { repetition: -2, hidden: +1, note: 'Start of the daily-decreasing bull count (Num 29) -- the repeated offering formula is easy once learned, but each day\'s bull count is one lower than the day before, so it\'s easy to default to the wrong number' },
    [`Sukkot IV (CH''M)__${region}:1`]:  { repetition: -2, hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same formula, same risk of defaulting to the wrong day\'s number' },
    [`Sukkot V (CH''M)__${region}:1`]:   { repetition: -2, hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same formula, same risk of defaulting to the wrong day\'s number' },
    [`Sukkot VI (CH''M)__${region}:1`]:  { repetition: -2, hidden: +1, note: 'Daily-decreasing bull count continues (Num 29) -- same formula, same risk of defaulting to the wrong day\'s number' },
    [`Sukkot VII (Hoshana Raba)__${region}:1`]: { repetition: -2, hidden: +1, note: 'Daily-decreasing bull count concludes (Num 29) -- same formula, same risk of defaulting to the wrong day\'s number' },
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
