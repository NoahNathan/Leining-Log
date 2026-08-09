import { HebrewCalendar } from '@hebcal/core';
import { getLeyningForParshaHaShavua, getLeyningForHoliday } from '@hebcal/leyning';
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

// Rosh Chodesh and Pesach/Sukkot Chol HaMoed read completely differently
// when their date happens to land on Shabbat that year (see gen_chagim.mjs
// for the full explanation and the shared "Shabbat Rosh Chodesh" / "...Chol
// ha-Moed" entries it captures for this). On such a date:
//  - Chol HaMoed always routes to the shared Shabbat entry -- there's no
//    competing parsha reading that week to conflict with.
//  - Rosh Chodesh only routes there if it's actually what gets read: when
//    the same Shabbat is ALSO Shekalim/Zachor/Parah/HaChodesh, that takes
//    priority and Rosh Chodesh's own maftir is superseded -- verified by
//    comparing this event's own maftir against the parsha's actual winning
//    one that week (from getLeyningForParshaHaShavua, which already
//    resolves the priority correctly). If it doesn't match, this row is
//    dropped entirely rather than showing a maftir/haftarah that isn't
//    actually read that week.
//
//    Compared on MAFTIR, not haftarah: during the Three Weeks (Matot-Masei
//    through Devarim), a Rosh-Chodesh-on-Shabbat that also falls on one of
//    those parshiot gets a haftarah blended for that specific parsha
//    (Hebcal's own `reason` still says "on Shabbat Rosh Chodesh") even
//    though the maftir itself (Numbers 28:9-15) is unchanged -- comparing
//    haftarah there would wrongly read as "superseded" and drop a row that
//    genuinely still includes Rosh Chodesh.
const ROSH_CHODESH_FAMILY = /^Rosh Chodesh /;
const CHOL_HAMOED_FAMILY = /^(Pesach|Sukkot) [IVX]+ \(CH''M\)$/;
function isShabbat(hd) { return hd.greg().getDay() === 6; }
function sameMaftir(a, b) {
  if (!a || !b) return false;
  return a.k === b.k && a.b === b.b && a.e === b.e;
}
function sharedShabbatChagId(desc, region) {
  if (ROSH_CHODESH_FAMILY.test(desc)) return `Shabbat Rosh Chodesh__${region}`;
  const m = desc.match(/^(Pesach|Sukkot) [IVX]+ \(CH''M\)$/);
  return m ? `${m[1]} Shabbat Chol ha-Moed__${region}` : null;
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

    // Pass 1: every date's actual winning maftir, straight from the
    // parsha's own leyning (which already resolves Rosh Chodesh vs.
    // Shekalim/Zachor/Parah/HaChodesh priority correctly). Needed before
    // pass 2 can tell whether a same-day Rosh Chodesh holiday event is
    // genuinely what's read that week.
    const parshaMaftirByDate = new Map();
    for (const ev of events) {
      if (!(ev.getFlags() & 1024)) continue;
      let leyning;
      try { leyning = getLeyningForParshaHaShavua(ev, il); } catch (e) { continue; }
      parshaMaftirByDate.set(isoDate(ev.getDate()), leyning.fullkriyah?.M || null);
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
          row.specialReading = leyning.reason;
          // A handful of special-Shabbat labels (Machar Chodesh, Pinchas
          // after 17 Tammuz, Ki Teitzei's 3rd Haftarah of Consolation,
          // Kedoshim following a special Shabbat) are haftarah-only swaps
          // with no separate maftir aliyah -- Hebcal never flags them as
          // their own calendar event, so they get no companion 'holiday'
          // row and no chagim.json entry (unlike Shekalim/Zachor/etc.,
          // which do). leyning.haft carries the actual substitute haftarah
          // reference; capture it here so the app can show real content
          // instead of just the label.
          if (leyning.haft) {
            const toRef = (h) => ({ book: h.k, start: h.b, end: h.e, verses: h.v });
            row.specialReading.haftaraRef = Array.isArray(leyning.haft)
              ? leyning.haft.map(toRef) : toRef(leyning.haft);
          }
        }
        rows.push(row);
      } else {
        const rawDesc = ev.getDesc();
        if (SKIP_HOLIDAY_DESC.has(rawDesc)) continue;
        const desc = normalizeHolidayDesc(rawDesc);
        let chagId = `${desc}__${regionTag}`;

        if (isShabbat(hd) && (ROSH_CHODESH_FAMILY.test(desc) || CHOL_HAMOED_FAMILY.test(desc))) {
          const dateISO = isoDate(hd);
          if (ROSH_CHODESH_FAMILY.test(desc) && parshaMaftirByDate.has(dateISO)) {
            let holidayLeyning;
            try { holidayLeyning = getLeyningForHoliday(ev, il); } catch (e) { continue; }
            if (!sameMaftir(holidayLeyning.fullkriyah?.M, parshaMaftirByDate.get(dateISO))) continue; // superseded this week
          }
          chagId = sharedShabbatChagId(desc, regionTag) || chagId;
        }

        // Only include days that actually have a distinct Torah/haftarah reading
        // (matches the set already captured in chagim.json).
        if (!validChagIds.has(chagId)) continue;
        rows.push({
          date: isoDate(hd),
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
    description: `Shabbat parsha readings and chag/fast/Rosh Chodesh readings, ${decadeStart}-${decadeEnd - 1}, for both diaspora and israel regions. 'parshaId' references parshiot.json/parshiot-combined.json; 'chagId' references chagim.json. Only holiday-type rows correspond to an entry that actually carries a distinct Torah reading (see gen_calendar.mjs SKIP_HOLIDAY_DESC for the two exclusions).`,
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
