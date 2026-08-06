import { getLeyningForParsha } from '@hebcal/leyning';
import { writeFileSync } from 'fs';

const INDIVIDUAL = [
 "Bereshit","Noach","Lech-Lecha","Vayera","Chayei Sara","Toldot","Vayetzei","Vayishlach",
 "Vayeshev","Miketz","Vayigash","Vayechi","Shemot","Vaera","Bo","Beshalach","Yitro","Mishpatim",
 "Terumah","Tetzaveh","Ki Tisa","Vayakhel","Pekudei","Vayikra","Tzav","Shmini","Tazria","Metzora",
 "Achrei Mot","Kedoshim","Emor","Behar","Bechukotai","Bamidbar","Nasso","Beha'alotcha","Sh'lach",
 "Korach","Chukat","Balak","Pinchas","Matot","Masei","Devarim","Vaetchanan","Eikev","Re'eh",
 "Shoftim","Ki Teitzei","Ki Tavo","Nitzavim","Vayeilech","Ha'azinu","Vezot Haberakhah"
];

const COMBINED = [
  "Vayakhel-Pekudei","Tazria-Metzora","Achrei Mot-Kedoshim","Behar-Bechukotai",
  "Chukat-Balak","Matot-Masei","Nitzavim-Vayeilech"
];

function aliyahList(fullkriyah) {
  const nums = ['1','2','3','4','5','6','7'];
  return nums.map(n => {
    const a = fullkriyah[n];
    return a ? { aliyah: Number(n), book: a.k, start: a.b, end: a.e, verses: a.v } : null;
  }).filter(Boolean);
}

function buildEntry(name, isCombined) {
  const r = getLeyningForParsha(name);
  const aliyot = aliyahList(r.fullkriyah);
  const maftir = r.fullkriyah.M ? { book: r.fullkriyah.M.k, start: r.fullkriyah.M.b, end: r.fullkriyah.M.e, verses: r.fullkriyah.M.v } : null;
  // total verses of the parsha = sum of 7 aliyot (maftir is a repeat of the tail of aliyah 7, not additional pesukim)
  const totalVerses = aliyot.reduce((s,a) => s + a.verses, 0);
  const entry = {
    id: name,
    englishName: r.name.en,
    hebrewName: r.name.he,
    book: r.fullkriyah['1'].k,
    parshaNum: r.parshaNum,
    combined: !!isCombined,
    torahRange: r.summary,
    aliyot,
    maftir,
    totalVerses,
    avgAliyahVerses: Math.round((totalVerses/aliyot.length)*10)/10,
    longestAliyah: aliyot.reduce((m,a)=>a.verses>m.verses?a:m, aliyot[0]).aliyah,
    shortestAliyah: aliyot.reduce((m,a)=>a.verses<m.verses?a:m, aliyot[0]).aliyah,
    weekdayReading: r.weekday ? aliyahList(Object.fromEntries(Object.entries(r.weekday))) : null,
  };
  return entry;
}

const parshiot = INDIVIDUAL.map(n => buildEntry(n, false));
const combined = COMBINED.map(n => buildEntry(n, true));

writeFileSync('../data/parshiot.json', JSON.stringify({
  description: "Canonical annual (fullkriyah) Torah-reading aliyah divisions for all 54 individual parshiot, sourced from the Hebcal @hebcal/leyning reference tables (the standard Masoretic aliyah divisions used in most printed chumashim). Verse counts (v) come from Hebcal's own verse-count calculation, not hand counted.",
  source: "@hebcal/leyning v10.0.0 (getLeyningForParsha)",
  generatedAt: new Date().toISOString(),
  count: parshiot.length,
  parshiot
}, null, 2));

writeFileSync('../data/parshiot-combined.json', JSON.stringify({
  description: "The 7 pairs of parshiot that are sometimes read combined (double parshiot), with the combined aliyah division used when read together. Whether a given pair is combined in a given year, and whether Israel/Diaspora years match, is calendar-dependent -- see calendar_100y for the actual per-year determination.",
  source: "@hebcal/leyning v10.0.0 (getLeyningForParsha)",
  generatedAt: new Date().toISOString(),
  count: combined.length,
  combinedParshiot: combined
}, null, 2));

console.log('Wrote', parshiot.length, 'individual +', combined.length, 'combined parshiot');
console.log('Sample:', JSON.stringify(parshiot[0], null, 2));
