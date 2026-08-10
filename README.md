# Leining-Log

Gabbai App or Log of Leining

This repo holds the **seed data** (a structured, regenerable dataset of
every Torah/haftarah reading, its length, its difficulty, and its date for
the next 100 years) plus a **first web app** on top of it -- a static
site to look up any date or parsha and browse difficulty ratings. There's
no server/DB/auth yet, so no user accounts, assignments, or scheduling --
just lookup and comparison.

## Running the app

```
npm run dev
```

Then open <http://localhost:8080> (redirects to `/web/`). It's a zero-build
static site (vanilla JS + CSS, no framework, no bundler) that reads
straight from the sibling `/data` directory via `fetch` using relative
paths, served locally by the small dependency-free server in `serve.mjs`.

The same relative-path layout is deployed live via GitHub Pages (see
`.github/workflows/deploy-pages.yml`) -- pushes to `main` publish the app
at `https://<owner>.github.io/Leining-Log/`.

- **This Week** -- defaults to the upcoming Shabbat's parsha (Diaspora or
  Israel), with the full aliyah breakdown, difficulty ratings, special-trope
  notes, and haftarah by nusach.
- **Search** -- look up any calendar date (parsha or chag) or jump straight
  to a parsha by name.
- **Compare** -- sortable difficulty table across all 54 parshiot, plus a
  side-by-side two-parsha comparison.

## What's in `/data`

| File | What it is |
|---|---|
| `parshiot.json` | The 54 individual parshiot. For each: all 7 aliyot + maftir with exact verse ranges and verse counts, totals, longest/shortest aliyah, the weekday (Mon/Thu) reading, and hand-curated `specialTrope` notes where they apply (Az Yashir, Aseret HaDibrot, etc.). |
| `parshiot-combined.json` | The 7 pairs of parshiot that are sometimes read combined (Vayakhel-Pekudei, Tazria-Metzora, Achrei Mot-Kedoshim, Behar-Bechukotai, Chukat-Balak, Matot-Masei, Nitzavim-Vayeilech), with the aliyah division actually used when combined. |
| `haftarot.json` | The haftarah for every parsha (incl. combined pairs), split by nusach: **ashkenazi** (default), **sefardi**, and **chabad**, wherever those traditions differ. See "Nusach coverage" below for what's *not* here yet. |
| `chagim.json` | Torah + maftir + haftarah readings for every Yom Tov day, fast day, Rosh Chodesh, and special Shabbat (Shekalim/Zachor/Parah/HaChodesh/Shuva/etc.), for both `diaspora` and `israel`, with nusach splits and `specialTrope` notes. |
| `megillot.json` | The Five Megillot (Shir HaShirim, Rut, Eicha, Kohelet, Esther) and when/how each is customarily read. Hand-authored, not from the Hebcal data. |
| `difficulty-rubric.md` | The methodology behind the difficulty scores -- read this before trusting `difficulty-scores.json` at face value. |
| `word-difficulty.json` | Per-aliyah vocabulary statistics computed directly from the Masoretic Torah text: word rarity (how often each word occurs elsewhere in the Torah) and pronunciation complexity, plus example rare/hard words per aliyah. Covers parshiot, combined parshiot, AND chagim. Feeds into `difficulty-scores.json`'s vocabulary criterion. |
| `difficulty-scores.json` | Every aliyah of every parsha -- **including the 7 combined/double parshiot**, scored directly against their own combined-reading aliyot, not averaged -- scored 0-10 on length, vocabulary, trope, repetition, and hidden challenges, plus a length-weighted final score. A separate `chagim` array scores every chag/fast/Rosh Chodesh/special-Shabbat reading the same way. |
| `calendar-100y/` | Every Shabbat parsha reading and every chag/fast/Rosh Chodesh reading, 2026-2126, for both regions -- ~21,800 rows split into 10 decade files plus an `index.json`. Rows reference the files above by id rather than duplicating aliyah data. |

## Where the data comes from

The Torah-reading structure (aliyah divisions, verse counts, haftarah
citations, and the 100-year calendar itself) is **not hand-typed or
scraped** -- it's generated locally by running the official
[Hebcal](https://github.com/hebcal) libraries (`@hebcal/core` and
`@hebcal/leyning`), which encode the standard Masoretic aliyah divisions and
correctly handle leap years, combined parshiot, Israel/Diaspora
differences, and special-Shabbat maftir/haftarah overrides.

Two things are **not** from Hebcal and are hand-authored instead, clearly
labeled as such in the files themselves:
- `specialTrope` notes (in `parshiot.json`/`chagim.json`) and `megillot.json`
- All of `difficulty-scores.json` (see `difficulty-rubric.md` for the
  full, honest methodology and its limitations)

### Regenerating the data

```
cd tools
npm install
npm run gen:all
```

This rebuilds everything in `/data` from scratch, in dependency order
(`gen:parshiot` → `gen:haftarot` → `gen:chagim` → `gen:annotate` →
`gen:wordstats` → `gen:difficulty` → `gen:calendar`). Re-run it whenever the
Hebcal libraries are upgraded, or edit the individual `gen_*.mjs` scripts to
extend/adjust the data (e.g. push the calendar range past 2126, add more
`specialTrope` or difficulty overrides). `gen:wordstats` loads the full
Torah text via the `@shafeh/tanach` package purely to compute word-frequency
statistics locally -- the text itself isn't redistributed in `/data`.

**`data/difficulty-rubric.md` is hand-written, not generated** -- `gen:all`
never creates it. If you ever wipe `/data` and rebuild, restore that one
file from git (or rewrite it) separately; don't assume `gen:all` alone
reconstructs the full directory.

## Account & progress tracking

The "My Leining" tab lets users sign in and log which aliyot/parshiot they've
leined, optionally flagging one as their bar mitzvah parsha and noting the
year (Hebrew and/or Gregorian) they last read it. It computes % of the
Torah learned from real per-aliyah verse counts already in `parshiot.json`
-- no extra data needed.

**Backend: [Supabase](https://supabase.com)** (Postgres + Auth + Row Level
Security), chosen because it's free at this scale, requires no server to
run, and works directly from a static site via its client-side JS SDK --
Row Level Security is what actually keeps each user's data private, not
secrecy of the API key (which is meant to be public/client-side).

**One-time setup:**
1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's SQL Editor, paste and run `db/schema.sql` -- it creates
   the `profiles` and `leining_log` tables, enables Row Level Security, and
   sets up a trigger so every new signup gets a profile row automatically.
   Safe to re-run.
3. In Project Settings -> API, copy the **Project URL** and **anon/public
   key**, and paste them into `web/js/supabaseClient.js` (replacing the
   `YOUR_SUPABASE_PROJECT_URL` / `YOUR_SUPABASE_ANON_KEY` placeholders).
4. Sign-in uses email + password (Authentication -> Providers -> Email is
   enabled by default on new Supabase projects, so no extra config is
   needed). New Supabase projects require confirming the signup email
   before first sign-in by default -- if you'd rather skip that step
   entirely (e.g. while the project's default sender email isn't
   configured to look like it's from this app), turn off "Confirm email"
   under Authentication -> Providers -> Email and new accounts can sign in
   immediately after creating one.

Until `supabaseClient.js` is filled in, the "My Leining" tab shows a friendly
"not configured yet" notice instead of a broken login form -- the rest of
the app is unaffected either way.

**Optional: get an email whenever someone signs up.** See
`supabase/functions/notify-signup/README.md` for a Database Webhook + Edge
Function that emails you on every new signup via Resend.

**Gabbai Mode** (Beta) lets a signed-in user run one or more named minyanim,
invite other existing users into a leining rotation, and -- once a leiner
accepts -- see their shared reading history (leining and, separately, which
davening roles they've led) in a coverage summary. Two ways to line people up
for an upcoming date: assign a specific leiner directly, or open a week's
aliyot for self-serve sign-up and email every accepted member a link in one
click (claiming credits the leiner's log immediately). "Email leiners" opens
a pre-filled message in the gabbai's own mail app (a `mailto:` link, everyone
bcc'd) rather than sending through any server, so it's genuinely from the
gabbai's own address and needs no extra setup at all. It's built entirely on
`db/schema.sql`, so re-running that file in the SQL Editor (safe, idempotent,
same as step 2 above) is the only setup step needed. Sharing is opt-in per
invite: a leiner's history is never visible to a gabbai until they explicitly
accept.

## Nusach coverage

- **Ashkenazi, Sefardi, and Chabad** haftarah/maftir variants are populated
  wherever the underlying Hebcal data documents a difference.
- **Italian (Italki) and Yemenite (Baladi/Shami)** nusach are a known gap --
  they genuinely differ from the three above in a number of parshiot, but
  populating them reliably needs a dedicated source. Their absence means
  "not yet added," not "same as Ashkenazi."
- Torah **aliyah divisions themselves** (as opposed to haftarah selection)
  are essentially universal across nusachim and are not split by nusach.

## Known limitations (read before building on this)

- `difficulty-scores.json` is a rule-based heuristic (content-profile tags +
  ~19 curated overrides for well-known hard passages), not a survey of real
  leining outcomes. It's meant to be a cold-start seed that gets replaced or
  blended with real user/gabbai feedback once the app has usage data.
- The 100-year calendar assumes the fixed Hebrew calendar rules currently in
  use continue unchanged for the full century (standard assumption for this
  kind of calendar data).
- Everything here is Torah/haftarah/megillah *reading structure and
  difficulty* -- there's no user, assignment, scheduling, or attendance data
  yet. That's the next layer to build.
