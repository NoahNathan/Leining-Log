// Verifies data/aliyah-summaries.json against the actual Hebrew text.
//
// The summaries are hand-written, and the failure mode that matters is not
// clumsy phrasing -- it is a summary attached to the WRONG verse range, which
// reads perfectly well and is completely wrong. So for every proper name a
// summary mentions, this checks that the name actually occurs in the Hebrew
// of that range. A summary of Genesis 24 that mentions Rivka passes; the same
// summary accidentally keyed to Genesis 23 fails loudly.
//
// It cannot verify that a summary is a GOOD description -- only that it is
// talking about the right passage. That is the error worth automating.
import { getChapter } from '@shafeh/tanach';
import { readFileSync } from 'fs';

const BOOKS = {
  Genesis: 'Bereishit', Exodus: 'Shemot', Leviticus: 'Vayikra',
  Numbers: 'Bamidbar', Deuteronomy: 'Devarim',
  Joshua: 'Yehoshua', Judges: 'Shoftim', 'I Samuel': 'Shmuel I', 'II Samuel': 'Shmuel II',
  'I Kings': 'Melachim I', 'II Kings': 'Melachim II', Isaiah: 'Yeshayahu',
  Jeremiah: 'Yirmiyahu', Ezekiel: 'Yechezkel', Hosea: 'Hoshea', Joel: 'Yoel',
  Amos: 'Amos', Obadiah: 'Ovadiah', Jonah: 'Yonah', Micah: 'Michah',
  Zechariah: 'Zechariah', Malachi: 'Malachi',
};

// English spellings used in the summaries -> the Hebrew consonantal form(s)
// that should appear in the passage. Any of the listed forms counts as a hit.
const NAMES = {
  Adam: ['אדם'], Chava: ['חוה'], Kayin: ['קין'], Hevel: ['הבל'], Shet: ['שת'],
  Chanoch: ['חנוך'], Lemech: ['למך'], Noach: ['נח'], Cham: ['חם'], Shem: ['שם'],
  Bavel: ['בבל'], Terach: ['תרח'], Charan: ['חרן'], Nachor: ['נחור'], Ur: ['אור'],
  Avram: ['אברם'], Avraham: ['אברהם'], Sarai: ['שרי'], Sarah: ['שרה'],
  Lot: ['לוט'], Canaan: ['כנען', 'כנענ'], Egypt: ['מצרים', 'מצרימה'], Pharaoh: ['פרעה'],
  Sodom: ['סדם', 'סדום'], Hagar: ['הגר'], Yishmael: ['ישמעאל'], Yitzchak: ['יצחק'],
  Avimelech: ['אבימלך'], 'Be\'er Sheva': ['שבע'], Rivka: ['רבקה'], Betuel: ['בתואל'],
  Machpelah: ['המכפלה', 'מכפלה'], Keturah: ['קטורה'], Lavan: ['לבן'],
  Esav: ['עשו'], Yaakov: ['יעקב'], Yisrael: ['ישראל'], Rachel: ['רחל'], Leah: ['לאה'],
  'Beit El': ['אל'], Machalat: ['מחלת'], 'Padan Aram': ['פדנה', 'פדן'],
  Machanayim: ['מחנים'], Peniel: ['פניאל', 'פנואל'], Dina: ['דינה'], Shechem: ['שכם'],
  Shimon: ['שמעון'], Levi: ['לוי'], Binyamin: ['בנימין', 'בנימן'], Seir: ['שעיר'],
  Edom: ['אדום', 'אדם'], Yosef: ['יוסף'], Reuven: ['ראובן'], Yehuda: ['יהודה'],
  Tamar: ['תמר'], Peretz: ['פרץ'], Zerach: ['זרח'], Potifar: ['פוטיפר'],
  Menashe: ['מנשה'], Efraim: ['אפרים'], Goshen: ['גשן', 'גשנה'], Dan: ['דן'],
  Gad: ['גד'], Philistines: ['פלשתים'],
};

// Yaakov is renamed at Gen 32:29 and the text uses both names from then on,
// often within a few verses of each other. Treating them as one person is a
// fact about the text, not a loosening of the check.
const ALIASES = { Yaakov: ['ישראל'] };

// Figures who are genuinely present in the passage but referred to by
// description rather than by name. Listed explicitly, with how the text
// actually refers to them, so that every exception stays visible and
// reviewable instead of the rule quietly being relaxed for everyone.
const UNNAMED_BUT_PRESENT = {
  'Genesis 21:5-21:21': { Yishmael: 'called "the boy" and "the son of Hagar", never named here' },
  'Genesis 44:18-44:30': { Binyamin: 'called "the lad" and "the youngest" throughout Yehuda\'s plea' },
  'Genesis 44:31-45:7': { Yehuda: 'still speaking from the previous aliyah; not named again in this span' },
};

const TROPE = /[֑-֯]/g, NIQQUD = /[ְ-ׇּׁׂ]/g, HEB = /[א-ת]/, NON = /[^א-תְ-ׇּׁׂ֑-֯]/g;
const cache = {};
function loadBook(en) {
  if (cache[en]) return cache[en];
  const tn = BOOKS[en];
  if (!tn) return null;
  const out = {};
  let ch = 1;
  while (true) {
    const c = getChapter(tn, ch);
    if (!c || c.length === 0) break;
    out[ch] = c.map((v) => ({
      verse: v.verse,
      cons: v.text.split(/[\s־]+/).map((t) => t.replace(NON, '')).filter((t) => HEB.test(t))
        .map((w) => w.replace(TROPE, '').replace(NIQQUD, '')).join(' '),
    }));
    ch++;
  }
  cache[en] = out;
  return out;
}
function rangeText(book, start, end) {
  const b = loadBook(book);
  if (!b) return null;
  const [sc, sv] = start.split(':').map(Number);
  const [ec, ev] = end.split(':').map(Number);
  const parts = [];
  for (let ch = sc; ch <= ec; ch++) {
    const c = b[ch];
    if (!c) continue;
    for (const v of c) if (v.verse >= (ch === sc ? sv : -Infinity) && v.verse <= (ch === ec ? ev : Infinity)) parts.push(v.cons);
  }
  return parts.join(' ');
}

const { summaries } = JSON.parse(readFileSync('../data/aliyah-summaries.json', 'utf8'));
const KEY_RE = /^(.+?) (\d+:\d+)-(\d+:\d+)$/;
let checked = 0, nameChecks = 0, exempt = 0;
const problems = [];

for (const [key, text] of Object.entries(summaries)) {
  const m = key.match(KEY_RE);
  if (!m) { problems.push(`${key}: unparseable range key`); continue; }
  const [, book, start, end] = m;
  const hebrew = rangeText(book, start, end);
  if (hebrew === null) { problems.push(`${key}: book not found in text package`); continue; }
  if (!hebrew) { problems.push(`${key}: range resolved to NO verses -- bad reference`); continue; }
  checked++;
  for (const [english, forms] of Object.entries(NAMES)) {
    // Word-boundary-ish match on the English side so "Dan" doesn't fire inside "Dina".
    if (!new RegExp(`(^|[^A-Za-z'])${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z']|$)`).test(text)) continue;
    if (UNNAMED_BUT_PRESENT[key] && UNNAMED_BUT_PRESENT[key][english]) { exempt++; continue; }
    nameChecks++;
    const candidates = [...forms, ...(ALIASES[english] || [])];
    const hit = candidates.some((f) => hebrew.includes(f));
    if (!hit) problems.push(`${key}: mentions "${english}" but no form of it (${candidates.join('/')}) appears in the Hebrew`);
  }
}

console.log(`Checked ${checked} summaries, ${nameChecks} name references verified against the Hebrew.`);
if (exempt) console.log(`${exempt} reference(s) exempt: present in the passage but not named there (see UNNAMED_BUT_PRESENT).`);
if (problems.length === 0) {
  console.log('All clear -- every named person, people and place appears in the passage it is attributed to.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
  process.exitCode = 1;
}
