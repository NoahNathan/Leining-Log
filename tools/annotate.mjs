import { readFileSync, writeFileSync } from 'fs';

// ---------- 1. Annotate parshiot.json with special-trope notes ----------
const parshiotFile = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));

const AliYAH_TROPE_NOTES = {
  'Beshalach:4': "Shirat HaYam (Song of the Sea, Ex 15:1-19) falls inside this aliyah. Written in the Torah scroll in the special 'brick-and-half-brick' (ariach al gabei levena) layout, and by very widespread custom chanted with an elevated, often congregation-joined melody. Many congregations stand.",
  'Yitro:6': "Aseret HaDibrot / Ten Commandments (Ex 20:2-14) fall inside this aliyah. Many communities chant this passage with 'ta'am elyon' (the alternate 'upper' cantillation with different verse/word groupings than the everyday 'ta'am tachton'), and the congregation stands.",
  "Ha'azinu:1": "This parsha is the Shirat Ha'azinu, written in the Torah scroll in a distinct two-column poetic layout, and is traditionally chanted with an elevated, song-like delivery.",
  'Devarim:7': "The final verses of Devarim are read on Shabbat Chazon (the Shabbat before Tisha B'Av); by widespread Ashkenazi custom the closing words of the aliyah, and especially the haftarah (Isaiah 1, 'Chazon Yeshayahu'), are chanted using the mournful Eicha (Lamentations) trope melody rather than the standard Torah/haftarah melody.",
};

for (const p of parshiotFile.parshiot) {
  for (const a of p.aliyot) {
    const note = AliYAH_TROPE_NOTES[`${p.id}:${a.aliyah}`];
    if (note) a.specialTrope = note;
  }
}
writeFileSync('../data/parshiot.json', JSON.stringify(parshiotFile, null, 2));
console.log('Annotated parshiot.json with', Object.keys(AliYAH_TROPE_NOTES).length, 'special-trope notes');

// ---------- 2. Annotate chagim.json in place with specialTrope notes ----------
const chagimFile = JSON.parse(readFileSync('../data/chagim.json', 'utf8'));

const CHAG_TROPE_NOTES = {
  'Shavuot I__DIASPORA': "Aliyah 4 (Ex 19:20-20:14) contains the Aseret HaDibrot / Ten Commandments, widely chanted with 'ta'am elyon' (the festive alternate cantillation) rather than the everyday 'ta'am tachton'. The congregation stands for this aliyah.",
  'Shavuot__IL': "Aliyah 4 (Ex 19:20-20:14) contains the Aseret HaDibrot / Ten Commandments, widely chanted with 'ta'am elyon' (the festive alternate cantillation) rather than the everyday 'ta'am tachton'. The congregation stands for this aliyah.",
  'Pesach VII__DIASPORA': "The Torah reading (Ex 13:17-15:26) includes Shirat HaYam (Song of the Sea), written in its special brick-layout and chanted with an elevated melody; this is the day tradition places the crossing of the sea.",
  'Pesach VII__IL': "The Torah reading (Ex 13:17-15:26) includes Shirat HaYam (Song of the Sea), written in its special brick-layout and chanted with an elevated melody; this is the day tradition places the crossing of the sea.",
  "Tish'a B'Av__DIASPORA": "The Torah reading (Deut 4:25-40, 'Ki Tolid') and especially the haftarah (Jeremiah 8:13-9:23) are traditionally chanted in the mournful Eicha (Lamentations) trope rather than the standard weekday Torah/haftarah melody. The Book of Eicha itself, read the preceding evening, uses its own distinct cantillation system entirely separate from Torah trope.",
  "Tish'a B'Av__IL": "The Torah reading (Deut 4:25-40, 'Ki Tolid') and especially the haftarah (Jeremiah 8:13-9:23) are traditionally chanted in the mournful Eicha (Lamentations) trope rather than the standard weekday Torah/haftarah melody. The Book of Eicha itself, read the preceding evening, uses its own distinct cantillation system entirely separate from Torah trope.",
  "Tish'a B'Av (observed)__DIASPORA": "Same reading and Eicha-trope custom as Tisha B'Av; this is the 10th of Av observance used when the 9th falls on Shabbat.",
  "Tish'a B'Av (observed)__IL": "Same reading and Eicha-trope custom as Tisha B'Av; this is the 10th of Av observance used when the 9th falls on Shabbat.",
  'Rosh Hashana II__DIASPORA': "The Torah reading is the Akeidah (Binding of Isaac, Genesis 22); no distinct cantillation system, but many ba'alei korei use a slower, more deliberate pace given the passage's gravity.",
  'Rosh Hashana II__IL': "The Torah reading is the Akeidah (Binding of Isaac, Genesis 22); no distinct cantillation system, but many ba'alei korei use a slower, more deliberate pace given the passage's gravity.",
};

for (const c of chagimFile.chagim) {
  const note = CHAG_TROPE_NOTES[c.id];
  if (note && !c.specialTrope) c.specialTrope = note;
}

// ---------- 2b. Verse-level haftarah specialTrope notes (haftarot.json + chagim.json nusach) ----------
// Distinct from the general aliyah/chag notes above: these attach to the
// specific haftarah citation itself, with the exact verse range the custom
// applies to, so they can be shown right next to that citation rather than
// only mentioned in passing in a parsha/chag-level note.
const haftarotFile = JSON.parse(readFileSync('../data/haftarot.json', 'utf8'));

const HAFTARAH_TROPE_NOTES = {
  'Devarim:ashkenazi': {
    range: '1:21-1:27',
    note: "This is 'Shabbat Chazon', the Shabbat before Tisha B'Av. By widespread Ashkenazi custom, the closing verses (from \"Eichah hayetah lezonah\") are chanted in the mournful Eicha (Lamentations) trope rather than the standard haftarah melody.",
  },
};
for (const h of haftarotFile.haftarot) {
  for (const [nusachName, entry] of Object.entries(h.nusach)) {
    const note = HAFTARAH_TROPE_NOTES[`${h.id}:${nusachName}`];
    if (note && entry && !entry.sameAs) entry.specialTrope = note;
  }
}
writeFileSync('../data/haftarot.json', JSON.stringify(haftarotFile, null, 2));

const CHAG_HAFTARAH_TROPE_NOTES = {};
for (const id of ["Tish'a B'Av__DIASPORA", "Tish'a B'Av__IL", "Tish'a B'Av (observed)__DIASPORA", "Tish'a B'Av (observed)__IL"]) {
  CHAG_HAFTARAH_TROPE_NOTES[`${id}:ashkenazi`] = {
    range: '8:13-9:23',
    note: 'The entire haftarah is traditionally chanted in the mournful Eicha (Lamentations) trope rather than the standard haftarah melody.',
  };
}
for (const c of chagimFile.chagim) {
  for (const [nusachName, entry] of Object.entries(c.nusach || {})) {
    const note = CHAG_HAFTARAH_TROPE_NOTES[`${c.id}:${nusachName}`];
    if (note && entry && !entry.sameAs) entry.specialTrope = note;
  }
}
writeFileSync('../data/chagim.json', JSON.stringify(chagimFile, null, 2));
console.log('Annotated chagim.json with up to', Object.keys(CHAG_TROPE_NOTES).length, 'specialTrope notes and', Object.keys(CHAG_HAFTARAH_TROPE_NOTES).length, 'verse-level haftarah notes');
console.log('Annotated haftarot.json with', Object.keys(HAFTARAH_TROPE_NOTES).length, 'verse-level specialTrope notes');

// ---------- 3. megillot.json (not part of Torah leyning API - hand-authored) ----------
const megillot = [
  {
    id: 'Shir HaShirim',
    english: 'Song of Songs',
    occasion: 'Pesach',
    when: "Ashkenazi custom: read on Shabbat Chol HaMoed Pesach (or on the last day/8th day if no Chol HaMoed Shabbat falls that year). Sephardi/Israeli custom: commonly read on the 7th day of Pesach, or nightly/at the seder in some communities. Timing varies meaningfully by kehillah -- treat this as a starting point, not a universal rule.",
    trope: "Chanted in its own distinct megillah cantillation system, not the weekday Torah trope; melodies are largely oral/communal tradition rather than a single fixed te'amim system printed the way Torah trope is.",
  },
  {
    id: 'Rut',
    english: 'Ruth',
    occasion: 'Shavuot',
    when: "Widely read on Shavuot (day 1 in most Ashkenazi communities, some read on day 2 or both days), reflecting the harvest setting of the book and David's descent from Ruth (traditionally born/died on Shavuot).",
    trope: "Chanted in its own distinct megillah cantillation, generally simpler/less universally standardized than Esther's trope.",
  },
  {
    id: 'Eicha',
    english: 'Lamentations',
    occasion: "Tisha B'Av",
    when: "Read the evening of Tisha B'Av (and often repeated, more quietly, the following morning) as part of the mourning service.",
    trope: "Has its own dedicated, highly recognizable mournful cantillation system, entirely distinct from Torah trope; several of its melodic motifs also get 'borrowed' into the Torah/haftarah readings on Tisha B'Av and Shabbat Chazon (see chagim.json specialTrope notes).",
  },
  {
    id: 'Kohelet',
    english: 'Ecclesiastes',
    occasion: 'Sukkot',
    when: "Ashkenazi custom: read on Shabbat Chol HaMoed Sukkot (or Shmini Atzeret/Simchat Torah if no Chol HaMoed Shabbat falls that year). Sephardi/Israeli custom varies more; some communities do not read it publicly with a berachah-level formality at all.",
    trope: "Chanted in its own megillah cantillation, distinct from Torah trope.",
  },
  {
    id: 'Esther',
    english: 'Esther',
    occasion: 'Purim',
    when: "Read twice: the evening of Purim (14 Adar, 15 Adar in walled cities/Shushan Purim) and again the following morning.",
    trope: "Has the most fully standardized and universally-known megillah cantillation system of the five; four verses ('the four verses of redemption') are traditionally chanted aloud by the congregation before the reader repeats them, and the ten sons of Haman (9:7-9) are traditionally read in one breath.",
  },
];
writeFileSync('../data/megillot.json', JSON.stringify({
  description: "The Five Megillot and their public reading occasions. This is NOT sourced from the Hebcal leyning API (which only covers Torah/haftarah readings) -- it is hand-authored from well-established custom, and timing in particular varies by kehillah more than the Torah-reading data above.",
  generatedAt: new Date().toISOString(),
  megillot,
}, null, 2));
console.log('Wrote megillot.json:', megillot.length, 'entries');
