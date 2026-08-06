import { readFileSync, writeFileSync } from 'fs';

const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));
const { combinedParshiot } = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8'));
const wordDifficulty = JSON.parse(readFileSync('../data/word-difficulty.json', 'utf8')).aliyot;

// ---- Content-profile tags -> baseline sub-scores (0-10) for trope/repetition/hidden ----
// Vocabulary is NOT driven by these anymore -- see word-difficulty.json (real
// word-frequency + pronunciation-complexity data computed from the Masoretic
// text). These profiles now only inform the three criteria that genuinely
// can't be measured directly from the text: trope, repetition, hidden challenges.
const PROFILES = {
  NARRATIVE:  { trope: 3, repetition: 2, hidden: 2 },
  GENEALOGY:  { trope: 4, repetition: 8, hidden: 5 }, // names/numbers, easy to lose place
  POETRY:     { trope: 9, repetition: 3, hidden: 8 }, // Shirah layout + rare trope combos
  LEGAL:      { trope: 4, repetition: 4, hidden: 5 }, // dense mitzvot, frequent topic shifts
  RITUAL:     { trope: 5, repetition: 6, hidden: 5 }, // technical/priestly/construction content
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
const ALIYAH_OVERRIDES = {
  'Beshalach:4':   { trope: +3, hidden: +2, note: 'Shirat HaYam / Az Yashir (Ex 15:1-19) -- special brick-layout & elevated melody' },
  'Yitro:6':       { trope: +3, hidden: +2, note: 'Aseret HaDibrot (Ex 20:2-14) -- ta\'am elyon alternate cantillation' },
  'Vaetchanan:4':  { trope: +2, hidden: +1, note: 'Aseret HaDibrot repeated (Deut 5:6-18) -- ta\'am elyon in many congregations' },
  "Ha'azinu:1":    { trope: +1, hidden: +1, note: 'Opening of Shirat Ha\'azinu -- poetic column layout' },
  'Vayera:3':      { hidden: +2, note: 'Contains a shalshelet (Gen 19:16, Lot lingers) -- a trope mark used only 4x in the whole Torah' },
  'Chayei Sara:3': { hidden: +2, note: 'Contains a shalshelet (Gen 24:12, Eliezer prays)' },
  'Vayeshev:6':    { hidden: +2, note: 'Contains a shalshelet (Gen 39:8, Yosef refuses)' },
  'Tzav:6':        { hidden: +2, note: 'Contains a shalshelet (Lev 8:23, miluim blood on Aharon\'s ear)' },
  'Vayishlach:6':  { repetition: +1, note: 'Eisav\'s genealogy begins (Gen 36:1-19)' },
  'Vayishlach:7':  { repetition: +2, note: 'Eisav\'s genealogy concludes (Gen 36:20-43) -- long list of names' },
  'Nasso:5':       { repetition: +3, note: 'Start of the 12 nearly-identical Nesiim offerings (Num 7:1-41) -- easy to lose your place' },
  'Nasso:6':       { repetition: +3, note: 'Nesiim offerings continue (Num 7:42-71) -- near-identical repeated text' },
  'Nasso:7':       { repetition: +3, note: 'Nesiim offerings conclude (Num 7:72-89) -- near-identical repeated text' },
  'Masei:1':       { repetition: +1, note: 'Journey-stations list begins (Num 33:1-10)' },
  'Masei:2':       { repetition: +3, note: 'Bulk of the 42 journey-stations list (Num 33:11-49) -- long place-name list' },
  'Matot-Masei:4': { repetition: +2, note: 'Contains the bulk of the 42 journey-stations list (Num 33:1-49) alongside the Reuven/Gad settlement narrative -- a long, 72-verse aliyah with a repetitive list embedded in it' },
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

function clamp(n) { return Math.max(0, Math.min(10, Math.round(n))); }
function blendProfile(tags) {
  const profs = tags.map(t => PROFILES[t]);
  const keys = ['trope','repetition','hidden'];
  const out = {};
  for (const k of keys) out[k] = profs.reduce((s,p)=>s+p[k],0) / profs.length;
  return out;
}

// ---- length score: percentile rank of verse count across ALL aliyot (individual parshiot only -- combined weeks reuse the same scale) ----
const allCounts = [];
for (const p of parshiot) for (const a of p.aliyot) allCounts.push(a.verses);
allCounts.sort((a,b)=>a-b);
function lengthScore(verses) {
  let idx = allCounts.findIndex(v => v >= verses);
  if (idx === -1) idx = allCounts.length - 1;
  const pct = idx / (allCounts.length - 1); // 0..1
  return clamp(1 + pct * 9); // 1..10
}

// Length now dominates the final score by design (see difficulty-rubric.md):
// it alone counts for as much as all four other criteria combined.
const RUBRIC_WEIGHTS = { length: 4, vocab: 1, trope: 1, repetition: 1, hidden: 1 };

function scoreParsha(p, { combined }) {
  const tags = PARSHA_PROFILE[p.id] || ['NARRATIVE'];
  const base = blendProfile(tags);
  const aliyahScores = [];
  for (const a of p.aliyot) {
    const ov = ALIYAH_OVERRIDES[`${p.id}:${a.aliyah}`] || {};
    const fam = FAMILIAR_PASSAGE_DISCOUNTS[`${p.id}:${a.aliyah}`] || {};
    const wd = wordDifficulty[p.id]?.[String(a.aliyah)];
    const vocabBase = wd ? wd.vocab : 5; // fallback should never actually trigger
    const vocab = clamp(vocabBase + (fam.vocab || 0));
    const trope = clamp(base.trope + (ov.trope || 0));
    const repetition = clamp(base.repetition + (ov.repetition || 0));
    const hidden = clamp(base.hidden + (ov.hidden || 0) + (fam.hidden || 0));
    const length = lengthScore(a.verses);
    const totalW = Object.values(RUBRIC_WEIGHTS).reduce((s,w)=>s+w,0);
    const final = clamp((length*RUBRIC_WEIGHTS.length + vocab*RUBRIC_WEIGHTS.vocab + trope*RUBRIC_WEIGHTS.trope +
                          repetition*RUBRIC_WEIGHTS.repetition + hidden*RUBRIC_WEIGHTS.hidden) / totalW);
    const entry = {
      aliyah: a.aliyah, verses: a.verses,
      scores: { length, vocabulary: vocab, trope, repetition, hiddenChallenges: hidden },
      finalScore: final,
    };
    if (wd) {
      entry.vocabDetail = { rarity: wd.rarity, pronunciation: wd.pronunciation, rareExamples: wd.rareExamples, hardToPronounceExamples: wd.hardToPronounceExamples };
    }
    const notes = [ov.note, fam.note].filter(Boolean);
    if (notes.length) entry.note = notes.join(' ');
    if (fam.note) entry.wellKnown = true;
    aliyahScores.push(entry);
  }
  const avg = (key) => Math.round((aliyahScores.reduce((s,a)=>s+a.scores[key],0)/aliyahScores.length)*10)/10;
  const parshaFinal = Math.round((aliyahScores.reduce((s,a)=>s+a.finalScore,0)/aliyahScores.length)*10)/10;
  const result = {
    parshaId: p.id,
    combined,
    profile: tags,
    aliyot: aliyahScores,
    parshaScores: {
      length: avg('length'), vocabulary: avg('vocabulary'), trope: avg('trope'),
      repetition: avg('repetition'), hiddenChallenges: avg('hiddenChallenges'),
    },
    parshaFinalScore: parshaFinal,
    hardestAliyah: aliyahScores.reduce((m,a)=>a.finalScore>m.finalScore?a:m, aliyahScores[0]).aliyah,
    easiestAliyah: aliyahScores.reduce((m,a)=>a.finalScore<m.finalScore?a:m, aliyahScores[0]).aliyah,
  };
  if (combined) result.componentParshiot = p.id.split('-');
  return result;
}

const results = parshiot.map(p => scoreParsha(p, { combined: false }));
const combinedResults = combinedParshiot.map(p => scoreParsha(p, { combined: true }));
const allResults = [...results, ...combinedResults].sort((a,b) => b.parshaFinalScore - a.parshaFinalScore);

writeFileSync('../data/difficulty-scores.json', JSON.stringify({
  description: "Difficulty ratings (0-10 per criterion, plus a length-weighted final score) for every aliyah and for each parsha as a whole -- including the 7 combined (double) parshiot, each scored against its own combined-reading aliyah divisions rather than averaged from its two components. Generated with a transparent rule-based methodology, NOT a survey of actual leining outcomes. Vocabulary is computed from real word-frequency + pronunciation-complexity data over the Masoretic Torah text (see word-difficulty.json); the other four criteria are a content-profile heuristic. See difficulty-rubric.md for the full methodology and honest caveats.",
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  count: allResults.length,
  individualCount: results.length,
  combinedCount: combinedResults.length,
  parshiot: allResults,
}, null, 2));

console.log('Wrote difficulty-scores.json:', results.length, 'individual +', combinedResults.length, 'combined =', allResults.length, 'total');
console.log('Top 5 hardest overall:', allResults.slice(0,5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Top 5 easiest overall:', allResults.slice(-5).map(r=>`${r.parshaId} (${r.parshaFinalScore})${r.combined?' [combined]':''}`));
console.log('Well-known aliyot flagged:', allResults.flatMap(r=>r.aliyot.filter(a=>a.wellKnown).map(a=>`${r.parshaId}:${a.aliyah}`)));
