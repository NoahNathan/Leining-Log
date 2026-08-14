// Generates data/parsha-typical-month.json: for every individual and
// combined parsha, the Gregorian month (1-12) it is most commonly read in,
// sampled across the 100-year calendar (calendar-100y/) this repo already
// generates from real Hebcal output.
//
// Why this exists: a bare Gregorian year alone doesn't map to a single
// Hebrew year (see gregorianToHebrewYear in web/js/util.js) -- Rosh
// Hashanah splits any Gregorian year into two different Hebrew years, and
// only the month resolves which side a given reading falls on. Rather than
// ask the user to remember and enter that month by hand, this lets the app
// infer it automatically from the parsha they're already logging: each
// parsha lands in essentially the same Gregorian month every single year
// (confirmed directly -- across 2026-2035, Bereshit is October in all 10
// years, Nitzavim-Vayeilech is September in all 8, Matot-Masei is July in
// all 9), because the annual reading cycle is pinned to the Hebrew
// calendar's own Tishrei-to-Tishrei structure, not the Gregorian one.
//
// Diaspora region only -- Israel's calendar differs from Diaspora's by at
// most a week or two (extra Diaspora-only chag days shift a handful of
// Shabbatot), never enough to change which Gregorian MONTH a parsha falls
// in, so a single shared table is sufficient and matches the app's existing
// default region elsewhere.
import { readFileSync, writeFileSync } from 'fs';

const index = JSON.parse(readFileSync('../data/calendar-100y/index.json', 'utf8'));
const allRows = [];
for (const f of index.files) {
  const decade = JSON.parse(readFileSync(`../data/calendar-100y/${f.file}`, 'utf8'));
  allRows.push(...decade.rows);
}

const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));
const { combinedParshiot } = JSON.parse(readFileSync('../data/parshiot-combined.json', 'utf8'));
const allParshaIds = [...parshiot.map(p => p.id), ...combinedParshiot.map(p => p.id)];

function monthCounts(rows) {
  const counts = new Map();
  for (const r of rows) {
    const month = Number(r.date.slice(5, 7));
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return counts;
}
function modeMonth(counts) {
  let best = null, bestCount = -1;
  for (const [month, count] of counts) {
    if (count > bestCount) { best = month; bestCount = count; }
  }
  return best;
}

const result = {};
const skipped = [];
for (const parshaId of allParshaIds) {
  const rows = allRows.filter(r => r.type === 'parsha' && r.region === 'diaspora' && r.parshaId === parshaId);
  if (!rows.length) { skipped.push(parshaId); continue; }
  result[parshaId] = modeMonth(monthCounts(rows));
}

// Vezot Haberakhah is read on Simchat Torah itself -- a holiday row keyed by
// chagId, not an ordinary Shabbat parsha row -- so it needs its own lookup.
const vezotRows = allRows.filter(r => r.type === 'holiday' && r.region === 'diaspora' && /^Simchat Torah/.test(r.chagId || ''));
if (vezotRows.length) {
  result['Vezot Haberakhah'] = modeMonth(monthCounts(vezotRows));
  const i = skipped.indexOf('Vezot Haberakhah');
  if (i !== -1) skipped.splice(i, 1); // it has no ordinary 'parsha' rows by design -- always a Simchat Torah row instead -- so the main loop above flags it before this special case fills it in
} else if (!skipped.includes('Vezot Haberakhah')) {
  skipped.push('Vezot Haberakhah');
}

if (skipped.length) console.warn('No calendar rows found for:', skipped);

const out = {
  description: 'For every individual and combined parsha, the Gregorian month (1-12) it is most commonly read in, sampled across the 100-year calendar in calendar-100y/. Used to auto-derive an exact Hebrew year from a bare Gregorian year on My Leining\'s log form, without asking the user to remember which month they read it. Diaspora region only -- see this file\'s generator for why that\'s sufficient.',
  generatedAt: new Date().toISOString(),
  months: result,
};
writeFileSync('../data/parsha-typical-month.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote parsha-typical-month.json: ${Object.keys(result).length} parshiot${skipped.length ? `, ${skipped.length} skipped` : ''}`);
