# Leining-Log

Gabbai App or Log of Leining

This repo currently holds the **seed data** for the app: a structured,
regenerable dataset of every Torah/haftarah reading, its length, its
difficulty, and its date for the next 100 years. The app itself (UI, DB,
scheduling/assignment features) isn't built yet -- this is step one.

## What's in `/data`

| File | What it is |
|---|---|
| `parshiot.json` | The 54 individual parshiot. For each: all 7 aliyot + maftir with exact verse ranges and verse counts, totals, longest/shortest aliyah, the weekday (Mon/Thu) reading, and hand-curated `specialTrope` notes where they apply (Az Yashir, Aseret HaDibrot, etc.). |
| `parshiot-combined.json` | The 7 pairs of parshiot that are sometimes read combined (Vayakhel-Pekudei, Tazria-Metzora, Achrei Mot-Kedoshim, Behar-Bechukotai, Chukat-Balak, Matot-Masei, Nitzavim-Vayeilech), with the aliyah division actually used when combined. |
| `haftarot.json` | The haftarah for every parsha (incl. combined pairs), split by nusach: **ashkenazi** (default), **sefardi**, and **chabad**, wherever those traditions differ. See "Nusach coverage" below for what's *not* here yet. |
| `chagim.json` | Torah + maftir + haftarah readings for every Yom Tov day, fast day, Rosh Chodesh, and special Shabbat (Shekalim/Zachor/Parah/HaChodesh/Shuva/etc.), for both `diaspora` and `israel`, with nusach splits and `specialTrope` notes. |
| `megillot.json` | The Five Megillot (Shir HaShirim, Rut, Eicha, Kohelet, Esther) and when/how each is customarily read. Hand-authored, not from the Hebcal data. |
| `difficulty-rubric.md` | The methodology behind the difficulty scores -- read this before trusting `difficulty-scores.json` at face value. |
| `difficulty-scores.json` | Every aliyah and every parsha scored 0-10 on length, vocabulary, trope, repetition, and hidden challenges, plus a final average score. |
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
`gen:difficulty` → `gen:calendar`). Re-run it whenever the Hebcal libraries
are upgraded, or edit the individual `gen_*.mjs` scripts to extend/adjust
the data (e.g. push the calendar range past 2126, add more `specialTrope`
overrides, or retune the difficulty rubric weights).

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
