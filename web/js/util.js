export function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function citeRange(entry) {
  if (!entry) return '';
  // some haftarot are two non-adjacent excerpts, represented as an array
  if (Array.isArray(entry)) return entry.map(citeRange).join(', ');
  if (entry.start === entry.end) return `${entry.book} ${entry.start}`;
  return `${entry.book} ${entry.start}-${entry.end}`;
}

export function displayParshaName(id) {
  return id.replace(/-/g, ' – ');
}

// A Hebrew year runs Rosh Hashanah (~September) to the next Rosh Hashanah,
// so a bare Gregorian year alone doesn't map to a single Hebrew year -- it
// splits into two: Jan through Rosh Hashanah is the OLDER Hebrew year, and
// Rosh Hashanah through Dec is the next one. When the month is known, this
// asks the browser's own ICU Hebrew calendar (Intl) for the exact answer,
// splitting at the real Rosh Hashanah date rather than a fixed month --
// e.g. Dec 2025 correctly comes back 5786, not 5785. The 15th of the month
// is used as a stand-in day (harmless for every month except September,
// where Rosh Hashanah's exact date can occasionally still fall on the
// other side of the 15th). When no month is given, this defaults to a
// mid-year proxy (June), which is always safely before Rosh Hashanah --
// i.e. the same "most of this Gregorian year" guess as before.
export function gregorianToHebrewYear(gregorianYear, gregorianMonth) {
  const month = gregorianMonth || 6;
  const dt = new Date(Date.UTC(gregorianYear, month - 1, 15));
  const parts = new Intl.DateTimeFormat('en-US-u-ca-hebrew', { year: 'numeric', timeZone: 'UTC' }).formatToParts(dt);
  return Number(parts.find((p) => p.type === 'year').value);
}
// Approximate only -- a Hebrew year spans two Gregorian years, and there's
// no month to disambiguate on this side (a bare Hebrew year, as typed).
export function hebrewToGregorianYear(hebrewYear) {
  return hebrewYear - 3760;
}

// score 0-10 -> a color on a green(easy) -> amber -> red(hard) scale
export function scoreColor(score) {
  const t = Math.max(0, Math.min(10, score)) / 10;
  // hsl hue from 140 (green) to 0 (red)
  const hue = 140 - t * 140;
  return `hsl(${hue}, 62%, 42%)`;
}

export function scoreColorBg(score) {
  const t = Math.max(0, Math.min(10, score)) / 10;
  const hue = 140 - t * 140;
  return `hsl(${hue}, 62%, 94%)`;
}

export function scoreLabel(score) {
  if (score <= 3) return 'Easy';
  if (score <= 5) return 'Moderate';
  if (score <= 7) return 'Challenging';
  return 'Hard';
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}
