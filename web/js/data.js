import { pad, todayISO } from './util.js';

const cache = new Map();

async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
    return r.json();
  });
  cache.set(path, promise);
  return promise;
}

const DATA = '/data/';

export async function getParshiot() {
  const d = await loadJSON(DATA + 'parshiot.json');
  return d.parshiot;
}

export async function getCombinedParshiot() {
  const d = await loadJSON(DATA + 'parshiot-combined.json');
  return d.combinedParshiot;
}

export async function getHaftarot() {
  const d = await loadJSON(DATA + 'haftarot.json');
  return d.haftarot;
}

export async function getChagim() {
  const d = await loadJSON(DATA + 'chagim.json');
  return d.chagim;
}

export async function getMegillot() {
  const d = await loadJSON(DATA + 'megillot.json');
  return d.megillot;
}

export async function getDifficulty() {
  const d = await loadJSON(DATA + 'difficulty-scores.json');
  return d.parshiot;
}

export async function getCalendarIndex() {
  return loadJSON(DATA + 'calendar-100y/index.json');
}

function decadeFileForYear(year, files) {
  return files.find((f) => year >= f.yearRange[0] && year <= f.yearRange[1]);
}

async function getDecadeRows(year) {
  const idx = await getCalendarIndex();
  const file = decadeFileForYear(year, idx.files) || idx.files[idx.files.length - 1];
  const d = await loadJSON(DATA + 'calendar-100y/' + file.file);
  return d.rows;
}

// ---------- lookup indexes (built lazily, cached) ----------
let parshaIndex = null;
async function getParshaIndex() {
  if (parshaIndex) return parshaIndex;
  const [individual, combined, haftarot, difficulty] = await Promise.all([
    getParshiot(), getCombinedParshiot(), getHaftarot(), getDifficulty(),
  ]);
  const byId = new Map();
  for (const p of individual) byId.set(p.id, { ...p, combinedEntry: false });
  for (const p of combined) byId.set(p.id, { ...p, combinedEntry: true });
  const haftarahById = new Map(haftarot.map((h) => [h.id, h]));
  const difficultyById = new Map(difficulty.map((d) => [d.parshaId, d]));
  parshaIndex = { byId, haftarahById, difficultyById, individualIds: individual.map((p) => p.id) };
  return parshaIndex;
}

// Full detail bundle for a given parsha id (individual or combined). Combined
// (double) parshiot are scored directly against their own combined-reading
// aliyah divisions in difficulty-scores.json -- not averaged from components.
export async function getParshaDetail(id) {
  const idx = await getParshaIndex();
  const parsha = idx.byId.get(id);
  if (!parsha) return null;
  const haftarah = idx.haftarahById.get(id) || null;
  const difficulty = idx.difficultyById.get(id) || null;
  return { parsha, haftarah, difficulty };
}

export async function listAllParshiotForSearch() {
  const idx = await getParshaIndex();
  return [...idx.byId.values()];
}

export async function listScoredParshiot() {
  return getDifficulty(); // the 54 individual, already sorted hardest -> easiest
}

// Find the next calendar row of type 'parsha' on/after fromISO, for a region.
export async function findUpcomingParsha(region = 'diaspora', fromISO = todayISO()) {
  const [y] = fromISO.split('-').map(Number);
  let rows = await getDecadeRows(y);
  let candidates = rows.filter((r) => r.type === 'parsha' && r.region === region && r.date >= fromISO);
  if (candidates.length === 0) {
    rows = await getDecadeRows(y + 1);
    candidates = rows.filter((r) => r.type === 'parsha' && r.region === region && r.date >= fromISO);
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0] || null;
}

// All rows (parsha and/or holiday) that fall exactly on a given date + region.
export async function findByDate(dateISO, region = 'diaspora') {
  const [y] = dateISO.split('-').map(Number);
  const rows = await getDecadeRows(y);
  return rows.filter((r) => r.date === dateISO && r.region === region);
}

// Next N calendar occurrences of a given parshaId, for a region, from a date.
export async function findUpcomingOccurrences(parshaId, region = 'diaspora', fromISO = todayISO(), count = 3) {
  const [y] = fromISO.split('-').map(Number);
  const found = [];
  let year = y;
  let safety = 0;
  while (found.length < count && safety < 12) {
    const rows = await getDecadeRows(year);
    const matches = rows.filter((r) => r.type === 'parsha' && r.region === region && r.parshaId === parshaId && r.date >= fromISO);
    found.push(...matches);
    year += 10;
    safety++;
  }
  found.sort((a, b) => a.date.localeCompare(b.date));
  return found.slice(0, count);
}

export async function getChagById(chagId) {
  const chagim = await getChagim();
  return chagim.find((c) => c.id === chagId) || null;
}
