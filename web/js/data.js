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

// One-line "what happens here" summaries, keyed by verse range so a passage
// shared between a parsha, its double form, a maftir and a chag resolves to
// the same entry. Coverage is partial; missing entries simply render nothing.
export async function getAliyahSummaries() {
  const d = await loadJSON(DATA + 'aliyah-summaries.json');
  return d.summaries || {};
}

// Haftarah difficulty, ashkenazi only for now. On the same 1-10 scale as
// every Torah reading, then weighted down 30% -- see difficulty-rubric.md
// for why a haftarah is categorically easier than the equivalent Torah
// reading.
export async function getHaftarahScores() {
  const d = await loadJSON(DATA + 'difficulty-scores.json');
  return d.haftarot || [];
}

// Which haftarah is longest/shortest (by word count) within each nusach
// tradition -- ashkenazi, sefardi, chabad. Length-only, not a difficulty
// measurement (sefardi/chabad aren't otherwise scored). Keyed by nusach,
// each value a { longest: [haftarahId, ...], shortest: [...] } pair (arrays
// since ties share the record).
export async function getHaftarahLengthRecords() {
  const d = await loadJSON(DATA + 'haftarah-lengths.json');
  return d.records || {};
}

// Which aliyot/maftirim share real verse text with a chag/fast/Rosh-
// Chodesh/special-Shabbat reading -- a static content fact (see
// gen_reading_overlaps.mjs), independent of any specific calendar date.
export async function getReadingOverlaps() {
  return loadJSON(DATA + 'reading-overlaps.json');
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
  const haftarahScoreById = new Map((await getHaftarahScores()).map((h) => [h.haftarahId, h]));
  parshaIndex = { byId, haftarahById, difficultyById, haftarahScoreById, individualIds: individual.map((p) => p.id) };
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
  const haftarahScore = idx.haftarahScoreById.get(id) || null;
  const summaries = await getAliyahSummaries();
  const haftarahLengthRecords = await getHaftarahLengthRecords();
  const allOverlaps = await getReadingOverlaps();
  // Combined (double) parshiot aren't in reading-overlaps.json (see
  // gen_reading_overlaps.mjs) -- overlapsByAliyah is simply empty for them.
  const overlapsByAliyah = {};
  for (const key of ['1', '2', '3', '4', '5', '6', '7', 'M']) {
    const hit = allOverlaps.byParshaAliyah[`${id}:${key}`];
    if (hit) overlapsByAliyah[key] = hit;
  }
  return { parsha, haftarah, difficulty, haftarahScore, summaries, haftarahLengthRecords, overlapsByAliyah };
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

// Next N calendar 'parsha' occurrences (any parsha, chronological), for a
// region, from a date -- e.g. "the next 20 weeks" for a gabbai to schedule
// against, as opposed to findUpcomingOccurrences' single-parsha lookup.
export async function listUpcomingParshiot(region = 'diaspora', fromISO = todayISO(), count = 20) {
  const [y] = fromISO.split('-').map(Number);
  const found = [];
  let year = y;
  let safety = 0;
  while (found.length < count && safety < 12) {
    const rows = await getDecadeRows(year);
    const matches = rows.filter((r) => r.type === 'parsha' && r.region === region && r.date >= fromISO);
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

// Special-Shabbat/chag haftarah difficulty, ashkenazi only -- a subset of
// getHaftarahScores() carrying a chagId (see gen_haftarah_stats.mjs). Not
// every chag has one: Shabbat Shuva's several real compositions and the
// haftarah-only labels with no chagim.json entry at all aren't scored.
let chagHaftarahScoreIndex = null;
async function getChagHaftarahScoreIndex() {
  if (chagHaftarahScoreIndex) return chagHaftarahScoreIndex;
  const scores = await getHaftarahScores();
  chagHaftarahScoreIndex = new Map(scores.filter((h) => h.chagId).map((h) => [h.chagId, h]));
  return chagHaftarahScoreIndex;
}

export async function getChagById(chagId) {
  const [chagim, diffIdx, haftIdx, allOverlaps] = await Promise.all([
    getChagim(), getChagDifficultyIndex(), getChagHaftarahScoreIndex(), getReadingOverlaps(),
  ]);
  const chag = chagim.find((c) => c.id === chagId) || null;
  if (!chag) return null;
  const difficulty = diffIdx.get(chagId) || null;
  const haftarahScore = haftIdx.get(chagId) || null;
  const overlapsByAliyah = {};
  for (const key of [...(chag.aliyot || []).map((a) => String(a.aliyah)), ...(chag.maftir ? ['M'] : [])]) {
    const hit = allOverlaps.byChagAliyah[`${chagId}:${key}`];
    if (hit) overlapsByAliyah[key] = hit;
  }
  return { ...chag, difficulty, haftarahScore, overlapsByAliyah };
}

// Verse count per chapter for the 5 Torah books (see gen_book_chapters.mjs),
// used to convert a 'C:V' reference into a flat sequential verse index for
// exact interval math -- see computeTorahProgress below.
export async function getBookChapters() {
  const d = await loadJSON(DATA + 'book-chapters.json');
  return d.books;
}
function verseIndex(chapters, ref) {
  const [ch, v] = ref.split(':').map(Number);
  let idx = 0;
  for (let c = 1; c < ch; c++) idx += chapters[String(c)] || 0;
  return idx + v;
}
// Sorts and merges overlapping/adjacent [start, end] verse-index ranges so
// a verse counted via two different paths (e.g. a parsha's own aliyah AND
// an overlapping chag reading -- Pinchas's aliyah 5 and every Rosh Chodesh
// reading are the literal same Numbers 28:1-15) is only ever counted once.
function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

// ---------- leining-log progress ("% of Torah learned") ----------
// Computed entirely client-side from real per-aliyah verse ranges already in
// parshiot.json/chagim.json -- the DB only needs to store which (reading,
// aliyah) pairs a user has logged, not any verse-count math.
//
// A chag/fast/Rosh-Chodesh reading's Torah content (its 'aliyot'/'maftir' --
// never its haftarah, which is Nevi'im, not Torah) counts toward "% of Torah
// learned" exactly like a parsha aliyah does, since it genuinely is Torah
// text someone read. The two paths can reach the SAME verses though (see
// gen_reading_overlaps.mjs) -- logging both this parsha's own aliyah 7 on
// one week AND a Rosh Chodesh reading covering the same Numbers 28:9-15 on
// another must not count those verses twice. Verse-interval union math
// (mergeIntervals, above) is what makes that exact rather than a guess.
export async function computeTorahProgress(logEntries) {
  const [parshiot, chagim, bookChapters] = await Promise.all([getParshiot(), getChagim(), getBookChapters()]);
  const byId = new Map(parshiot.map((p) => [p.id, p]));
  const chagById = new Map(chagim.map((c) => [c.id, c]));
  const totalVerses = parshiot.reduce((s, p) => s + p.totalVerses, 0);
  const books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];
  const byBook = Object.fromEntries(books.map((b) => [b, { learned: 0, total: 0, intervals: [] }]));
  for (const p of parshiot) byBook[p.book].total += p.totalVerses;

  function addRange(book, start, end) {
    const chapters = bookChapters[book];
    if (!chapters) return; // a haftarah's book -- never Torah content, never counted
    byBook[book].intervals.push([verseIndex(chapters, start), verseIndex(chapters, end)]);
  }

  // Whole-reading entries subsume any specific-aliyah entries for that same
  // reading (no double counting); otherwise sum the distinct aliyot logged.
  const wholeParshaIds = new Set(logEntries.filter((e) => e.aliyah_key === 'ALL' && byId.has(e.parsha_id)).map((e) => e.parsha_id));
  const wholeChagIds = new Set(logEntries.filter((e) => e.aliyah_key === 'ALL' && chagById.has(e.parsha_id)).map((e) => e.parsha_id));

  for (const parshaId of wholeParshaIds) {
    for (const a of byId.get(parshaId).aliyot) addRange(a.book, a.start, a.end);
  }
  for (const chagId of wholeChagIds) {
    const c = chagById.get(chagId);
    for (const a of (c.aliyot || [])) addRange(a.book, a.start, a.end);
    if (c.maftir) addRange(c.maftir.book, c.maftir.start, c.maftir.end);
  }
  for (const e of logEntries) {
    if (e.aliyah_key === 'ALL') continue;
    const p = byId.get(e.parsha_id);
    if (p) {
      if (wholeParshaIds.has(e.parsha_id)) continue;
      const a = p.aliyot.find((a) => String(a.aliyah) === e.aliyah_key);
      if (a) addRange(a.book, a.start, a.end);
      continue;
    }
    const c = chagById.get(e.parsha_id);
    if (!c || wholeChagIds.has(e.parsha_id)) continue;
    if (e.aliyah_key === 'M') {
      if (c.maftir) addRange(c.maftir.book, c.maftir.start, c.maftir.end);
    } else {
      const a = (c.aliyot || []).find((a) => String(a.aliyah) === e.aliyah_key);
      if (a) addRange(a.book, a.start, a.end);
    }
  }

  let learnedVerses = 0;
  for (const book of books) {
    const count = mergeIntervals(byBook[book].intervals).reduce((s, [a, b]) => s + (b - a + 1), 0);
    byBook[book].learned = count;
    delete byBook[book].intervals;
    learnedVerses += count;
  }

  return {
    learnedVerses,
    totalVerses,
    percent: totalVerses ? Math.round((learnedVerses / totalVerses) * 1000) / 10 : 0,
    byBook,
  };
}

// ---------- gabbai-mode: minyan-wide coverage grid ----------
// Same "whole-parsha entry subsumes specific aliyot" logic as
// computeTorahProgress, but as a union across every row regardless of
// which member logged it -- "has ANYONE in the group ever read this
// aliyah," not a per-leiner breakdown. Feeds the gabbai's coverage-gaps
// heatmap.
export async function computeMinyanCoverage(allMemberLogRows) {
  const parshiot = await getParshiot();
  const wholeParshaIds = new Set(allMemberLogRows.filter((e) => e.aliyah_key === 'ALL').map((e) => e.parsha_id));
  const loggedAliyot = new Map(); // parshaId -> Set of aliyah_key
  for (const e of allMemberLogRows) {
    if (e.aliyah_key === 'ALL' || wholeParshaIds.has(e.parsha_id)) continue;
    if (!loggedAliyot.has(e.parsha_id)) loggedAliyot.set(e.parsha_id, new Set());
    loggedAliyot.get(e.parsha_id).add(e.aliyah_key);
  }

  return parshiot.map((p) => {
    const isWhole = wholeParshaIds.has(p.id);
    const keys = loggedAliyot.get(p.id);
    const aliyot = p.aliyot.map((a) => ({
      aliyah: a.aliyah,
      covered: isWhole || (keys ? keys.has(String(a.aliyah)) : false),
    }));
    // On a regular Shabbat, maftir is just the tail of aliyah 7 (shevii)
    // read again as a separate honor -- every parsha's maftir range is a
    // strict subset of its aliyah 7 range. Reading shevii means those
    // verses have been read, so maftir counts as covered whenever shevii
    // is, without needing its own explicit log entry -- it can still turn
    // covered independently from an explicit 'M' log (e.g. someone given
    // only the maftir honor). This only covers the "regular" maftir text;
    // special-occasion maftir (Rosh Chodesh, festivals, Chanukah, etc.) is
    // calendar-dependent, not part of this per-parsha data at all.
    const shevii = aliyot[aliyot.length - 1];
    const maftirCovered = p.maftir ? (isWhole || (shevii && shevii.covered) || (keys ? keys.has('M') : false)) : null;
    const coveredCount = aliyot.filter((a) => a.covered).length + (maftirCovered ? 1 : 0);
    const totalCount = aliyot.length + (p.maftir ? 1 : 0);
    return {
      parshaId: p.id,
      englishName: p.englishName,
      book: p.book,
      parshaNum: p.parshaNum,
      aliyot,
      hasMaftir: !!p.maftir,
      maftirCovered,
      coveredCount,
      totalCount,
    };
  }).sort((a, b) => (Array.isArray(a.parshaNum) ? a.parshaNum[0] : a.parshaNum) - (Array.isArray(b.parshaNum) ? b.parshaNum[0] : b.parshaNum));
}

let supabasePromise = null;
async function sb() {
  if (!supabasePromise) supabasePromise = import('./supabaseClient.js').then((m) => m.getSupabase());
  return supabasePromise;
}

// A user can only have one bar mitzvah parsha -- clear any previously
// flagged log entry before the caller upserts the new one as is_bar_mitzvah.
export async function clearBarMitzvahFlag(userId) {
  const client = await sb();
  if (!client) return;
  const { error } = await client.from('leining_log').update({ is_bar_mitzvah: false }).eq('user_id', userId).eq('is_bar_mitzvah', true);
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
// Returns the row's id, so callers (e.g. quick-log toggles) can remove it later.
export async function addLeiningLogEntry(userId, { parshaId, aliyahKey = 'ALL', yearHebrew = null, yearGregorian = null, isBarMitzvah = false }) {
  const client = await sb();
  if (!client) throw new Error('Supabase is not configured yet.');
  const { data, error } = await client.from('leining_log').upsert({
    user_id: userId,
    parsha_id: parshaId,
    aliyah_key: aliyahKey,
    year_hebrew: yearHebrew,
    year_gregorian: yearGregorian,
    is_bar_mitzvah: isBarMitzvah,
  }, { onConflict: 'user_id,parsha_id,aliyah_key' }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function removeLeiningLogEntry(id) {
  const client = await sb();
  if (!client) return;
  const { error } = await client.from('leining_log').delete().eq('id', id);
  if (error) throw error;
}

// ---------- davening-leadership log ----------
// A deliberately tiny cousin of leining_log, for the small set of
// Shabbat/chag davening roles a gabbai actually needs a roster for --
// see db/schema.sql's davening_log table. No verse ranges, no difficulty
// scoring, just "have I ever led this."
export const DAVENING_ROLES = [
  { key: 'friday_night', label: 'Friday Night (Kabbalat Shabbat / Maariv)' },
  { key: 'pesukei_dzimrah', label: 'Shabbat Pesukei D’Zimrah' },
  { key: 'shabbat_shacharit', label: 'Shabbat Shacharit' },
  { key: 'shabbat_musaf', label: 'Shabbat Musaf' },
  { key: 'shabbat_rosh_chodesh_musaf', label: 'Shabbat Rosh Chodesh Musaf' },
  { key: 'chagim', label: 'Chagim' },
  { key: 'rosh_hashana', label: 'Rosh Hashana' },
  { key: 'yom_kippur', label: 'Yom Kippur' },
];

export async function getMyDaveningLog(userId) {
  const client = await sb();
  if (!client) return [];
  const { data, error } = await client.from('davening_log').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function addDaveningLogEntry(userId, role) {
  const client = await sb();
  if (!client) throw new Error('Supabase is not configured yet.');
  const { data, error } = await client
    .from('davening_log')
    .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function removeDaveningLogEntry(id) {
  const client = await sb();
  if (!client) return;
  const { error } = await client.from('davening_log').delete().eq('id', id);
  if (error) throw error;
}

// "Who can lead X" -- a gabbai roster grouped by role, from the shared
// davening_log rows RLS already scoped to accepted members (see
// getSharedDaveningLogForMinyan in gabbai.js). memberNameById maps
// user_id -> a display label (email or name), since davening_log itself
// only ever stores user_id.
export function computeDavenersByRole(daveningLogRows, memberNameById) {
  const byRole = Object.fromEntries(DAVENING_ROLES.map((r) => [r.key, []]));
  for (const row of daveningLogRows) {
    if (!byRole[row.role]) continue;
    byRole[row.role].push(memberNameById.get(row.user_id) || row.user_id);
  }
  return byRole;
}
