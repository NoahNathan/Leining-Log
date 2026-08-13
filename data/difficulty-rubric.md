# Leining Difficulty Rubric

This document explains how `difficulty-scores.json` was generated. It is a
**starting heuristic**, not a scientific measurement of how hard a real
person will find a real aliyah. Treat it as a seed you tune over time --
ideally by letting gabbaim/baalei korei rate their own aliyot in the app and
blending that feedback in.

> **Revision history, newest first:**
> 7. **Whole-parsha scores are now measured directly instead of averaged
>    from their aliyot** -- each of the five criteria is computed for the
>    reading as a whole and rescaled against the other parshiot, and the
>    overall parsha score is a plain weighted blend of those five that is
>    deliberately NOT stretched to fill the scale. See "Whole-parsha scores"
>    below for the bug that prompted this and why the composite is left
>    unstretched.
> 6. **"Rare word" examples now require a real absolute rarity threshold**
>    (occurring at most 5 times across the whole Torah), instead of always
>    showing the 3 least-common words in that one aliyah regardless of
>    whether even the least-common one was actually rare. An aliyah with no
>    word meeting that bar now shows no "rare words" at all, rather than a
>    misleadingly-labeled example. See "Vocabulary" below.
> 5. **Repetition now eases difficulty instead of adding to it**, and
>    **final scores are rescaled against the whole dataset** so the full
>    1-10 range is genuinely used (previously the hardest aliyah in the
>    entire dataset topped out at 9). Both are explained below in
>    "Repetition changed direction" and "Rescaling for full-range variance."
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

> **Later revision (measurement pass):** length switched from verse count to
> word count, and trope and repetition switched from parsha-level category
> guesses to per-aliyah measurements taken from the actual text. See
> "The measurement pass" near the end of this document for what was wrong,
> what the evidence was, and what changed.

1. **Length** -- computed algorithmically from the aliyah's **word count**
   (not verse count -- see "The measurement pass" below), scaled to a 1-10
   percentile rank against every ordinary parsha aliyah. **Dominates the
   final score by design** -- see "Weighting" below.
2. **Vocabulary** -- computed from the actual Hebrew words in the aliyah:
   how rarely they occur elsewhere in the Torah, and how complex they are to
   pronounce. See "Vocabulary" below -- this is no longer a category guess.
3. **Trope (cantillation)** -- the measured density of genuinely uncommon
   te'amim in that aliyah's actual text, plus a floor for passages using a
   non-default cantillation system (the "ta'am elyon" of the Aseret
   HaDibrot, the elevated Shirah melody of Az Yashir and Ha'azinu).
4. **Repetition** -- how formulaic/predictable the text is, and it **lowers**
   the difficulty score: once a reader has the template (the 12 near-identical
   Nesiim offerings in Nasso, the 42-station journey list in Masei), each
   repetition is easier than genuinely novel text would be. See "Repetition
   changed direction" below for why this flipped from an earlier version
   that scored it the opposite way, and where the real "lose your place"
   risk of repetitive text actually gets counted instead.
5. **Hidden challenges** -- a catch-all for things that don't fit neatly
   above: rare trope marks that appear only a handful of times in the whole
   Torah (e.g. the shalshelet, used only 4 times), passages customarily read
   fast and quietly (the Tochacha curses in Bechukotai/Ki Tavo), passages
   that are only ever read once a year with little opportunity to practice
   (Vezot Haberakhah), or unusual scroll layout (poetic "brick" columns).

## Weighting: length counts for as much as everything else combined

```
final = (5 x length + 1 x vocabulary + 1 x trope + 1 x repetition + 2 x hiddenChallenges) / 10
```

That's 50% length, 20% hidden challenges (gotchas), and 10% each for
vocabulary, trope, and repetition. Length alone is still **half the final
score** -- the other four criteria share the remaining half -- but within
that other half, hidden challenges now counts double any one of vocabulary,
trope, or repetition individually.

Raw length is the single most reliable, least subjective predictor of how
hard an aliyah is to prepare and deliver -- a long, plain-vocabulary aliyah
is still a bigger undertaking than a short, tricky one. Gotchas got the
extra weight because it's the criterion most directly tied to *specific,
avoidable reading mistakes* (the ambiguous-spelling and look-alike-pair
work earlier in this document) rather than general unfamiliarity or
character -- catching one matters more than catching an equivalent amount
of generic vocabulary rarity. Retune via the `RUBRIC_WEIGHTS` constant in
`tools/gen_difficulty.mjs`.

## Repetition changed direction

The original version of this rubric scored repetitive/formulaic content
(Nesiim gifts, journey-station lists, the Sukkot chol-hamoed
daily-decreasing bull counts) as *harder*, reasoning that repetition makes
it easy to lose your place. That's backwards as the dominant effect: a
reader who has internalized "traveled from X, camped at Y" or "this nasi
brought one silver bowl, one silver basin..." can produce the *next*
repetition of that formula faster and more confidently than an equal
stretch of genuinely novel text -- repetition is a learnable shortcut, not
a hazard, for the bulk of the text. It was a real, direct correction: the
Masei aliyah with the bulk of the journey-station list was inflated to a 9
purely because its repetition was scored as a difficulty *adder*; with the
sign fixed, that aliyah is still hard (still 9, now on genuinely-earned
length and vocabulary alone -- see the rarest-word/hardest-to-pronounce
examples in `word-difficulty.json`), but no longer for the wrong reason.

The real residual risk of formulaic text -- losing track of which
repetition you're on, defaulting to autopilot and saying the wrong nasi's
gift or the previous day's bull count -- is genuine, but it's a different
thing than "repetition is hard," so it's now scored as a small
**hidden-challenges** bump on the specific aliyot where it applies (Nasso's
three Nesiim aliyot, Masei's journey-station aliyot, the Sukkot chol-hamoed
bull-count aliyot), separate from and on top of a *negative* repetition
adjustment. Eisav's genealogy (Gen 36) lost its repetition override
entirely in this pass -- it was never a repeated formula, just many
distinct rare names in a row, which the real word-frequency vocabulary
score already captures accurately without double-counting it under
repetition too.

`PROFILES`' baseline repetition values dropped accordingly: `GENEALOGY`
(census lists, gift lists) from 8 to 2, `RITUAL` (much of which is also
formulaic korbanot/construction instruction) from 6 to 3. `NARRATIVE` moved
up slightly, from 2 to 3, as the honest baseline for text that has no
repeated-formula discount to lean on at all.

## Rescaling for full-range variance

Before this revision, the hardest single aliyah in the entire dataset
(~860 aliyot across parshiot, combined parshiot, and chagim) scored 9, and
nothing reached 10 -- because landing at the true top requires an aliyah to
be at or near the *longest in the whole Torah* **and** simultaneously
near-max on vocabulary, trope, repetition, and hidden challenges all at
once, which rarely coincides on one aliyah. That's a real property of
averaging several mostly-independent measurements, but it meant the
1-10 scale was never actually fully used, which understates how different
the hardest and easiest readings really are from each other.

The fix: after computing every aliyah's raw weighted score, **rescale the
whole pool against itself** -- find the single hardest and single easiest
raw score across all ~860 aliyot, then linearly stretch every score so the
hardest becomes a real 10 and the easiest a real 1. This is the same
percentile-style technique `length` and `vocabulary` already used
individually, now applied to the *combined* final score too. It doesn't
change any aliyah's *ranking* relative to the others -- it's a monotonic
stretch -- but it does spread the whole distribution out, which is exactly
what "higher variance" means here: more of the scale in active use, bigger
gaps between genuinely different aliyot, rather than everything clustering
in a narrow middle band.

With repetition's direction fixed and this rescaling applied, the current
hardest aliyot are Pinchas's second census (longest aliyah, rarest
vocabulary from the tribal/family names) and the three Tochacha passages in
Bechukotai/Behar-Bechukotai/Ki Tavo (near-longest, high vocabulary from
Deuteronomy's dense rebuke language, and the maximum hidden-challenge score
for the traditional fast/quiet reading custom) -- four aliyot, all scoring
a genuine 10. Re-run `npm run gen:difficulty` (or `gen:all`) any time the
overrides or weights change; the rescale bounds are recomputed from
whatever the pool actually contains, not hard-coded.

Everything in this section is about the **aliyah-level** score. The
whole-parsha score is computed differently -- see the next section.

## Whole-parsha scores: measured, not averaged from the aliyot

Each of the five criteria shown on a parsha's page rates the reading **as a
whole**, measured against the other parshiot directly. It is not the average
of that parsha's aliyot's own scores, which is what an earlier version did
and which produced a real ranking failure.

**The bug.** Each aliyah's own length score is a percentile rank against
every other aliyah in the corpus. Averaging seven of those ranks measures
how *consistently* long a parsha's aliyot are, not how long the reading
actually is -- so it rewarded an evenly-long reading over a genuinely longer
one whose length is concentrated in a few big aliyot. Matot-Masei is the
longest reading in the Torah (2,949 words against Chukat-Balak's 2,702), yet
averaging aliyah-level length scores ranked it *behind* Chukat-Balak, 8.0 to
8.1, because its aliyot 3, 5 and 6 are only mid-length while Chukat-Balak's
seven are uniformly long.

**What it does now.** Length uses the parsha's own total word count; the
other four use the mean of its aliyot's scores as the raw signal (there is
no separately-measured whole-parsha signal for those yet -- see the
limitation below). Either way the raw value is then rescaled against the
same pool, which is what actually fixes the ranking.

**Median-anchored rescale.** The pool is split at its own median and each
half is stretched independently to fill [1, 5.5] and [5.5, 10]. Three
reasons over a plain min/max stretch:
- The median lands at the centre of the scale by construction, matching
  where these criteria already sat naturally under averaging (their means
  were all 4.8-5.6) rather than by luck.
- The real 1 and 10 are reached. Under averaging, gotchas never exceeded
  6.5 for any parsha in the corpus -- the criterion looked far more uniform
  across parshiot than it actually is.
- A single outlier stretches only its own half, so the rest of the
  distribution keeps its true relative spacing. This is deliberately *not*
  an order-based percentile: real gaps between parshiot survive, including
  skew, instead of being flattened into an even spread.

The pool is all 61 real parshiot -- the 54 individual **and** the 7 combined
ones, since a combined reading is a parsha someone actually leins on a given
Shabbat. Anchoring on the 54 individual ones alone was tried and rejected:
every combined parsha's total exceeds that ceiling, so four of the seven
(Matot-Masei and Chukat-Balak among them) clamped to an identical flat 10
with no way to tell them apart. Chagim and special readings are scored
against this scale but excluded from defining it, so their much shorter
readings don't compress it. Maftir is excluded from each parsha's totals
(on an ordinary Shabbat it re-reads the end of aliyah 7) unless it is the
reading's only content, as on several fast days, in which case it counts in
full.

### The overall parsha score is deliberately NOT stretched

The number in the badge at the top of a parsha's page is the plain weighted
blend of the five rescaled criteria, using the same `RUBRIC_WEIGHTS` as
everywhere else. Unlike the individual criteria, and unlike the aliyah-level
score in the previous section, it is **not** rescaled to fill 1-10. Rescaling
it was tried and rejected on two grounds:

1. **It is tautological.** A min/max stretch maps whichever parsha scores
   highest to exactly 10 by construction. The top score then measures rank,
   not difficulty -- if the whole corpus were easy, the least-easy reading
   would still print 10.
2. **It asserted things that are false about the readings.** Matot-Masei
   came out a forced 10 while scoring 4.8 on trope and 2 on repetition (its
   42-station journey list is highly formulaic). "Maximally hard on every
   axis" is not true of it. The bottom end broke the same way: Vezot
   Haberakhah forced to a flat 1 despite scoring 8.9 on repetition, i.e.
   genuinely novel text with no formulaic pattern to lean on.

The clustering short of the extremes that a weighted blend produces is the
real signal here, not an artifact to correct: almost no reading is hard on
all five semi-independent criteria at once, and the overall score should say
so. Keeping the *per-criterion* rescales is what lets the composite still
reach ~8 at the top rather than collapsing into a narrow 5-6 band, so the
scale stays useful without overclaiming. As of this revision the hardest
parshiot are Matot-Masei (8.1), Vayakhel-Pekudei (7.5) and Chukat-Balak
(7.2); the easiest is Vezot Haberakhah (2.7).

**Known limitation.** For vocabulary, trope, repetition and gotchas the raw
whole-parsha signal is still the mean of per-aliyah scores, so those four
inherit whatever the aliyah-level measurement missed -- most notably that a
formulaic pattern spanning an aliyah boundary (Masei's journey list is the
clear case) is invisible to a per-aliyah repetition measurement. Only length
is genuinely re-measured from the parsha's own text. Computing the other
four from the pooled text of the whole reading -- which would also give
vocabulary a much larger and steadier sample than seven ~300-word slices --
is the natural next step and is not done here.

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

The full computation, plus each aliyah's rarest words (up to 3, each
required to occur **at most 5 times across the whole Torah** to qualify --
an aliyah where nothing clears that bar shows none, rather than "the 3
least-common words in this aliyah" mislabeled as rare) and 3
hardest-to-pronounce words (useful for direct display in the app), is saved
separately in `data/word-difficulty.json` and consumed by
`gen_difficulty.mjs`; regenerate it with `npm run gen:wordstats` before
`gen:difficulty` (already wired into `gen:all` in the right order). Across
the full ~918-aliyah pool, only 2 aliyot have no word meeting the threshold
(a 3-verse Sukkot Chol HaMoed reading where every word, while collectively
driving a high vocabulary score, individually occurs more than 5 times).

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
- **Plene/defective (male/chaser) spelling variants are not merged, and a
  naive fix for this was tried and deliberately rejected as unsafe.** Some
  words are spelled with an extra internal ו/י (matres lectionis) in one
  Torah occurrence and without it in another (e.g. כל/כול), which splits
  that word's true frequency across two "different" consonantal forms and
  can overstate its rarity. The obvious fix -- strip internal ו/י before
  counting frequency -- was tested directly against the real text and
  rejected: Hebrew's weak-root morphology means ו/י are very often genuine
  root letters, not optional vowel-letters, so blind stripping merges
  unrelated words (`את` with `אות`, `בן` "son" with `בין` "between", `עד`
  "until" with `עוד` "still" -- and, unacceptably, `יהיה` with `יהוה`).
  Fixing this correctly needs real morphological/lemma data (the same
  `OpenScriptures morphhb` gap noted above), not a blanket heuristic, so
  exact-spelling frequency counting stays as the honest baseline rather
  than shipping a fix that trades one inaccuracy for a worse, unpredictable
  one.

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
  count one lower than the previous day: a repetition discount for the
  learnable formula, plus a small hidden-challenge bump for the real
  risk of defaulting to the previous day's number. Not present in the
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
4. **Ambiguous-spelling bump** -- the one hidden-challenge sub-signal that
   *is* measured directly from the text rather than hand-curated: any aliyah
   containing a "written one way, read another" word gets a flat +1 to
   hidden-challenges (once per aliyah, regardless of how many such words it
   has). Two distinct, text-grounded phenomena feed this, both detected in
   `gen_word_stats.mjs` straight from the vocalized text -- neither is a
   hand-typed list:
   - The archaic Torah spelling of the feminine pronoun "hi" (she) as הוא --
     identical to the masculine "hu" (he), distinguished only by the niqqud
     (הִוא vs. הוּא). Also catches the same archaic vav-for-yud spelling in
     compounds like הַהִוא ("that", feminine).
   - Every formal **Ketiv/Qere** in the Chumash (~70 total) -- the specific
     places where the Torah scroll's actual written letters differ from what
     is traditionally read aloud, by long-standing Masoretic tradition (e.g.
     Devarim 22's נער written but נערה read, or Devarim 28:27's euphemism
     substitution). `@shafeh/tanach` marks every one of these explicitly in
     its own source markup, so this reads that annotation directly rather
     than maintaining a hand-typed list that could drift from the real text.

   This is deliberately narrower than it could be: an earlier, broader "any
   word whose vowels vary elsewhere in this aliyah" scan produced mostly
   noise (meteg marks, ordinary pausal-form vowel shifts) rather than genuine
   look-alike traps, so only these two specific, well-documented phenomena
   are flagged. See each aliyah's optional `ambiguousSpellingExamples` field
   in `difficulty-scores.json`.

This means most aliyot in, say, a `RITUAL`-tagged parsha share very similar
trope/repetition/hidden scores to each other unless they happen to be one of
the specifically flagged ones -- an honest reflection of how much aliyah-level
granularity this part of the method can support. See each parsha's `profile`
field and each aliyah's optional `note`/`wellKnown` fields in
`difficulty-scores.json`.

## Look-alike word pairs: a fifth hidden-challenge signal, count-thresholded

A related but separate signal from the ambiguous-spelling bump above:
`gen_word_stats.mjs` also finds pairs of *distinct* words within the same
aliyah that differ by exactly one internal ו/י (e.g. עד/עוד, בן/בין, את/אות)
-- close enough to be genuinely hard to tell apart without nikkud, which
matters because the actual public reading is done from an unvocalized
scroll. This came directly out of investigating the vocabulary-frequency
normalization idea above: the same "strip internal ו/י" heuristic that's
unsafe for merging word *frequencies* turns out to be exactly the right tool
for finding word *pairs* worth flagging as a reading hazard -- the risk here
doesn't depend on knowing whether the two forms are truly unrelated words or
just the same root in different grammatical forms, only on the fact that
they look nearly identical.

**First attempt (tried, rejected): percentile-rank the pair count, the same
technique used for length and vocabulary.** This seemed like the obvious
choice -- reuse the exact machinery already proven to work -- but it
backfired badly on this specific data: the count distribution is heavily
zero-inflated (57.6% of aliyot have zero pairs, another 20.9% have exactly
one), so percentile rank compresses almost the *entire* non-zero corpus into
the top half of the 1-10 scale. In practice this meant a single incidental
pair (21% of all aliyot) landed at the same score contribution as a
genuinely pair-dense aliyah, and anything with 3+ pairs (11% of aliyot) all
got slammed to the same maximum bump with no further discrimination --
worse than not scoring it at all, and it moved the average Gotchas score
across the whole dataset up by nearly 1.5 points for no real gain in
distinguishing hard aliyot from easy ones. Percentile-ranking is the right
tool for continuous, well-spread measurements (word rarity, verse count);
it's the wrong tool for a small, sparse integer count like this one.

**What it actually does now:** a direct count threshold, added into
`hiddenChallenges` alongside the ambiguous-spelling bump:

| Pairs in the aliyah | Bump |
|---|---|
| 0-1 | +0 |
| 2-3 | +1 |
| 4-5 | +2 |
| 6+ | +3 |

This keeps the common case (0-1 pairs, ~78.5% of aliyot) contributing
nothing, and reserves any score impact for the aliyot that are genuinely
unusual in how many of these near-misses they contain -- 13 aliyot in the
whole dataset (1.4%) hit the +3 ceiling. The capped, shortest-first
`lookAlikeWordPairs` list (up to 3 per aliyah) is still shown directly in
the app's "why" panel regardless of score impact, since it's useful
information even for aliyot below the scoring threshold.

## Look-alike pairs, take two: identical consonants, not just one letter apart

The one-letter-apart check above catches words that are *close* without
nikkud. A user pointed out the actually-worse case it was missing: two
distinct words that are *100% identical* without nikkud -- same letters, no
insertion needed, differing only in which vowels they carry. On a real
Torah scroll (no nikkud at all) these are indistinguishable until you
already know which word it is. This is the same category as the הוא/הִיא
gotcha above, just not limited to that one hand-picked pair.

**First attempt (tried, rejected): auto-detect it Torah-wide.** For every
consonantal skeleton, count how many distinct vocalized forms it takes
anywhere in the text. Result: 2,149 of the Torah's 12,856 unique skeletons
(17%) have 2+ vocalizations -- but nearly all of that is ordinary grammar,
not real ambiguity: a dagesh appearing or not (בֵּן/בֶן), construct-vs-absolute
noun forms (דָּבָר/דְּבַר), the Divine Name's traditional vocalization
variants. Auto-flagging all of it would be noise, not signal.

**Second attempt (tried, rejected): restrict to same-aliyah co-occurrence.**
Reasoning that requiring *both* vocalizations to actually appear together in
one aliyah (mirroring how the one-letter-apart check already works) would
filter out the Torah-wide noise. It didn't: 95.3% of aliyot still hit at
least one such collision, for the same reason -- ordinary grammatical vowel
variance is common enough that two forms of the same mundane word landing
in the same aliyah is the norm, not the exception.

**What actually works: a short, hand-verified allowlist**, the same
approach as הוא/הִיא, just covering more than one pattern
(`HOMOGRAPH_SKELETONS` in `gen_word_stats.mjs`). Real candidates were pulled
from the co-occurrence scan above and checked by hand against what they
actually mean, keeping only skeletons where the collision is a genuinely
different word, not a grammatical variant of the same one:

| Skeleton | Real distinct words hiding in it |
|---|---|
| אתי | "me" (direct object) vs. "with me" |
| אתו | "him" (direct object) vs. "with him" |
| אתה | "you" (masc.) vs. "her" (direct object) |
| אתם | "them" (direct object) vs. "with them" vs. "you all" (masc.) |
| אתכם | "you all" (direct object) vs. "with you all" |
| לו | "to him" vs. "if only" |
| מן | "from" vs. "manna" |
| עשו | "Esau" vs. "they made/did" |
| אם | "if" vs. "mother" |

Bare **את** (the direct-object marker) was tested and specifically
*excluded*: it's one of the most common words in the Torah, and 96% of its
apparent "collisions" turned out to be its own ordinary tzere/segol pausal
alternation (אֵת/אֶת, same word) rather than the much rarer "you" (fem.,
אַתְּ) contrast. Including it would have flagged nearly every aliyah in the
Torah for no real signal.

**A second, narrower pausal case was added anyway: ידעתם.** This is the
exact example that originally prompted this whole feature (a user's real
aliyah in Re'eh) -- and it's the *same kind* of thing as bare את above (one
word, same meaning, a pausal-position vowel shift at the end of a clause:
the usual יְדַעְתֶּם vs. the rarer יְדַעְתָּם), not a case of two genuinely
different words. את was excluded purely because of *volume*, not because
pausal shifts are categorically out of scope -- and ידעתם doesn't have that
problem: it occurs only 7 times in the entire Torah, and only 1 of those
(Deuteronomy 13:3, inside Re'eh's 3rd aliyah) is the rare pausal form. It's
included as a legitimate, low-noise "usual form vs. pausal form" trap for a
reader used to seeing the common ending.

**A systematic re-scan, not just the one reported case.** Rather than
stopping at ידעתם, every aliyah was re-scanned for the same pattern:
identical consonantal skeletons whose distinct vowel signatures actually
co-occur within one aliyah (the same trigger condition the live detector
uses), ranked by whole-Torah rarity. That surfaced 535 candidate
skeletons -- confirming the same conclusion as the two earlier rejected
attempts: the overwhelming majority, even restricted to rare words, are
still ordinary Hebrew morphology (construct-vs-absolute noun pairs, the
definite article's vowel shifting before a guttural, standard verb-suffix
pausal endings) rather than genuine word-confusion traps. Rarity alone
doesn't separate real traps from predictable grammar -- Hebrew's
inflectional rules are exactly what make most rare-word collisions look
rare in the first place.

What's different this time is that each candidate was checked against the
*actual verses* (not inferred from the vowel pattern alone) before being
kept or discarded. That process found 11 more genuine entries beyond
ידעתם, each verified against real text:

| Skeleton | What's actually colliding |
|---|---|
| הבל | "Hevel/Abel" -- usual form vs. rare pausal ending (Genesis 4), same pattern as ידעתם |
| קין | "Cain" -- usual form vs. rare pausal ending (Genesis 4), same story as הבל |
| ורבו | "multiply!" (command) vs. "they will increase" (a promise) |
| ויעבר | "he crossed over" vs. "he brought/led across" -- different verb stems, back-to-back in the Yabok crossing (Genesis 32:23-24) |
| אכלו | "his ration" (noun) vs. "they ate" (verb) |
| ויקרבו | "they drew near" vs. "they brought/offered" -- different verb stems, both within Shemini (Leviticus 9) |
| ישחט | "he slaughters" -- usual form vs. rare pausal-type form, both *in the same verse*, Leviticus 17:3 |
| ועבדתם | "you shall serve" -- usual ending vs. rare pausal ending, the same shape as ידעתם on a different verb |
| בהרת | "bright spot" (singular) vs. "bright spots" (plural), Leviticus 13 |
| מרים | "Miriam" vs. "bitter" vs. "one who lifts" -- three different words, and Miriam/bitter both appear within a few verses of each other in the Song of the Sea (Exodus 15) |
| ילד | "he fathered" (active) vs. "he was born" (passive) -- opposite grammatical voice, all through the Genesis genealogies |
| רעה | "shepherd" vs. "evil/bad" -- about as different as two meanings get, and they land in *the same verse*, Genesis 37:2 |

Several of these (ישחט, רעה) are genuinely striking: the two colliding
spellings sit in the very same verse, not just the same aliyah -- the
strongest possible evidence that this isn't a hypothetical ambiguity. The
allowlist now stands at 21 entries total. Dataset-wide impact stayed
proportionate to what was found: only the 12 newly-affected aliyot moved
(0-1-pair share moved from 75.7% to 75.4%), same low-noise shape as every
prior addition here.

**One more real bug found along the way:** the naive vowel-signature
comparison also flagged לוֹ/לּוֹ ("to him," with vs. without an ordinary
gemination dagesh on the lamed) as if it were the genuine לוֹ/לוּ contrast
("to him" vs. "if only," where the dagesh instead lands on the vav and forms
the shuruk vowel). Same mark, two unrelated jobs. Fixed by only stripping
the dagesh when it's *not* immediately after a vav (`stripGeminationDagesh`
in `gen_word_stats.mjs`) -- gemination gets ignored, the vav's own vowel
does not.

These pairs feed into the exact same `lookAlikeWordPairs` /
`lookAlikePairCount` fields as the one-letter-apart pairs above (sorted
identical-consonant-first, since they're strictly more severe), and the same
count-threshold bump table -- no separate scoring mechanism needed. Combined
distribution across all 918 aliyot: 75.7% still land at 0-1 pairs (no bump),
1.9% hit 6+ (the max bump), and the dataset-wide `hiddenChallenges` mean
moved from 5.26 to 5.05.

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

## The measurement pass: replacing three guesses with three measurements

An audit of the finished rubric against the actual text found that three of
the five criteria were not measuring what they claimed to. Each problem was
confirmed numerically across all 858 scored aliyot before anything changed.

**1. Repetition was inert.** 97% of aliyot scored exactly 3, standard
deviation 0.32. The cause was structural: five of the six content profiles
carried `repetition: 3`, so outside genealogies and a dozen hand overrides
the criterion was a constant. It consumed 10% of the score while
distinguishing almost nothing.

**2. Length counted verses, and verses are not equal units.** Across the
dataset they run from 6.1 to 21.0 words each -- a 3.4x spread. Verse count
and word count correlate at 0.97, which conceals the tails: re-ranking by
words moves individual aliyot by up to 218 places out of 858. Tazria 7 is
5 verses but 102 words; the Sukkot chol-hamoed 4th aliyot are 6 verses but
54 words, so the nominally longer reading is barely half the text. With
length carrying half the final score, this was the single largest source of
error in the rubric.

**3. Trope was a parsha-level category guess** -- 89% of aliyot sat in
{3,4,5} -- even though the cantillation is right there in the source text.
Counting every mark across all 5,846 verses gives clean, measured tiers:

| Tier | Marks | Frequency |
|---|---|---|
| Ultra-rare | yerach ben yomo (**1x in the whole Torah**, Num 35:5), shalshelet (4x), merkha kefula (4x) | a reader may never meet one |
| Uncommon | pazer, telisha gedola/qetana, yetiv, zarqa, segol, gershayim, zaqef gadol | 2-9% of verses |
| Ordinary | tipcha, etnachta, munach, merkha, zaqef qatan, pashta, qadma, mahpach, tevir, revia, geresh, darga | 17-99% of verses -- not scored |

**What changed.** Length now ranks by word count. Trope is the measured
density of uncommon marks. Repetition is measured formulaicity, inverted
(formulaic text is easier). Ultra-rare marks feed gotchas as a discrete +2,
since meeting a shalshelet is an event rather than a density.

**Measuring repetition needed two metrics, not one.** Recurring word
4-grams catch verbatim block repetition -- the Nesiim offerings (Num 7)
rank first. But they score the 42 journey stations (Num 33) at a flat 0%,
because "traveled from *X*, camped at *Y*" changes every content word.
Repeated verse-openings catch that at 90%. Taking the max of the two is
what a reader actually experiences: either kind of pattern makes the text
easier once learned.

**Auto-detection validated against the hand-curation it replaced.** The
rare-mark scan reproduces all four hand-coded shalshelet aliyot exactly
(Vayera 3, Chayei Sara 3, Vayeshev 6, Tzav 6) -- and additionally finds four
merkha kefula and the single yerach ben yomo in Masei that hand-curation had
missed. Measured formulaicity likewise corrected a mis-targeted override:
the Sukkot chol-hamoed repetition adjustment sat on aliyah 1, which measures
0% internal repetition, while the genuinely formulaic reading is aliyah 4.

**One thing measurement got wrong, and how it's handled.** Shirat Ha'azinu
collapsed from trope 9 to trope 1-3, because the Song is chanted to its own
melody from a two-column layout while its cantillation marks are entirely
ordinary. Mark-density cannot see a melody. Special melodies are therefore
kept as hand-set `tropeFloor` minimums -- Az Yashir, the Aseret HaDibrot
(ta'am elyon), and Ha'azinu 1-6. A floor rather than a bump, because the
difficulty is "there is another tune to learn," which doesn't scale with how
busy the marks are. This is strictly better than the old flat POETRY
baseline, which also gave Ha'azinu's *prose* 7th aliyah a 9.

**Result.** Trope's spread rose from sd 1.08 to 2.66, repetition's from 0.32
to 3.21. More tellingly, the final score's correlation with length alone
fell from 0.953 to 0.905 while its correlation with trope rose from 0.15 to
0.33 and with repetition from -0.09 to -0.34: the other criteria now
genuinely move the answer instead of decorating a length ranking. Mean
absolute change was 0.86 points; 289 of 858 aliyot did not move at all.

## Reworking gotchas around what actually trips readers up

The measurement pass above left gotchas as the weakest criterion: 80% of the
average score came from the parsha-category baseline, only 20% from anything
found in the aliyah's own text. Two specific flaws showed up on inspection.

**Ketiv/Qere was scored as presence, not count.** Any number of formal
Ketiv/Qere instances produced a flat +1, so Ki Teitzei's 3rd aliyah -- which
has **seven** -- ranked level with an aliyah that has one. 44 aliyot carry
two or more.

**The two look-alike flavours were pooled.** A one-letter ו/י near-miss
counted exactly as much as a same-letters-different-nekudot pair, even
though the second is the strictly worse case: on an unvocalised scroll there
is nothing at all to tell those two words apart, whereas a ו/י difference is
visible if you look.

Both are now fixed by pooling every measured signal into one weighted bump
instead of several independent ones, using counts rather than presence:

| Signal | Weight each |
|---|---|
| Identical consonants, different nekudot | 2.0 |
| Rare cantillation mark (shalshelet / yerach ben yomo / merkha kefula) | 2.0 |
| הוא/הִיא and formal Ketiv/Qere | 1.5 |
| One internal ו/י apart | 0.5 |
| Dense run of unfamiliar proper names | up to 1.5 |

**Numbers were considered and rejected.** Census figures and offering counts
look like an obvious fumble source, but 15 of the 20 most number-dense
aliyot already score 8+ on measured formulaicity -- the number-heavy
passages simply *are* the repeated lists. Number words themselves (שלשה,
מאות, אלף) are common and easy to read; the real risk is losing your place
in the formula, which the Nasso and Sukkot hidden-challenge notes already
cover. Adding a numbers signal would have double-counted formulaicity.

**Proper names were added.** Hebrew doesn't capitalise and no
part-of-speech data ships with the text, so names are found structurally:
words that repeatedly sit right after a trigger like בן, ארץ, הר or ויחנו.
The lexicon comes to 595 forms and ranks Masei 2 (the 42 journey stations)
first, then Pinchas 2 (the tribal census) and Vayishlach 7 (Eisav's
genealogy) -- while Kedoshim 2 and Mishpatim 2 sit near the bottom, as they
should. It deliberately misses מצרים and אהרן: both are far too frequent to
clear the ratio test, and nobody fumbles "Egypt" or "Aaron." Correlation
with the existing word-rarity score is only 0.22, so it adds genuinely new
information rather than re-counting rare words.

**Then a ranking failure showed up, and the combination rule had to change.**
Adding a capped bump to the category baseline looked reasonable but produced
an order nobody would defend. Raw measured points run from 0 to 15.25 while
the bump was capped at 5, so everything above 8 points collapsed together and
the baseline -- a 6-point swing driven purely by parsha category -- decided
the ranking:

| Aliyah | Measured points | Old gotchas |
|---|---|---|
| Vayishlach 5 | **15.25** | 9 |
| Toldot 5 | 12.00 | **7** |
| Ha'azinu 3 | **4.50** | **10** |

Ha'azinu 3 has barely a third of Vayishlach 5's measured signal and outscored
it, because POETRY carries a baseline of 8 and NARRATIVE carries 2.

The fix is to take the **maximum** of the two rather than their sum. Gotchas
has two genuinely independent sources -- textual traps we can measure, and
contextual risks we cannot (the Tochacha read-quiet custom, a two-column
poetic layout, a reading that comes round once a year). An aliyah is risky if
*either* is high, so the score should follow whichever dominates rather than
accumulating unrelated things. Hand overrides still add on top, since those
encode a risk additional to both. Raw points are mapped to 0-10 by a fixed
ladder, deliberately not percentile-ranked: at 34% zeros they would hit the
same zero-inflation trap documented for pair counts above.

**Result.** Gotchas now tracks the measured signal monotonically at the top
(15.25 pts -> 10, 12.25 -> 9, 12.00 -> 9, 10.00 -> 8), and its correlation
with measured points rose from 0.39 to 0.57. Ceiling saturation fell from 12
aliyot pinned at 10 to 4. The share of aliyot with no measured signal at all
fell from 39% to 25%. Gotchas' own spread narrowed (sd 1.80 to 1.37) because
the max rule stops unrelated signals stacking, but the final score's spread
is essentially unchanged (1.89 to 1.86) -- the ordering got better without
costing any discriminating power overall.

Re'eh's 3rd aliyah -- the reading that prompted this line of work -- lands at
gotchas 8 with 8.25 measured points. An earlier draft of this document
claimed it was the highest in the Torah; that was wrong. It was one of twelve
aliyot tied at the old ceiling, and under the corrected rule Vayishlach 5 is
the genuine top on measured signal.

## Category tags were leaking difficulty onto aliyot that hadn't earned it

Two content-profile tags carried a high hidden-challenge baseline that
applied to every aliyah in the parsha, whether or not the thing the tag
described was actually present in that aliyah.

**POETRY (baseline 8, now 3).** Across all 56 poetry-tagged aliyot, raw
measured gotcha points average **2.42** -- against **2.48** for everything
else. Statistically indistinguishable: the tag was adding difficulty that
nothing in the text supports. Worse, it was counting the same fact three
times. A Song is hard because of its melody and layout, which trope already
carries via `tropeFloor: 9`, and because of its words, which the measured
vocabulary score already carries. Ha'azinu aliyot 5 and 6 had **zero**
measured gotcha points and were scoring 9.

**TOCHACHA (baseline 8, now 5).** The Tochacha is one aliyah in Bechukotai
and two in Ki Tavo, but the parsha-level tag inflated all 14. Bechukotai's
7th aliyah has zero measured gotcha points and was scoring 7 purely by
association with curses several aliyot away.

In both cases the underlying risk is real but *local*, so its weight moved
onto the specific aliyot as an explicit override: +2 for reading Shirat
Ha'azinu from a two-column layout, +5 for the read-fast-and-quiet Tochacha
custom. The readings that should be hard are unchanged -- Bechukotai 3 and
Ki Tavo 6 both still score 10 -- while their neighbours fall back to the
ordinary baseline. Ha'azinu drops from 9 to 5 on gotchas and keeps its 9 on
trope, which is where the melody belongs.

The general lesson, now applied three times in this document: a parsha-level
tag should describe something true of *every* aliyah it touches. Where it
describes a specific passage, it belongs in an override.

## Haftarot are scored, weighted down 30% rather than banded onto their own scale

Haftarot get the same treatment as Torah readings with one structural
difference: **a haftarah is chanted from a printed, vocalized text.** The
nekudot and the trope marks are both on the page. That removes at a stroke
the single largest source of leining risk -- guessing the vowels on an
unpointed scroll, same-letters-different-nekudot pairs, unmarked
Ketiv/Qere -- so the entire gotchas criterion, 20% of the Torah score, simply
does not apply and is not computed. Errors are also less halachically
fraught, and it is one continuous passage read by one person.

What still varies, and is measured from the real text of Nevi'im:

| Criterion | Weight |
|---|---|
| Length (words) | 40% |
| Vocabulary (rarity + pronunciation) | 30% |
| Trope (uncommon-mark density) | 20% |
| Repetition | 10% |

Vocabulary carries more weight here than in Torah reading (30% against 10%):
with the pointing supplied, what is actually left to trip over is unfamiliar
and hard-to-pronounce words.

**Length is ranked against other haftarot, not Torah aliyot.** Haftarot run
far longer on average -- median 324 words against 195 for a parsha aliyah --
so ranking a haftarah's word count against the Torah aliyot pool made nearly
every haftarah come back as "one of the longest in the leining" regardless of
how it actually compares to other haftarot. The Length sub-score is
percentile-ranked against the 61 haftarot themselves.

**Rarity is measured against a Torah + Nevi'im corpus** (223,091 tokens, 26
books), not the Torah alone. Judging prophetic vocabulary against the Chumash
by itself would make perfectly ordinary Nevi'im words look far rarer than
they functionally are to someone who reads haftarot.

**Not a separate 1-7 scale.** The final score is computed on the exact same
1-10 anchor as every Torah reading (the ordinary-parsha-aliyot raw range --
see "What the 1-10 scale is actually relative to", below), then weighted down
by a flat 30%. There is no separate ceiling constant and no "out of 7"
caveat anywhere on the page -- the badge, its color and its label are
produced by the same code path as a Torah score, so a haftarah score is
directly comparable at a glance rather than needing translation. The 30%
discount reflects that haftarah trope is a genuinely separate melody that has
to be learned on its own, Nevi'im vocabulary is harder than Chumash, and
haftarot are not short (Shirat Devorah, in Beshalach, runs to 744 words) --
so a hard haftarah is a real undertaking, just capped short of the hardest
Torah reading in the dataset.

Result: 61 haftarot, ashkenazi reading, ranging from 1.3 (Vayakhel, Balak,
Chukat-Balak) to 6.1 (Beshalach / Shirat Devorah, 52 verses), mean 3.6.
Bereshit, Sh'lach and Behar round out the hardest four. Sefardi and Chabad
variants are stored in `haftarot.json` but not yet scored.

## What the 1-10 scale is actually relative to

Worth stating plainly, because it is not obvious from the numbers. Every
final score is rescaled against a pool of **858 readings**, and less than
half of those are ordinary Shabbat parsha aliyot:

| Pool member | Count | Median words |
|---|---|---|
| Individual-parsha aliyot | 427 | 195 |
| Chag / fast / Rosh Chodesh / special Shabbat | 431 | 65 |

There are more holiday entries than parsha aliyot, and they are three times
shorter. The 7 combined parshiot additionally re-score the same verses as
their components, so some text is counted twice.

**This has now been changed.** The anchor is the **427 numbered aliyot of the
54 ordinary parshiot** and nothing else. Combined parshiot, chagim and maftir
are all still scored -- they are simply measured against the ordinary-Shabbat
scale rather than helping to set it. A short special reading now correctly
lands low instead of dragging the floor of the scale down to meet it, and a
"5" means the same thing wherever it appears.

Ordinary parsha aliyot now span a true 1-10 (mean 5.28). Chag and special
readings land at mean 3.11, and parsha maftir -- which on an ordinary Shabbat
re-reads the last few verses of aliyah 7 -- at mean 2.40. Maftir is excluded
from the anchor for that reason, but is now scored and displayed, which it
previously was not: all 53 parsha maftir readings were computed in
`word-difficulty.json` and then silently dropped before scoring, so ordinary
maftirs were missing from the app while special ones (Shekalim, Zachor,
Parah, HaChodesh, Rosh Chodesh, Chanukah) were present as chag entries.

One consequence worth noting: because the anchor no longer spans the shortest
readings in the dataset, a reading can fall below the anchor floor. Those are
clamped to 1 rather than allowed to go lower -- the scale is 1-10 by
definition.

Haftarot are measured against this same anchor too (see "Haftarot are scored,
weighted down 30%", above), then discounted 30% -- so they never help set the
scale, and a haftarah's raw position on it is what gets weighted down, not a
score computed on some other basis.

## Known limitations / where to improve this next

- The hidden-challenge baseline is still assigned at the whole-parsha level
  and blended, so it is **not** independently verified against the exact
  verse ranges of every aliyah, and can be slightly off at an aliyah
  boundary. Length, vocabulary, trope and repetition no longer have this
  problem -- they are measured per-aliyah from the text.
- Special melodies and scroll layouts (Az Yashir, ta'am elyon, Ha'azinu)
  are inherently invisible to text measurement and remain hand-maintained.
  The list is short and stable, but it is a list someone has to remember to
  update.
- Karnei parah, traditionally taught alongside yerach ben yomo at Num 35:5,
  does not appear as its own codepoint in this source text, so it is listed
  in the tier table but never actually matches.
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
