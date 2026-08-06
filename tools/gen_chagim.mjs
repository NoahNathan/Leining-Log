import { HebrewCalendar } from '@hebcal/core';
import { getLeyningForHoliday } from '@hebcal/leyning';
import { writeFileSync } from 'fs';

function cite(h) {
  if (!h) return null;
  if (Array.isArray(h)) return h.map(cite);
  return { book: h.k, start: h.b, end: h.e, verses: h.v, reason: h.reason };
}
function aliyahList(fullkriyah) {
  if (!fullkriyah) return [];
  const nums = ['1','2','3','4','5','6','7'];
  return nums.map(n => {
    const a = fullkriyah[n];
    return a ? { aliyah: Number(n), book: a.k, start: a.b, end: a.e, verses: a.v, reason: a.reason } : null;
  }).filter(Boolean);
}
function maftirOf(fullkriyah) {
  const m = fullkriyah?.M;
  return m ? { book: m.k, start: m.b, end: m.e, verses: m.v, reason: m.reason } : null;
}

function normalizeDesc(desc) {
  // Strip the trailing Hebrew year from Rosh Hashana labels: "Rosh Hashana 5787" -> "Rosh Hashana I"
  const m = desc.match(/^Rosh Hashana (\d+)$/);
  if (m) return 'Rosh Hashana I';
  return desc;
}

const SKIP = new Set(['Rosh Chodesh Tevet', 'Chag HaBanot']); // subsumed by Chanukah day readings / no distinct kriyah

const out = new Map();
for (const il of [false, true]) {
  const events = HebrewCalendar.calendar({ start: new Date(2026, 0, 1), end: new Date(2034, 0, 1), il });
  for (const ev of events) {
    const f = ev.getFlags();
    if (f & 1024) continue; // parsha events handled elsewhere
    const rawDesc = ev.getDesc();
    if (SKIP.has(rawDesc)) continue;
    const desc = normalizeDesc(rawDesc);
    let leyning;
    try { leyning = getLeyningForHoliday(ev, il); } catch (e) { continue; }
    if (!leyning) continue;
    const key = desc + '__' + (il ? 'IL' : 'DIASPORA');
    if (out.has(key)) continue;
    out.set(key, {
      id: key,
      name: desc,
      region: il ? 'israel' : 'diaspora',
      hebrewDate: ev.getDate().toString(),
      aliyot: aliyahList(leyning.fullkriyah),
      maftir: maftirOf(leyning.fullkriyah),
      summary: leyning.summary || null,
      nusach: {
        ashkenazi: cite(leyning.haft),
        sefardi: leyning.seph ? cite(leyning.seph) : { sameAs: 'ashkenazi' },
        chabad: leyning.chabad ? cite(leyning.chabad) : { sameAs: 'ashkenazi' },
      },
    });
  }
}

const chagim = [...out.values()].sort((a, b) => a.name.localeCompare(b.name) || a.region.localeCompare(b.region));

writeFileSync('../data/chagim.json', JSON.stringify({
  description: "Torah, maftir, and haftarah readings for every chag, fast day, Rosh Chodesh, and special Shabbat, for both Diaspora and Israel ('region': 'diaspora'|'israel'), sourced from the Hebcal @hebcal/leyning reference tables. Nusach (ashkenazi/sefardi/chabad) haftarah variants are included where those traditions differ; 'sameAs: ashkenazi' means no variance was found in this source. Run annotate.mjs afterwards to add hand-curated 'specialTrope' notes (well-established distinct cantillation/layout customs not covered by the Hebcal data itself); their absence on an entry does not mean 'no special customs exist', only that none are documented here yet.",
  source: "@hebcal/leyning v10.0.0 (getLeyningForHoliday)",
  generatedAt: new Date().toISOString(),
  count: chagim.length,
  chagim,
}, null, 2));
console.log('Wrote', chagim.length, 'chagim/holiday leyning entries to chagim.json (run annotate.mjs next for specialTrope notes)');
