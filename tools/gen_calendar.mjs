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

let totalRows = 0;
const decadeSummaries = [];

for (let decadeStart = START_YEAR; decadeStart < END_YEAR; decadeStart += DECADE) {
  const decadeEnd = Math.min(decadeStart + DECADE, END_YEAR);
  const rows = [];
  for (const il of [false, true]) {
    const region = il ? 'israel' : 'diaspora';
    const events = HebrewCalendar.calendar({
      start: new Date(decadeStart, 0, 1),
      end: new Date(decadeEnd, 0, 1),
      il,
      sedrot: true,
    });
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
        if (leyning.reason) row.specialReading = leyning.reason;
        rows.push(row);
      } else {
        const rawDesc = ev.getDesc();
        if (SKIP_HOLIDAY_DESC.has(rawDesc)) continue;
        const desc = normalizeHolidayDesc(rawDesc);
        // Only include days that actually have a distinct Torah/haftarah reading
        // (matches the set already captured in chagim.json).
        const chagId = `${desc}__${il ? 'IL' : 'DIASPORA'}`;
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
