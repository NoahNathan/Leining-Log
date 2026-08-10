// Verse count per chapter for the 5 Torah books, sourced directly from
// @shafeh/tanach rather than hand-typed. Exists so the client can do exact
// verse-range interval math (e.g. "does this maftir's range fully overlap
// that parsha aliyah's range") without needing the Hebrew text itself --
// see gen_reading_overlaps.mjs, which is the first consumer.
import { getChapter } from '@shafeh/tanach';
import { writeFileSync } from 'fs';

const BOOK_EN_TO_HE = {
  Genesis: 'Bereishit',
  Exodus: 'Shemot',
  Leviticus: 'Vayikra',
  Numbers: 'Bamidbar',
  Deuteronomy: 'Devarim',
};

const books = {};
for (const [bookEn, bookHe] of Object.entries(BOOK_EN_TO_HE)) {
  const chapters = {};
  let ch = 1;
  while (true) {
    const chapter = getChapter(bookHe, ch);
    if (!chapter || chapter.length === 0) break;
    chapters[ch] = chapter.length;
    ch++;
  }
  books[bookEn] = chapters;
}

writeFileSync('../data/book-chapters.json', JSON.stringify({
  description: "Verse count per chapter for the 5 Torah books (e.g. books.Genesis['1'] === 31), sourced from @shafeh/tanach. Lets the client convert a 'C:V' reference into a flat sequential verse index within its book, for exact interval math (overlap/containment between two verse ranges) without needing the Hebrew text itself. See gen_reading_overlaps.mjs / util.js's verseIndex().",
  source: "@shafeh/tanach",
  generatedAt: new Date().toISOString(),
  books,
}, null, 2));

console.log('Wrote book-chapters.json:', Object.fromEntries(Object.entries(books).map(([b, chs]) => [b, Object.keys(chs).length + ' chapters'])));
