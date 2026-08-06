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
  if (entry.start === entry.end) return `${entry.book} ${entry.start}`;
  return `${entry.book} ${entry.start}-${entry.end}`;
}

export function displayParshaName(id) {
  return id.replace(/-/g, ' – ');
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
