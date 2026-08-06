# Leining Difficulty Rubric

This document explains how `difficulty-scores.json` was generated. It is a
**starting heuristic**, not a scientific measurement of how hard a real
person will find a real aliyah. Treat it as a seed you tune over time --
ideally by letting gabbaim/baalei korei rate their own aliyot in the app and
blending that feedback in.

> **Revision note:** the original version of this rubric weighted all five
> criteria equally and had no concept of "this text is famous." Both were
> too narrow. This revision (1) makes length the dominant factor in the
> final score, and (2) adds a familiarity discount for passages recited so
> often in davening that most readers already know them by heart (the Shema
> paragraphs, the Aseret HaDibrot, Birkat Kohanim, Az Yashir). Both changes
> are described in detail below.

## The five criteria (each scored 0-10 per aliyah)

1. **Length** -- computed algorithmically from the aliyah's verse count,
   scaled to a 1-10 percentile rank against every aliyah in the Torah (the
   single shortest aliyah scores ~1, the single longest scores 10). This is
   the only criterion that isn't a judgment call, and it now **dominates the
   final score by design** -- see "Weighting" below.
2. **Vocabulary** -- how many rare, technical, or unfamiliar words appear
   (e.g. architectural/textile terms in the Mishkan parshiot, skin-disease
   terminology in Tazria/Metzora, foreign personal/place names).
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
remaining half. This is a deliberate change from the original 1:1:1:1:1
average: raw length is the single most reliable, least subjective predictor
of how hard an aliyah is to prepare and deliver -- a long, plain-vocabulary
aliyah is still a bigger undertaking than a short, tricky one, and the
original equal weighting let a handful of qualitative bumps (a rare trope
mark, a genealogy) outvote a genuinely long reading. If you want to retune
this, it's the `RUBRIC_WEIGHTS` constant in `tools/gen_difficulty.mjs`.

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

This is a starting list, not an exhaustive one -- it only includes passages
with a clear, near-universal liturgical basis (something recited daily or
near-daily), specifically to keep it defensible rather than a matter of
"this parsha feels well-known to me." Candidates for a future pass: Birkat
Kohanim's surrounding verses, the opening of Bereshit (widely known
culturally even if not liturgically recited), or a tunable per-community
list (a congregation that does public Torah study of a given parsha every
year might reasonably mark more of it "familiar").

## How vocab/trope/repetition/hidden were actually assigned

Hand re-deriving pasuk-by-pasuk difficulty for ~430 aliyot from scratch
isn't reliable to do purely from memory, and pretending otherwise would be
dishonest precision. Instead this uses a **two-layer rule system**:

1. **Content-profile baseline** -- every parsha is tagged with one or two
   dominant content types (`NARRATIVE`, `GENEALOGY`, `POETRY`, `LEGAL`,
   `RITUAL`, `TOCHACHA`), each of which has baseline vocab/trope/repetition/
   hidden scores reflecting the *typical* difficulty drivers of that kind of
   content (e.g. `RITUAL` -- Mishkan/korbanot/purity passages -- gets a high
   vocabulary baseline; `POETRY` gets a high trope baseline). Every aliyah in
   that parsha starts from its parsha's blended baseline.
2. **Specific overrides** -- a curated list of well-documented, specific
   difficulty features (Az Yashir, the Aseret HaDibrot, the four shalshelet
   occurrences in the entire Torah, the Nesiim repetitions, the Masei journey
   list, the Tochacha passages, etc.) bump the relevant sub-scores for the
   *exact* aliyah they fall in -- each one checked against this parsha's
   actual verse ranges in `parshiot.json`, not assumed from memory.
3. **Familiarity discounts** (new) -- applied last, on top of the above, for
   the well-known liturgical passages described above.

This means most aliyot in, say, a `RITUAL`-tagged parsha share very similar
scores to each other unless they happen to be one of the specifically
flagged ones -- which is an honest reflection of how much aliyah-level
granularity this method can actually support. See each parsha's `profile`
field and each aliyah's optional `note`/`wellKnown` fields in
`difficulty-scores.json` to see exactly which rule produced which number.

## Known limitations / where to improve this next

- The content-profile tags are assigned at the whole-parsha level, then
  blended; they are **not** independently verified against the exact verse
  ranges of every aliyah, so a profile tag can be slightly off at an aliyah
  boundary.
- Only ~19 specific override rules and 7 familiarity discounts are encoded.
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
- No real usage/feedback data has been incorporated -- this is a cold-start
  heuristic, meant to be replaced or blended with real ratings once the app
  has users.
