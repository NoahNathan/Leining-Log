import { HebrewCalendar } from '@hebcal/core';
import { getLeyningForParshaHaShavua } from '@hebcal/leyning';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

mkdirSync('../data/calendar-100y', { recursive: true });

// Only holiday-type calendar rows whose chagId actually exists in chagim.json
// (i.e. actually carries a distinct Torah/haftarah reading) are kept -- this
// avoids dangling references to labels like "Erev Rosh Hashana" or "Leil
// Selichot" that Hebcal marks as calendar events but that have no leyning.
const validChagIds = new Set(
  JSON.parse(readFileSync('../data/chagim.json', 'utf8')).chagim.map(c => c.id)
);

const START_YEAR = 2026;
const END_YEAR = 2126; // 100-year span
const DECADE = 10;

function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(hd) {
  const g = hd.greg();
  return `${g.getFullYear()}-${pad(g.getMonth()+1)}-${pad(g.getDate())}`;
}

function parshaIdFor(parshaArr) {
  return parshaArr.length === 2 ? `${parshaArr[0]}-${parshaArr[1]}` : parshaArr[0];
}

// Skip Rosh Chodesh Tevet (subsumed into Chanukah day) and Chag HaBanot (no distinct kriyah),
// matching the same rule used to build chagim.json.
const SKIP_HOLIDAY_DESC = new Set(['Rosh Chodesh Tevet', 'Chag HaBanot']);
function normalizeHolidayDesc(desc) {
  const m = desc.match(/^Rosh Hashana (\d+)$/);
  return m ? 'Rosh Hashana I' : desc;
}

function isShabbat(hd) { return hd.greg().getDay() === 6; }
const CHOL_HAMOED_FAMILY = /^(Pesach|Sukkot) [IVX]+ \(CH''M\)$/;
function sharedShabbatChagId(desc, region) {
  const m = desc.match(CHOL_HAMOED_FAMILY);
  return m ? `${m[1]} Shabbat Chol ha-Moed__${region}` : null;
}

// Hebcal's own reason string can carry a "this specific occurrence"
// qualifier (" (on Rosh Chodesh)", " (on Shabbat)") describing what ELSE is
// going on that week, distinct from the reading itself -- e.g. the maftir
// reason "Shabbat Shekalim (on Rosh Chodesh)" describes Shekalim's own
// maftir, with the Rosh Chodesh coincidence noted separately (and handled
// separately below, via aliyah 7). Stripped for a clean per-section label.
function stripQualifier(s) {
  return s
    .replace(/\s*\(on (Shabbat|Rosh Chodesh)\)$/, '')
    .replace(/\s+on (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, '');
}
function toRef(h) {
  if (!h) return null;
  if (Array.isArray(h)) return h.map(toRef);
  return { book: h.k, start: h.b, end: h.e, verses: h.v };
}

let totalRows = 0;
const decadeSummaries = [];

for (let decadeStart = START_YEAR; decadeStart < END_YEAR; decadeStart += DECADE) {
  const decadeEnd = Math.min(decadeStart + DECADE, END_YEAR);
  const rows = [];
  for (const il of [false, true]) {
    const region = il ? 'israel' : 'diaspora';
    const regionTag = il ? 'IL' : 'DIASPORA';
    const events = HebrewCalendar.calendar({
      start: new Date(decadeStart, 0, 1),
      end: new Date(decadeEnd, 0, 1),
      il,
      sedrot: true,
    });

    // Pass 1: which dates have a parsha reading at all. A holiday-flagged
    // event on one of these dates (Rosh Chodesh, Shekalim/Zachor/Parah/
    // HaChodesh/HaGadol/Shuva, Chanukah-on-Shabbat -- verified empirically
    // across the full 100-year range: every one of these ALWAYS coincides
    // with a parsha date, never stands alone) is folded into that parsha's
    // own reading below instead of shown as a second row/card. Chol HaMoed
    // and genuine independent festivals (Pesach, Sukkot, Rosh Hashana, Yom
    // Kippur, Shavuot) never coincide with a parsha date at all -- Hebcal
    // suspends the weekly cycle for those weeks -- so they're unaffected
    // and still get their own standalone row further down.
    const parshaDates = new Set();
    for (const ev of events) {
      if (ev.getFlags() & 1024) parshaDates.add(isoDate(ev.getDate()));
    }

    for (const ev of events) {
      const f = ev.getFlags();
      const hd = ev.getDate();
      if (f & 1024) { // PARSHA_HASHAVUA
        let leyning;
        try { leyning = getLeyningForParshaHaShavua(ev, il); } catch (e) { continue; }
        const parshaId = parshaIdFor(leyning.parsha);
        const row = {
          date: isoDate(hd),
          hebrewDate: hd.toString(),
          region,
          type: 'parsha',
          parshaId,
          combined: leyning.parsha.length === 2,
        };
        if (leyning.reason) {
          const r = leyning.reason;
          row.specialReading = { ...r };
          // A clean label for the week, and how many Torah scrolls it
          // takes: 3 when aliyah 7 is ALSO reassigned (always to Rosh
          // Chodesh's own portion -- Numbers 28:9-15 -- when this happens;
          // verified across every combination Hebcal produces) --
          // 1 regular scroll (aliyot 1-6) + Rosh Chodesh (aliyah 7) + the
          // special day itself (maftir). 2 when only the maftir (and
          // usually haftarah) changes -- 1 regular scroll (aliyot 1-7) +
          // the special day (maftir). Haftarah-only substitutions (Machar
          // Chodesh, etc., no chagim.json entry of their own -- see below)
          // don't touch the Torah reading at all, so they don't count as a
          // second scroll.
          row.specialReading.label = stripQualifier(r.haftara || r.M || r['7']);
          row.specialReading.scrollCount = r['7'] ? 3 : (r.M ? 2 : 1);
          if (r['7']) {
            row.specialReading.aliyah7Ref = toRef(leyning.fullkriyah?.['7']);
            // Reassigning aliyah 7 to Rosh Chodesh doesn't just replace it --
            // it also RESHAPES aliyah 6, which absorbs what would normally
            // be aliyah 7's opening verses so nothing silently goes unread
            // (verified: Terumah's regular aliyah 6 is Ex 27:1-8, but on a
            // Shekalim+Rosh-Chodesh Shabbat aliyah 6 is Ex 27:1-19 -- the
            // combined range). Capture every aliyah Hebcal actually placed a
            // number on here, so the app can render exactly what's read
            // instead of assuming only aliyah 7 moved.
            row.specialReading.aliyot = Object.fromEntries(
              ['1','2','3','4','5','6','7']
                .filter((n) => leyning.fullkriyah?.[n])
                .map((n) => [n, toRef(leyning.fullkriyah[n])])
            );
          }
          if (r.M) row.specialReading.maftirRef = toRef(leyning.fullkriyah?.M);
          // A handful of special-Shabbat labels (Machar Chodesh, Pinchas
          // after 17 Tammuz, Ki Teitzei's 3rd Haftarah of Consolation,
          // Kedoshim following a special Shabbat) are haftarah-only swaps
          // with no separate maftir aliyah -- Hebcal never flags them as
          // their own calendar event, so they get no companion chagim.json
          // entry (unlike Shekalim/Zachor/etc., which do). leyning.haft
          // carries the actual substitute haftarah reference either way.
          if (r.haftara && leyning.haft) row.specialReading.haftaraRef = toRef(leyning.haft);
          if (r.sephardic && leyning.seph) row.specialReading.haftaraRefSefardi = toRef(leyning.seph);
          if (r.chabad && leyning.chabad) row.specialReading.haftaraRefChabad = toRef(leyning.chabad);
        }
        rows.push(row);
      } else {
        const rawDesc = ev.getDesc();
        if (SKIP_HOLIDAY_DESC.has(rawDesc)) continue;
        const desc = normalizeHolidayDesc(rawDesc);
        const dateISO = isoDate(hd);

        // This week's actual reading is already fully captured on the
        // parsha row above (including this holiday's own contribution, via
        // specialReading) -- showing it again as a second card would at
        // best duplicate it, and on a triple-coincidence Shabbat (e.g.
        // Shabbat Shekalim ALSO on Rosh Chodesh) would show a "Rosh
        // Chodesh" card whose own maftir/haftarah aren't fully what's read
        // that week (only its aliyah-7 portion is).
        if (isShabbat(hd) && parshaDates.has(dateISO)) continue;

        let chagId = `${desc}__${regionTag}`;
        if (isShabbat(hd)) chagId = sharedShabbatChagId(desc, regionTag) || chagId;

        // Only include days that actually have a distinct Torah/haftarah reading
        // (matches the set already captured in chagim.json).
        if (!validChagIds.has(chagId)) continue;
        rows.push({
          date: dateISO,
          hebrewDate: hd.toString(),
          region,
          type: 'holiday',
          name: desc,
          chagId,
        });
      }
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.region.localeCompare(b.region));
  const fname = `../data/calendar-100y/${decadeStart}-${decadeEnd - 1}.json`;
  writeFileSync(fname, JSON.stringify({
    description: `Shabbat parsha readings and chag/fast/Rosh Chodesh readings, ${decadeStart}-${decadeEnd - 1}, for both diaspora and israel regions. 'parshaId' references parshiot.json/parshiot-combined.json; 'chagId' references chagim.json. A parsha row's 'specialReading' (when present) fully describes what's actually read that week -- including any Rosh Chodesh/Shekalim/Zachor/Parah/HaChodesh/HaGadol/Shuva/Chanukah-on-Shabbat contribution via aliyah7Ref/maftirRef/haftaraRef -- so holiday-type rows are never emitted for a date that also has a parsha (verified: Rosh Chodesh and the special-Shabbat labels always coincide with a parsha date; only Chol HaMoed and independent festivals -- Pesach, Sukkot, Rosh Hashana, Yom Kippur, Shavuot -- ever stand alone, and those still get their own row here). See gen_calendar.mjs SKIP_HOLIDAY_DESC for the two content-free exclusions.`,
    yearRange: [decadeStart, decadeEnd - 1],
    generatedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  }, null, 2));
  totalRows += rows.length;
  decadeSummaries.push({ file: `${decadeStart}-${decadeEnd - 1}.json`, yearRange: [decadeStart, decadeEnd - 1], count: rows.length });
  console.log('Wrote', fname, rows.length, 'rows');
}

writeFileSync('../data/calendar-100y/index.json', JSON.stringify({
  description: "Index of the 100-year (2026-2126) Torah-reading calendar, split into decade files to keep individual files manageable. Each row's parshaId/chagId references parshiot.json/parshiot-combined.json/chagim.json rather than duplicating aliyah data.",
  source: "@hebcal/core + @hebcal/leyning v10.0.0, computed locally (not a third-party API call)",
  generatedAt: new Date().toISOString(),
  totalRows,
  files: decadeSummaries,
}, null, 2));

console.log('TOTAL ROWS:', totalRows);
