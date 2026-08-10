// For every parsha aliyah/maftir, finds every chag/fast/Rosh-Chodesh/
// special-Shabbat reading (chagim.json) whose verse range shares real text
// with it -- e.g. Pinchas's aliyot covering the festival musaf offerings
// (Numbers 28-29) also make up the Torah reading for Rosh Chodesh, Pesach,
// Sukkot Chol HaMoed, and more. This is a STATIC content fact (which verses
// share text with which), independent of any specific calendar date -- not
// to be confused with gen_calendar.mjs's specialReading, which is about
// what replaces what on one particular week.
//
// Verse-range comparison is done with exact interval math (via
// book-chapters.json's per-chapter verse counts), not string/date guessing.
import { readFileSync, writeFileSync } from 'fs';

const { books: chapterCounts } = JSON.parse(readFileSync('../data/book-chapters.json', 'utf8'));
const { parshiot } = JSON.parse(readFileSync('../data/parshiot.json', 'utf8'));
const { chagim } = JSON.parse(readFileSync('../data/chagim.json', 'utf8'));

// Flat sequential verse index within a book, e.g. Exodus 2:1 -> (Ex 1's
// verse count) + 1. Lets two ranges in the same book be compared as plain
// integers instead of juggling chapter boundaries by hand.
function verseIndex(book, ref) {
  const [ch, v] = ref.split(':').map(Number);
  const chapters = chapterCounts[book];
  let idx = 0;
  for (let c = 1; c < ch; c++) idx += chapters[String(c)] || 0;
  return idx + v;
}
function rangeOf(book, start, end) {
  return [verseIndex(book, start), verseIndex(book, end)];
}

// 'full' -- one range is entirely contained in the other (either
// direction); 'partial' -- they share verses but neither fully contains the
// other.
function overlapKind(book1, s1, e1, book2, s2, e2) {
  if (book1 !== book2) return null;
  const [a1, b1] = rangeOf(book1, s1, e1);
  const [a2, b2] = rangeOf(book2, s2, e2);
  if (b1 < a2 || b2 < a1) return null;
  if ((a2 >= a1 && b2 <= b1) || (a1 >= a2 && b1 <= b2)) return 'full';
  return 'partial';
}

// chagim.json items to compare against: every aliyah + maftir, carrying
// enough to both label the overlap and look it back up from the chag's own
// page (region-specific id).
const chagItems = [];
for (const c of chagim) {
  for (const a of (c.aliyot || [])) {
    chagItems.push({ chagId: c.id, name: c.name, aliyahKey: String(a.aliyah), book: a.book, start: a.start, end: a.end });
  }
  if (c.maftir) {
    chagItems.push({ chagId: c.id, name: c.name, aliyahKey: 'M', book: c.maftir.book, start: c.maftir.start, end: c.maftir.end });
  }
}

const byParshaAliyah = {};
const byChagAliyah = {};

for (const p of parshiot) {
  const parshaItems = [
    ...p.aliyot.map((a) => ({ aliyahKey: String(a.aliyah), book: a.book, start: a.start, end: a.end })),
    ...(p.maftir ? [{ aliyahKey: 'M', book: p.maftir.book, start: p.maftir.start, end: p.maftir.end }] : []),
  ];
  for (const pi of parshaItems) {
    // Dedup the forward (parsha-facing) list by chag NAME, not by exact
    // range -- a diaspora/israel pair of the same reading is identical text
    // (collapses trivially), but a single chag reading with several aliyot
    // (e.g. a Chanukah day that also carries Rosh Chodesh Tevet's 3 aliyot)
    // can genuinely overlap the SAME parsha aliyah in more than one
    // fragment. Those are real, distinct sub-ranges, but showing "Chanukah
    // Day 6 (full)" three times in a row is noise a reader doesn't need --
    // one entry per chag name, downgraded to 'partial' if its fragments
    // don't uniformly agree on 'full'.
    const byName = new Map(); // name -> { kind, book, start, end, refs: [{chagId, aliyahKey}] }
    for (const ci of chagItems) {
      const kind = overlapKind(pi.book, pi.start, pi.end, ci.book, ci.start, ci.end);
      if (!kind) continue;
      let existing = byName.get(ci.name);
      if (!existing) {
        existing = { kind, book: ci.book, start: ci.start, end: ci.end, refs: [] };
        byName.set(ci.name, existing);
      } else if (existing.kind !== kind) {
        existing.kind = 'partial';
      }
      // refs -- every (chagId, aliyahKey) this name's overlap is actually
      // sourced from, so the client can check "has this user already
      // logged ANY of these" without needing a name -> id lookup of its own.
      existing.refs.push({ chagId: ci.chagId, aliyahKey: ci.aliyahKey });
      // Reverse (chag-facing) map keeps every region-specific chagId, since
      // a chag's own detail page is looked up by its exact id.
      const key = `${ci.chagId}:${ci.aliyahKey}`;
      byChagAliyah[key] ??= [];
      byChagAliyah[key].push({ parshaId: p.id, aliyahKey: pi.aliyahKey, kind, book: pi.book, start: pi.start, end: pi.end });
    }
    if (byName.size) {
      byParshaAliyah[`${p.id}:${pi.aliyahKey}`] = [...byName.entries()].map(([name, v]) => ({ name, ...v }));
    }
  }
}

// Collapse the Rosh Chodesh family (12 individual months + the shared
// Shabbat-Rosh-Chodesh entry) into one line wherever ALL of them show up
// together -- they always do, in any aliyah whose range covers the shared
// Numbers 28:9-15 musaf text, since every month's Rosh Chodesh reading is
// that exact same passage. Without this, an aliyah like Pinchas 5 would
// list "Rosh Chodesh Nisan / Iyyar / Sivan / ... " as 13 near-identical
// entries instead of one meaningful line.
const ROSH_CHODESH_FAMILY = new Set([
  'Rosh Chodesh Nisan', 'Rosh Chodesh Iyyar', 'Rosh Chodesh Sivan', 'Rosh Chodesh Tamuz',
  'Rosh Chodesh Av', 'Rosh Chodesh Elul', 'Rosh Chodesh Cheshvan', 'Rosh Chodesh Kislev',
  "Rosh Chodesh Sh'vat", 'Rosh Chodesh Adar', 'Rosh Chodesh Adar I', 'Rosh Chodesh Adar II',
  'Shabbat Rosh Chodesh',
]);
for (const key of Object.keys(byParshaAliyah)) {
  const list = byParshaAliyah[key];
  const family = list.filter((o) => ROSH_CHODESH_FAMILY.has(o.name));
  if (family.length < 2) continue; // only collapse when the family actually shows up together
  const rest = list.filter((o) => !ROSH_CHODESH_FAMILY.has(o.name));
  const kind = family.every((o) => o.kind === 'full') ? 'full' : 'partial';
  const first = family[0];
  const refs = family.flatMap((o) => o.refs);
  byParshaAliyah[key] = [{ name: 'Rosh Chodesh (every month)', kind, book: first.book, start: first.start, end: first.end, refs }, ...rest];
}

const parshaAliyahCount = Object.keys(byParshaAliyah).length;
const chagAliyahCount = Object.keys(byChagAliyah).length;

writeFileSync('../data/reading-overlaps.json', JSON.stringify({
  description: "Which aliyot/maftirim share real verse text with a chag/fast/Rosh-Chodesh/special-Shabbat reading, independent of any specific calendar date (contrast with a calendar row's specialReading in calendar-100y/, which is about what actually gets substituted on one particular week). 'kind' is 'full' when one range is entirely contained in the other (either direction) or 'partial' when they merely share some verses. byParshaAliyah is keyed '<parshaId>:<aliyahKey>' (aliyahKey is a number or 'M'), each entry a deduplicated-by-name list of {name, kind, book, start, end, refs} -- diaspora/israel copies of the same chag reading collapse to one entry since the text is identical, and the 12 individual Rosh Chodesh months + Shabbat Rosh Chodesh collapse to one 'Rosh Chodesh (every month)' entry when they all show up together (they always do, since every month reads the identical Numbers 28:9-15 musaf text). 'refs' is every (chagId, aliyahKey) pair the display name was actually sourced from -- e.g. both diaspora and israel copies, or (for the Rosh Chodesh collapse) all 26 region x month combinations -- so a client checking 'has this user already logged this via a chag' can match against their leining_log rows directly without needing its own name -> id lookup. byChagAliyah is keyed '<chagId>:<aliyahKey>' (region-specific, since a chag's own page is looked up by its exact id, and NOT Rosh-Chodesh-collapsed), each entry {parshaId, aliyahKey, kind, book, start, end} -- already precise enough to match a leining_log row directly, no refs needed. Computed with exact verse-index interval math (book-chapters.json), not string matching.",
  generatedAt: new Date().toISOString(),
  parshaAliyahCount,
  chagAliyahCount,
  byParshaAliyah,
  byChagAliyah,
}, null, 2));

console.log('Wrote reading-overlaps.json:', parshaAliyahCount, 'parsha aliyah/maftir entries with overlaps,', chagAliyahCount, 'chag aliyah/maftir entries with overlaps');
