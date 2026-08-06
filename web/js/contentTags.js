// Per-aliyah content-type tags (Story/Poem/Law/Ritual/Genealogy/Census/
// Rebuke/Speech/Famous), layered on top of the difficulty pipeline's
// existing parsha-level content-profile tags rather than a separate
// hand-classification pass -- see difficulty-rubric.md's "How trope/
// repetition/hidden-challenge scores were assigned" for where those base
// profiles come from. `wellKnown` (the existing familiarity-discount flag
// in difficulty-scores.json) is reused directly as the "Famous" tag.
//
// Honest scope note: the base tag defaults to the parsha's PRIMARY profile
// only, applied to every aliyah in that parsha -- accurate for the many
// single-topic parshiot, imprecise at aliyah granularity for a few
// multi-topic ones. The overrides below correct the well-documented cases
// (verified against real verse ranges in parshiot.json/parshiot-combined.json,
// same rigor as ALIYAH_OVERRIDES in gen_difficulty.mjs) but this is not an
// exhaustive per-aliyah content audit.

const PROFILE_LABEL = {
  NARRATIVE: 'Story',
  GENEALOGY: 'Genealogy',
  POETRY: 'Poem',
  LEGAL: 'Law',
  RITUAL: 'Ritual',
  TOCHACHA: 'Rebuke',
};

const DEVARIM_SPEECH_PARSHIOT = [
  'Devarim', 'Vaetchanan', 'Eikev', "Re'eh", 'Shoftim', 'Ki Teitzei', 'Ki Tavo',
  'Nitzavim', 'Vayeilech', 'Nitzavim-Vayeilech',
];
const ALIYAH_KEYS = ['1', '2', '3', '4', '5', '6', '7', 'M'];

const ALIYAH_TAG_OVERRIDES = {
  // Poetry
  'Beshalach:4': { add: ['Poem'] }, // Az Yashir / Shirat HaYam, Ex 15:1-19
  'Chukat:6': { add: ['Poem'] }, 'Chukat-Balak:3': { add: ['Poem'] }, // Az Yashir Yisrael fragment, Num 21:17-20
  'Balak:4': { add: ['Poem'] }, 'Balak:5': { add: ['Poem'] }, 'Balak:6': { add: ['Poem', 'Famous'] }, 'Balak:7': { add: ['Poem'] }, // Bilaam's oracles, incl. "Mah Tovu" (Num 24:5) in aliyah 6
  'Vayechi:4': { add: ['Poem'] }, 'Vayechi:5': { add: ['Poem'] }, // Yaakov's blessing, Gen 49:1-26
  'Vezot Haberakhah:1': { replace: ['Poem'] }, 'Vezot Haberakhah:2': { replace: ['Poem'] },
  'Vezot Haberakhah:3': { replace: ['Poem'] }, 'Vezot Haberakhah:4': { replace: ['Poem'] },
  'Vezot Haberakhah:5': { replace: ['Poem'] }, 'Vezot Haberakhah:6': { replace: ['Poem'] }, // Moshe's blessing, Deut 33:1-29

  // Genealogy (family lineage lists -- distinct from Census head-counts below)
  'Bereshit:6': { add: ['Genealogy'] }, // Adam's line, Gen 5
  'Noach:6': { add: ['Genealogy'] }, // Table of Nations, Gen 10
  'Vayishlach:6': { add: ['Genealogy'] }, 'Vayishlach:7': { add: ['Genealogy'] }, // Esav's line, Gen 36
  'Vayigash:5': { add: ['Genealogy'] }, // household list, Gen 46:8-27

  // Census (head-counts by tribe)
  'Pinchas:2': { replace: ['Census'] }, // the second census, Num 26:5-51
};
for (const key of ALIYAH_KEYS) {
  ALIYAH_TAG_OVERRIDES[`Bamidbar:${key}`] = { replace: ['Census'] };
  ALIYAH_TAG_OVERRIDES[`Ha'azinu:${key}`] = { replace: ['Poem'] };
  for (const id of DEVARIM_SPEECH_PARSHIOT) {
    const existing = ALIYAH_TAG_OVERRIDES[`${id}:${key}`];
    ALIYAH_TAG_OVERRIDES[`${id}:${key}`] = existing ? { ...existing, add: [...(existing.add || []), 'Speech'] } : { add: ['Speech'] };
  }
}
ALIYAH_TAG_OVERRIDES['Vayigash:1'] = { add: ['Speech'] }; // Yehuda's plea to Yosef, Gen 44:18-30

export function contentTags({ profile, aliyahKey, readingId, wellKnown }) {
  const base = PROFILE_LABEL[profile && profile[0]] || 'Story';
  const ov = ALIYAH_TAG_OVERRIDES[`${readingId}:${aliyahKey}`];
  let tags = ov && ov.replace ? [...ov.replace] : [base, ...((ov && ov.add) || [])];
  if (wellKnown) tags.push('Famous');
  return [...new Set(tags)];
}
