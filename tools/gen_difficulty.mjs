import { readFileSync, writeFileSync } from 'fs';

const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));

// ---- Content-profile tags -> baseline sub-scores (0-10) ----
// These represent *typical* difficulty drivers for that kind of content, not a
// judgment on any individual chazan's ability.
const PROFILES = {
  NARRATIVE:  { vocab: 3, trope: 3, repetition: 2, hidden: 2 },
  GENEALOGY:  { vocab: 6, trope: 4, repetition: 8, hidden: 5 }, // names/numbers, easy to lose place
  POETRY:     { vocab: 6, trope: 9, repetition: 3, hidden: 8 }, // Shirah layout + rare trope combos
  LEGAL:      { vocab: 6, trope: 4, repetition: 4, hidden: 5 }, // dense mitzvot, frequent topic shifts
  RITUAL:     { vocab: 8, trope: 5, repetition: 6, hidden: 5 }, // technical/priestly/construction vocab
  TOCHACHA:   { vocab: 5, trope: 4, repetition: 3, hidden: 8 }, // emotionally loaded, read fast & quiet
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
};

// Specific, well-documented per-aliyah overrides (additive, capped at 10).
// key = `${parshaId}:${aliyahNum}`
const ALIYAH_OVERRIDES = {
  'Beshalach:4': { trope: +3, hidden: +2, note: 'Shirat HaYam (Az Yashir) -- special layout & elevated melody' },
  'Yitro:6':     { trope: +3, hidden: +2, note: 'Aseret HaDibrot -- ta\'am elyon alternate cantillation' },
  'Vaetchanan:2':{ trope: +2, hidden: +1, note: 'Aseret HaDibrot repeated (Deut 5) -- ta\'am elyon in many congregations' },
  "Ha'azinu:1":  { trope: +1, hidden: +1, note: 'Opening of Shirat Ha\'azinu -- poetic column layout' },
  'Vayera:3':    { hidden: +2, note: 'Contains a shalshelet (Gen 19:16, Lot lingers) -- a trope mark used only 4x in the whole Torah' },
  'Chayei Sara:2': { hidden: +2, note: 'Contains a shalshelet (Gen 24:12, Eliezer prays)' },
  'Vayeshev:5':  { hidden: +2, note: 'Contains a shalshelet (Gen 39:8, Yosef refuses)' },
  'Tzav:4':      { hidden: +2, note: 'Contains a shalshelet (Lev 8:23, miluim blood on Aharon\'s ear)' },
  'Vayishlach:7':{ repetition: +2, vocab: +1, note: 'Eisav\'s genealogy (Gen 36) -- long list of unfamiliar names' },
  'Nasso:4':     { repetition: +3, note: 'Start of the 12 nearly-identical Nesiim offerings (Num 7) -- easy to lose your place' },
  'Nasso:5':     { repetition: +3, note: 'Nesiim offerings continue (Num 7) -- near-identical repeated text' },
  'Nasso:6':     { repetition: +3, note: 'Nesiim offerings continue (Num 7) -- near-identical repeated text' },
  'Masei:1':     { repetition: +3, vocab: +1, note: '42 journey-stations list (Num 33) -- long place-name list' },
  'Bechukotai:5':{ hidden: +3, note: 'Tochacha (curses) -- traditional custom to read quickly and quietly' },
  'Bechukotai:6':{ hidden: +2, note: 'Tochacha (curses) continues' },
  'Ki Tavo:6':   { hidden: +3, note: 'Tochacha (curses) -- traditional custom to read quickly and quietly' },
  'Ki Tavo:7':   { hidden: +2, note: 'Tochacha (curses) continues' },
  'Chukat:6':    { trope: +1, hidden: +1, note: 'Includes the archaic poetic fragment "Az Yashir Yisrael" and a quote from the Book of the Wars of Hashem' },
};

function clamp(n) { return Math.max(0, Math.min(10, Math.round(n))); }
function blendProfile(tags) {
  const profs = tags.map(t => PROFILES[t]);
  const keys = ['vocab','trope','repetition','hidden'];
  const out = {};
  for (const k of keys) out[k] = profs.reduce((s,p)=>s+p[k],0) / profs.length;
  return out;
}

// ---- length score: percentile rank of verse count across ALL aliyot (incl. maftir treated like aliyah7) ----
const allCounts = [];
for (const p of parshiot) for (const a of p.aliyot) allCounts.push(a.verses);
allCounts.sort((a,b)=>a-b);
function lengthScore(verses) {
  let idx = allCounts.findIndex(v => v >= verses);
  if (idx === -1) idx = allCounts.length - 1;
  const pct = idx / (allCounts.length - 1); // 0..1
  return clamp(1 + pct * 9); // 1..10
}

const RUBRIC_WEIGHTS = { length: 1, vocab: 1, trope: 1, repetition: 1, hidden: 1 }; // simple average, see rubric.md

const results = [];
for (const p of parshiot) {
  const tags = PARSHA_PROFILE[p.id] || ['NARRATIVE'];
  const base = blendProfile(tags);
  const aliyahScores = [];
  for (const a of p.aliyot) {
    const ov = ALIYAH_OVERRIDES[`${p.id}:${a.aliyah}`] || {};
    const vocab = clamp(base.vocab + (ov.vocab || 0));
    const trope = clamp(base.trope + (ov.trope || 0));
    const repetition = clamp(base.repetition + (ov.repetition || 0));
    const hidden = clamp(base.hidden + (ov.hidden || 0));
    const length = lengthScore(a.verses);
    const totalW = Object.values(RUBRIC_WEIGHTS).reduce((s,w)=>s+w,0);
    const final = clamp((length*RUBRIC_WEIGHTS.length + vocab*RUBRIC_WEIGHTS.vocab + trope*RUBRIC_WEIGHTS.trope +
                          repetition*RUBRIC_WEIGHTS.repetition + hidden*RUBRIC_WEIGHTS.hidden) / totalW);
    const entry = {
      aliyah: a.aliyah, verses: a.verses,
      scores: { length, vocabulary: vocab, trope, repetition, hiddenChallenges: hidden },
      finalScore: final,
    };
    if (ov.note) entry.note = ov.note;
    aliyahScores.push(entry);
  }
  const avg = (key) => Math.round((aliyahScores.reduce((s,a)=>s+a.scores[key],0)/aliyahScores.length)*10)/10;
  const parshaFinal = Math.round((aliyahScores.reduce((s,a)=>s+a.finalScore,0)/aliyahScores.length)*10)/10;
  results.push({
    parshaId: p.id,
    profile: tags,
    aliyot: aliyahScores,
    parshaScores: {
      length: avg('length'), vocabulary: avg('vocabulary'), trope: avg('trope'),
      repetition: avg('repetition'), hiddenChallenges: avg('hiddenChallenges'),
    },
    parshaFinalScore: parshaFinal,
    hardestAliyah: aliyahScores.reduce((m,a)=>a.finalScore>m.finalScore?a:m, aliyahScores[0]).aliyah,
    easiestAliyah: aliyahScores.reduce((m,a)=>a.finalScore<m.finalScore?a:m, aliyahScores[0]).aliyah,
  });
}

results.sort((a,b) => b.parshaFinalScore - a.parshaFinalScore);

writeFileSync('../data/difficulty-scores.json', JSON.stringify({
  description: "Difficulty ratings (0-10 per criterion, plus a simple-average final score) for every aliyah and for each parsha as a whole. Generated with a transparent rule-based methodology, NOT a survey of actual leining outcomes -- see difficulty-rubric.md for the full methodology, the content-profile tags used, and honest caveats about where this should be refined (e.g. with real chazzanim feedback or app usage data).",
  methodology: "difficulty-rubric.md",
  generatedAt: new Date().toISOString(),
  parshiot: results,
}, null, 2));

console.log('Wrote difficulty-scores.json for', results.length, 'parshiot');
console.log('Top 5 hardest parshiot:', results.slice(0,5).map(r=>`${r.parshaId} (${r.parshaFinalScore})`));
console.log('Top 5 easiest parshiot:', results.slice(-5).map(r=>`${r.parshaId} (${r.parshaFinalScore})`));
