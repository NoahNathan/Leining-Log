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

// The raw Hebcal event description (`ev.getDesc()`, used for `desc`/the
// chagId) is a scheduling label, not a reading name -- for Chanukah in
// particular it's the candle count ("Chanukah: 2 Candles"), which is off by
// one from what every reader actually calls that day ("Chanukah Day 1").
// getLeyningForHoliday's own `leyning.name.en` is the correct human name Hebcal
// itself uses for the reading -- e.g. "Chanukah Day 1", "Sukkot Chol ha-Moed
// Day 2" -- so prefer it for display, falling back to desc when absent.
//
// It can carry a "this specific occurrence" qualifier -- " (on Shabbat)",
// "... on Sunday" -- when THIS reading's date happens to fall on Shabbat/a
// particular weekday. Verified (see gen_calendar.mjs / difficulty-rubric
// notes) to be stable across every OTHER occurrence of the same desc except
// where the reading genuinely changes shape on Shabbat (Rosh Chodesh, Chol
// HaMoed -- those get an entirely different name Hebcal-side, not just a
// suffix, and are intentionally left alone here). Stripped so the one
// static entry this generator captures per chagId -- reused for every
// matching year across the whole 100-year calendar -- doesn't permanently
// bake in a qualifier that's wrong most years. Deliberately narrow: do NOT
// strip other trailing parentheticals, which are real content, not
// transient qualifiers (e.g. "Sukkot Final Day (Hoshana Raba)").
function displayNameFor(leyning, desc) {
  const raw = leyning.name && leyning.name.en;
  if (!raw) return desc;
  // Hebcal's leyning name drops the "(observed)" qualifier (Tish'a B'Av
  // postponed a day because its original date fell on Shabbat) even though
  // it's real, permanent, distinguishing information -- keeping it would
  // otherwise make two different chagIds render with the identical name.
  if (/\(observed\)$/.test(desc)) return desc;
  return raw
    .replace(/\s*\(on (Shabbat|Rosh Chodesh)\)$/, '')
    .replace(/\s+on (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, '');
}

const SKIP = new Set(['Rosh Chodesh Tevet', 'Chag HaBanot']); // subsumed by Chanukah day readings / no distinct kriyah

// Rosh Chodesh and Pesach/Sukkot Chol HaMoed days are ordinary WEEKDAY
// readings (short, no maftir/haftarah for Rosh Chodesh; a handful of
// aliyot for Chol HaMoed) most years, but when the same calendar date
// happens to fall on Shabbat that year, Hebcal's own leyning for that
// exact event returns an entirely different reading -- a full 7-aliyot
// Shabbat-shaped one with its own maftir and haftarah, added onto (Rosh
// Chodesh) or replacing (Chol HaMoed) the week's regular Torah portion.
// A single generation window can only ever observe ONE of the two shapes
// per desc and previously baked in whichever one came first, silently
// wrong for every year that lands on the other side of that split.
//
// The Shabbat-shaped reading turns out to be identical regardless of
// WHICH month's Rosh Chodesh or WHICH Chol HaMoed day it is (verified:
// Numbers 28:9-15 + Isaiah 66 for any Rosh-Chodesh-on-Shabbat; Ezekiel 37
// for any Pesach Chol-HaMoed Shabbat; Ezekiel 39 for any Sukkot one) --
// exactly like Shabbat Shekalim/Zachor/Parah/HaChodesh are already a
// single fixed reading regardless of which parsha carries them. So rather
// than storing a Shabbat variant per month/day, this generator captures
// ONE shared entry per family below, and the weekday-only entries here
// stay reliably weekday-shaped by skipping Saturday occurrences when
// picking each family's "first occurrence".
const ROSH_CHODESH_FAMILY = /^Rosh Chodesh /;
const CHOL_HAMOED_FAMILY = /^(Pesach|Sukkot) [IVX]+ \(CH''M\)$/;
function variesByShabbat(desc) {
  return ROSH_CHODESH_FAMILY.test(desc) || CHOL_HAMOED_FAMILY.test(desc);
}
function isShabbat(ev) {
  return ev.getDate().greg().getDay() === 6;
}

function buildEntry(id, name, region, ev, leyning) {
  return {
    id, name, region,
    hebrewDate: ev.getDate().toString(),
    aliyot: aliyahList(leyning.fullkriyah),
    maftir: maftirOf(leyning.fullkriyah),
    summary: leyning.summary || null,
    nusach: {
      ashkenazi: cite(leyning.haft),
      sefardi: leyning.seph ? cite(leyning.seph) : { sameAs: 'ashkenazi' },
      chabad: leyning.chabad ? cite(leyning.chabad) : { sameAs: 'ashkenazi' },
    },
  };
}
// A reading with no aliyot, no maftir, and no haftarah carries nothing to
// show -- a handful of Hebcal-flagged calendar events (Erev Purim, Erev
// Tish'a B'Av) are like this and would otherwise render as a blank card.
function isEmpty(entry) {
  return entry.aliyot.length === 0 && !entry.maftir && !entry.nusach.ashkenazi;
}

const out = new Map();
for (const il of [false, true]) {
  const region = il ? 'israel' : 'diaspora';
  const events = HebrewCalendar.calendar({ start: new Date(2026, 0, 1), end: new Date(2034, 0, 1), il });
  for (const ev of events) {
    const f = ev.getFlags();
    if (f & 1024) continue; // parsha events handled elsewhere
    const rawDesc = ev.getDesc();
    if (SKIP.has(rawDesc)) continue;
    const desc = normalizeDesc(rawDesc);
    if (variesByShabbat(desc) && isShabbat(ev)) continue; // captured separately below, shared across the family
    const key = desc + '__' + (il ? 'IL' : 'DIASPORA');
    if (out.has(key)) continue;
    let leyning;
    try { leyning = getLeyningForHoliday(ev, il); } catch (e) { continue; }
    if (!leyning) continue;
    const entry = buildEntry(key, displayNameFor(leyning, desc), region, ev, leyning);
    if (isEmpty(entry)) continue;
    out.set(key, entry);
  }
}

// Shared Shabbat-shaped entries for the two families above. Scans a wider
// window since a specific month's/day's Shabbat coincidence can be rare,
// but the FAMILY as a whole (any of 9 Rosh Chodesh months, any of several
// Chol HaMoed days) lands on Shabbat almost every year.
const SHABBAT_FAMILIES = [
  { id: 'Shabbat Rosh Chodesh', test: (d) => ROSH_CHODESH_FAMILY.test(d) },
  { id: 'Pesach Shabbat Chol ha-Moed', test: (d) => /^Pesach [IVX]+ \(CH''M\)$/.test(d) },
  { id: 'Sukkot Shabbat Chol ha-Moed', test: (d) => /^Sukkot [IVX]+ \(CH''M\)$/.test(d) },
];
for (const il of [false, true]) {
  const region = il ? 'israel' : 'diaspora';
  const events = HebrewCalendar.calendar({ start: new Date(2026, 0, 1), end: new Date(2046, 0, 1), il });
  for (const family of SHABBAT_FAMILIES) {
    const key = family.id + '__' + (il ? 'IL' : 'DIASPORA');
    if (out.has(key)) continue;
    for (const ev of events) {
      if (ev.getFlags() & 1024) continue;
      if (!family.test(ev.getDesc()) || !isShabbat(ev)) continue;
      let leyning;
      try { leyning = getLeyningForHoliday(ev, il); } catch (e) { continue; }
      if (!leyning) continue;
      const entry = buildEntry(key, family.id, region, ev, leyning);
      if (isEmpty(entry)) continue;
      out.set(key, entry);
      break;
    }
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
