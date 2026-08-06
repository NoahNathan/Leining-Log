# Leining Difficulty Rubric

This document explains how `difficulty-scores.json` was generated. It is a
**starting heuristic**, not a scientific measurement of how hard a real
person will find a real aliyah. Treat it as a seed you tune over time --
ideally by letting gabbaim/baalei korei rate their own aliyot in the app and
blending that feedback in.

> **Revision history, newest first:**
> 4. **Every chag/fast/Rosh Chodesh/special-Shabbat reading in chagim.json
>    is now scored too** (see "Chagim" below), in a new `chagim` array
>    alongside `parshiot`. Also fixed the vocabulary aggregation: the first
>    cut at "compute vocabulary from real word data" (revision 3) technically
>    worked but compressed almost every aliyah into a narrow 4-6 band --
>    see "Vocabulary" below for what was wrong and how it's fixed now.
> 3. **Vocabulary is now computed from the real Torah text**, not guessed
>    from a content-profile category -- see "Vocabulary" below. **Combined
>    (double) parshiot are now scored directly** against their own
>    combined-reading aliyah divisions, not averaged from their two
>    components -- see "Combined parshiot" below.
> 2. Length made the dominant factor in the final score; added a
>    familiarity discount for passages recited so often in davening that
>    most readers already know them by heart (the Shema paragraphs, the
>    Aseret HaDibrot, Birkat Kohanim, Az Yashir).
> 1. Original version: all five criteria weighted equally, vocabulary
>    guessed from a whole-parsha content category, combined parshiot not
>    scored at all.

## The five criteria (each scored 0-10 per aliyah)

1. **Length** -- computed algorithmically from the aliyah's verse count,
   scaled to a 1-10 percentile rank against every aliyah in the Torah (the
   single shortest aliyah scores ~1, the single longest scores 10). **Dominates
   the final score by design** -- see "Weighting" below.
2. **Vocabulary** -- computed from the actual Hebrew words in the aliyah:
   how rarely they occur elsewhere in the Torah, and how complex they are to
   pronounce. See "Vocabulary" below -- this is no longer a category guess.
3. **Trope (cantillation)** -- how often unusual or rare te'amim
   combinations show up, and whether the passage uses a non-default
   cantillation system at all (e.g. the "ta'am elyon" used for the Aseret
   HaDibrot, or the elevated Shirah melody for Az Yashir/Ha'azinu).
4. **Repetition** -- how repetitive/formulaic the text is. This cuts both
   ways: repetition can make text easier to predict, but it also makes it
   dangerously easy to lose your place or skip/duplicate a line (e.g. the
   12 near-identical Nesiim offerings in Nasso, the 42-station journey list
   in Masei, the Mishkan construction/inventory lists in Vayakhel/Pekudei).
5. **Hidden challenges** -- a catch-all for things that don't fit neatly
   above: rare trope marks that appear only a handful of times in the whole
   Torah (e.g. the shalshelet, used only 4 times), passages customarily read
   fast and quietly (the Tochacha curses in Bechukotai/Ki Tavo), passages
   that are only ever read once a year with little opportunity to practice
   (Vezot Haberakhah), or unusual scroll layout (poetic "brick" columns).

## Weighting: length counts for as much as everything else combined

```
final = (4 x length + 1 x vocabulary + 1 x trope + 1 x repetition + 1 x hiddenChallenges) / 8
```

Length alone is **half the final score**; the other four criteria share the
remaining half. Raw length is the single most reliable, least subjective
predictor of how hard an aliyah is to prepare and deliver -- a long,
plain-vocabulary aliyah is still a bigger undertaking than a short, tricky
one. Retune it via the `RUBRIC_WEIGHTS` constant in `tools/gen_difficulty.mjs`.

**Why final scores almost never reach 9-10, and why that's not a bug:** to
land at 9+, an aliyah needs to be at or near the *longest in the entire
Torah* (length=10, worth 4/8 of the score) **and** simultaneously have
near-max vocabulary, trope, repetition, *and* hidden-challenge scores --
four largely independent things that don't naturally co-occur. In practice
the longest aliyot tend to be substantive narrative or legal content that
covers a lot of ground precisely *because* it isn't also maximally poetic,
maximally rare-vocabulary, and maximally repetitive all at once. Across the
full dataset (parshiot + combined + chagim, ~860 aliyot) exactly one aliyah
currently reaches 9 (Masei's 39-verse bulk of the journey-station list --
longest-percentile length, rarest-percentile vocabulary from all those
place names, *and* a repetition override, genuinely stacking all four);
none reach 10. That's an honest property of averaging several
mostly-independent 0-10 measurements, not evidence that the 9-10 band is
broken or unreachable by construction -- it's just genuinely rare for every
axis to peak on the same aliyah.

## Vocabulary: computed from real word data, not a category guess

`tools/gen_word_stats.mjs` loads the full Masoretic Torah text (all 5 books,
via the `@shafeh/tanach` package -- niqqud and cantillation included, not
redistributed in `/data`) and computes, for every single word in every
aliyah, two independent measurements:

1. **Rarity** -- how often that exact word (consonants only, cantillation
   and niqqud stripped) occurs anywhere else in the Torah's ~80,000 word
   tokens. A word that appears hundreds of times (`את`, `אשר`, `יהוה`...) is
   easy because the reader has seen it constantly; a hapax legomenon (a word
   occurring exactly once in the entire Torah) is hard because there is
   nowhere else to have practiced it. Scored as a 1-10 percentile rank of
   rarity (1/frequency) across every word token in the Torah.
2. **Pronunciation complexity** -- a checkable-features heuristic, not a
   full phonological model: consonant-letter count, +2 per guttural letter
   (א/ה/ח/ע -- classic points of mispronunciation), +3 if the word has a
   chataf (reduced) vowel (a specific marker that a guttural needs special
   vowel treatment), +1-2 for a dagesh. Also scored as a 1-10 percentile
   rank, this time against every word's raw complexity score.

**How the per-word scores turn into one aliyah-level number matters a lot,**
and the first attempt at this got it wrong in a way worth explaining, since
the fix generalizes:

- **Naive fix #1 (shipped, then corrected): average every word token's
  score.** This is what shipped first, and it barely varied between
  aliyot (nearly everything landed in a 4-6 band) -- because filler words
  like "et", "asher", "vayomer" can be 10-15% of an aliyah's tokens by
  themselves, and a token-level mean gets swamped by that repetition no
  matter how many genuinely rare words are also present.
- **Naive fix #2 (tried, rejected): average over *distinct* word types**
  (a word repeated 10 times counts once). This overcorrected in the
  opposite direction -- almost everything landed in a 7-9 band -- because
  Biblical Hebrew's morphology means the *majority* of distinct word forms
  in literally any passage are individually rare (measured on this corpus:
  53% of all ~12,900 distinct forms are hapax legomena, 77% occur 3 times
  or fewer), so "the rare portion of this aliyah's distinct vocabulary" is
  large and roughly constant everywhere, regardless of content.
- **What it actually does now:** compute each aliyah's raw token-level mean
  (naive fix #1's number), then **percentile-rank that mean against every
  other aliyah's raw mean** -- the same technique the `length` criterion
  already used successfully. An aliyah doesn't need an absolute score on
  some fixed scale; it needs to be measured *relative to every other
  aliyah in the dataset*, exactly like length is. This is computed once
  across parshiot, combined parshiot, and chagim together (918 aliyot),
  so a chag reading and a parsha aliyah are directly comparable.

This entirely replaced the old content-profile vocabulary baseline
(`RITUAL` used to just mean "vocab = 8" for every aliyah in Terumah,
Vayikra, Tazria, etc. regardless of what the actual words were).

The full computation, plus each aliyah's 3 rarest words and 3
hardest-to-pronounce words (useful for direct display in the app), is saved
separately in `data/word-difficulty.json` and consumed by
`gen_difficulty.mjs`; regenerate it with `npm run gen:wordstats` before
`gen:difficulty` (already wired into `gen:all` in the right order).

**Honest limitations of this method:**
- Frequency is counted on the **exact inflected surface form** (consonants
  only, but prefixes/suffixes like ב־, ו־, ־ים, ־ך included), not the
  underlying root/lemma. A very common root can still register as "rare" in
  one particular prefixed form (e.g. "בְּרֵאשִׁית" itself, with the ב
  prefix, is a near-hapax exact form even though the root ראשית is
  familiar) -- a fluent reader would find that word easier than its raw
  frequency score suggests. Proper lemmatization would need a real
  morphological analyzer (e.g. the OpenScriptures `morphhb` dataset) and is
  a natural next step, not done here.
- The pronunciation heuristic is intentionally simple and checkable, not a
  syllabification/phonology engine. It captures well-known trouble spots
  (guttural clusters, chataf vowels) but won't catch everything a real
  chazan would flag.

## Combined (double) parshiot are scored directly, not averaged

The 7 pairs of parshiot that are sometimes read together (Vayakhel-Pekudei,
Tazria-Metzora, Achrei Mot-Kedoshim, Behar-Bechukotai, Chukat-Balak,
Matot-Masei, Nitzavim-Vayeilech) now get their own entries in
`difficulty-scores.json`, scored against the **actual combined-reading
aliyah divisions** in `parshiot-combined.json` -- which are genuinely
different verse ranges than either parsha read alone (e.g. Matot-Masei's
4th aliyah is a single 72-verse aliyah spanning both the Reuven/Gad
settlement narrative and the bulk of the 42-station journey list, which as
separate parshiot fall into different aliyot entirely). Averaging the two
components' scores, as an earlier version of this data did, would have
missed that a combined reading's aliyah boundaries -- and therefore its
length distribution -- are not the same shape as either parsha alone.

Content-profile tags for the 7 combined entries are the deduplicated union
of their two components' tags (e.g. Behar-Bechukotai gets `['LEGAL',
'TOCHACHA']`, same as Bechukotai alone, since Behar contributes only
`LEGAL`). The specific overrides that depend on exact aliyah position
(the Tochacha, the "Az Yashir Yisrael" fragment, the journey-stations list)
were independently re-checked against the combined verse ranges and given
their own entries -- they do **not** simply inherit the individual
parsha's aliyah number, which usually shifts once the reading is combined.
None of the "known leining" familiar passages (the Shema paragraphs, the
Aseret HaDibrot, Birkat Kohanim, Az Yashir) ever fall inside a combined
pair, so no familiarity discounts apply there.

Whether a given pair is actually combined in a given year (and whether
Israel and the Diaspora agree that year) is calendar-dependent, not a
property of the parsha itself -- see `calendar-100y/` for the real
per-year, per-region determination. The app looks up whichever `parshaId`
that week's calendar row actually specifies (single or combined), and
`difficulty-scores.json` now has a real, directly-computed entry either way.

## Chagim are scored too, in their own array

Every reading in `chagim.json` that actually has Torah text attached (114
entries total; 8 -- Shabbat HaGadol, Shabbat Shuva, Erev Purim, Erev Tisha
B'Av -- have no distinct Torah/maftir reading of their own and are skipped)
gets scored the same way, using the same five criteria, the same length
scale, and the same word-frequency vocabulary data as the parshiot -- so a
chag reading and a parsha aliyah are directly comparable. Results live in a
separate `chagim` array in `difficulty-scores.json` (keyed by `chagId`,
matching `chagim.json`), not mixed into `parshiot`, since a chag reading
isn't a parsha.

Content-profile tags are assigned by pattern-matching the chag's name (see
`chagProfile()` in `tools/gen_difficulty.mjs`) rather than a hand-listed
table, since most Diaspora/Israel pairs share identical Torah content.
Specific overrides were added for the same kind of well-documented features
as the parshiot get, re-verified against chagim.json's actual verse ranges:
- **Aseret HaDibrot** on Shavuot day 1 (both regions) -- same ta'am elyon
  trope bump and familiarity discount as Yitro/Vaetchanan.
- **Az Yashir** on Pesach VII (both regions) -- same trope bump and
  familiarity discount as Beshalach.
- **The daily-decreasing bull count** on Sukkot Chol HaMoed / Hoshana Raba
  (Num 29) -- each day repeats the same offering formula with the bull
  count one lower than the previous day, a distinctive repetition/
  easy-to-default-to-the-wrong-number hazard that isn't present in the
  parallel Pesach Chol HaMoed readings (different content entirely: the
  Ex 33-34 revelation narrative), so it's a chag-specific override, not
  inherited from any parsha.
- **Chanukah's** nightly readings share the `GENEALOGY` profile tag with
  Nasso, since they're literally the same repetitive Nesiim gift-list text
  (Num 7), one nasi's day at a time.

`Tish'a B'Av` reuses the `TOCHACHA` profile tag for its high hidden-
challenge baseline (the custom of chanting slowly/quietly, and borrowing
Eicha-trope motifs) even though its actual content (Deut 4:25-40) isn't
curses -- a deliberate repurposing of that tag's *emotionally loaded,
read-carefully* meaning rather than its literal name; noted here so it
doesn't look like miscategorization.

## How trope/repetition/hidden-challenge scores were assigned

Hand re-deriving pasuk-by-pasuk difficulty for ~450 aliyot from scratch
isn't reliable to do purely from memory, and pretending otherwise would be
dishonest precision. (Vocabulary, above, sidesteps this by measuring the
actual text; trope/repetition/hidden-challenges still can't be measured
that directly, so they keep the two-layer rule system:)

1. **Content-profile baseline** -- every parsha (including the 7 combined
   ones) is tagged with one or more dominant content types (`NARRATIVE`,
   `GENEALOGY`, `POETRY`, `LEGAL`, `RITUAL`, `TOCHACHA`), each with baseline
   trope/repetition/hidden scores reflecting the *typical* difficulty
   drivers of that kind of content (e.g. `POETRY` gets a high trope
   baseline). Every aliyah in that parsha starts from its parsha's blended
   baseline.
2. **Specific overrides** -- a curated list of well-documented, specific
   difficulty features (Az Yashir, the Aseret HaDibrot, the four shalshelet
   occurrences in the entire Torah, the Nesiim repetitions, the Masei journey
   list, the Tochacha passages, etc.) bump the relevant sub-scores for the
   *exact* aliyah they fall in -- each one checked against this parsha's
   actual verse ranges in `parshiot.json` / `parshiot-combined.json`, not
   assumed from memory.
3. **Familiarity discounts** -- applied last, on top of the above, for the
   well-known liturgical passages below.

This means most aliyot in, say, a `RITUAL`-tagged parsha share very similar
trope/repetition/hidden scores to each other unless they happen to be one of
the specifically flagged ones -- an honest reflection of how much aliyah-level
granularity this part of the method can support. See each parsha's `profile`
field and each aliyah's optional `note`/`wellKnown` fields in
`difficulty-scores.json`.

## "Known leining": familiarity lightens some passages

Several Torah passages are recited so often in davening -- twice a day, in
some cases -- that most people who attend services regularly already know
them by heart before they're ever called up to read them. Treating those
passages as if they were as unfamiliar as everything else overstates their
real difficulty. A `FAMILIAR_PASSAGE_DISCOUNTS` table subtracts points from
**vocabulary** and **hidden challenges** only, for the exact aliyot
containing:

| Passage | Where | Why it's familiar |
|---|---|---|
| Shema (Deut 6:4-9) + V'ahavta | Vaetchanan, aliyah 6 | Recited twice daily |
| 2nd paragraph of Shema (Deut 11:13-21) | Eikev, aliyah 6 | Recited twice daily |
| 3rd paragraph of Shema / tzitzit (Num 15:37-41) | Sh'lach, aliyah 7 | Recited twice daily (smaller discount -- it's only the tail of the aliyah) |
| Aseret HaDibrot | Yitro aliyah 6, Vaetchanan aliyah 4 | Read twice a year plus Shavuot; culturally the most familiar passage in the Torah |
| Birkat Kohanim (Num 6:24-26) | Nasso, aliyah 4 | Recited daily by kohanim, heard weekly during duchening (smaller discount -- only the tail of a long aliyah otherwise dominated by unfamiliar sotah/nazir law) |
| Az Yashir / Shirat HaYam | Beshalach, aliyah 4 | Recited daily in Pesukei D'Zimra |

**What this discount deliberately does *not* touch:**
- **Length** -- it's still exactly as many verses.
- **Trope** -- knowing the words doesn't teach you the Aseret HaDibrot's
  ta'am elyon or Az Yashir's elevated melody; those overrides still apply
  in full, stacked on top of the (now-lower) baseline.
- **Repetition** -- unaffected; familiarity isn't about repetition.
- The underlying **rarity/pronunciation numbers computed above** are not
  altered either -- the discount is a separate, additional adjustment on
  top of them, not a correction to the word-frequency measurement itself.

This is a starting list, not an exhaustive one -- it only includes passages
with a clear, near-universal liturgical basis (something recited daily or
near-daily), specifically to keep it defensible rather than a matter of
"this parsha feels well-known to me." Candidates for a future pass: Birkat
Kohanim's surrounding verses, the opening of Bereshit (widely known
culturally even if not liturgically recited), or a tunable per-community
list (a congregation that does public Torah study of a given parsha every
year might reasonably mark more of it "familiar").

## Known limitations / where to improve this next

- The content-profile tags (trope/repetition/hidden) are assigned at the
  whole-parsha level, then blended; they are **not** independently verified
  against the exact verse ranges of every aliyah the way vocabulary and the
  specific overrides are, so a profile tag can be slightly off at an aliyah
  boundary.
- Only ~24 specific override rules and 7 familiarity discounts are encoded.
  There are certainly more well-known hard *and* well-known-by-heart
  passages that aren't flagged yet.
- "Difficulty" here means difficulty *to prepare and read aloud correctly*.
  It says nothing about how meaningful, obscure, or halachically significant
  a passage is.
- The familiarity list assumes a fairly traditional, regularly-davening
  reader. Someone learning to read Torah for the first time, or from a
  community with different prayer-attendance norms, may not experience
  these passages as "already known" at all -- this is exactly the kind of
  assumption real usage data should correct.
- See "Vocabulary" above for the word-frequency method's own specific
  limitations (surface-form vs. lemma, a simple pronunciation heuristic).
- No real usage/feedback data has been incorporated -- this is a cold-start
  heuristic, meant to be replaced or blended with real ratings once the app
  has users.
