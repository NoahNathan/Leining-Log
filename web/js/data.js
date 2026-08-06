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

const DATA = '../data/';

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

export async function getChagDifficulty() {
  const d = await loadJSON(DATA + 'difficulty-scores.json');
  return d.chagim;
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

let chagDifficultyIndex = null;
async function getChagDifficultyIndex() {
  if (chagDifficultyIndex) return chagDifficultyIndex;
  const difficulty = await getChagDifficulty();
  chagDifficultyIndex = new Map(difficulty.map((d) => [d.chagId, d]));
  return chagDifficultyIndex;
}

export async function getChagById(chagId) {
  const [chagim, diffIdx] = await Promise.all([getChagim(), getChagDifficultyIndex()]);
  const chag = chagim.find((c) => c.id === chagId) || null;
  if (!chag) return null;
  const difficulty = diffIdx.get(chagId) || null;
  return { ...chag, difficulty };
}

// ---------- leining-log progress ("% of Torah learned") ----------
// Computed entirely client-side from real per-aliyah verse counts already
// in parshiot.json -- the DB only needs to store which (parsha, aliyah)
// pairs a user has logged, not any verse-count math.
export async function computeTorahProgress(logEntries) {
  const parshiot = await getParshiot();
  const byId = new Map(parshiot.map((p) => [p.id, p]));
  const totalVerses = parshiot.reduce((s, p) => s + p.totalVerses, 0);
  const books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];
  const byBook = Object.fromEntries(books.map((b) => [b, { learned: 0, total: 0 }]));
  for (const p of parshiot) byBook[p.book].total += p.totalVerses;

  // Whole-parsha entries subsume any specific-aliyah entries for that same
  // parsha (no double counting); otherwise sum the distinct aliyot logged.
  const wholeParshaIds = new Set(logEntries.filter((e) => e.aliyah_key === 'ALL').map((e) => e.parsha_id));
  const loggedAliyot = new Map(); // parshaId -> Set of aliyah_key
  for (const e of logEntries) {
    if (e.aliyah_key === 'ALL' || wholeParshaIds.has(e.parsha_id)) continue;
    if (!loggedAliyot.has(e.parsha_id)) loggedAliyot.set(e.parsha_id, new Set());
    loggedAliyot.get(e.parsha_id).add(e.aliyah_key);
  }

  let learnedVerses = 0;
  for (const parshaId of wholeParshaIds) {
    const p = byId.get(parshaId);
    if (!p) continue;
    learnedVerses += p.totalVerses;
    byBook[p.book].learned += p.totalVerses;
  }
  for (const [parshaId, keys] of loggedAliyot) {
    const p = byId.get(parshaId);
    if (!p) continue;
    for (const key of keys) {
      const a = p.aliyot.find((a) => String(a.aliyah) === key);
      if (!a) continue;
      learnedVerses += a.verses;
      byBook[p.book].learned += a.verses;
    }
  }

  return {
    learnedVerses,
    totalVerses,
    percent: totalVerses ? Math.round((learnedVerses / totalVerses) * 1000) / 10 : 0,
    byBook,
  };
}

let supabasePromise = null;
async function sb() {
  if (!supabasePromise) supabasePromise = import('./supabaseClient.js').then((m) => m.getSupabase());
  return supabasePromise;
}

export async function getMyProfile(userId) {
  const client = await sb();
  if (!client) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setBarMitzvahParsha(userId, parshaId) {
  const client = await sb();
  if (!client) return;
  const { error } = await client.from('profiles').update({ bar_mitzvah_parsha_id: parshaId }).eq('id', userId);
  if (error) throw error;
}

export async function getMyLeiningLog(userId) {
  const client = await sb();
  if (!client) return [];
  const { data, error } = await client
    .from('leining_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// aliyahKey: 'ALL' (the default) logs the whole parsha; otherwise '1'..'7'/'M'.
export async function addLeiningLogEntry(userId, { parshaId, aliyahKey = 'ALL', yearHebrew = null, yearGregorian = null, isBarMitzvah = false }) {
  const client = await sb();
  if (!client) throw new Error('Supabase is not configured yet.');
  const { error } = await client.from('leining_log').upsert({
    user_id: userId,
    parsha_id: parshaId,
    aliyah_key: aliyahKey,
    year_hebrew: yearHebrew,
    year_gregorian: yearGregorian,
    is_bar_mitzvah: isBarMitzvah,
  }, { onConflict: 'user_id,parsha_id,aliyah_key' });
  if (error) throw error;
}

export async function removeLeiningLogEntry(id) {
  const client = await sb();
  if (!client) return;
  const { error } = await client.from('leining_log').delete().eq('id', id);
  if (error) throw error;
}
