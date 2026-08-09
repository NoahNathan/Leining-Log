import { el } from '../util.js';

function section(title, ...children) {
  return el('div', { class: 'card subcard howitworks-section' }, [el('h3', {}, title), ...children]);
}
function p(...children) {
  return el('p', {}, children);
}

export async function renderHowItWorks(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, 'How the difficulty score works'),
    p('A plain-language walkthrough of where the numbers on this site come from.'),
  ]));

  container.append(el('div', { class: 'notice' }, [
    'This is a ',
    el('strong', {}, 'starting estimate'),
    ', not a scientific measurement of how hard a real person will find a real aliyah. Treat every score as a helpful guide, not gospel.',
  ]));

  container.append(section('The five ingredients',
    p('Every aliyah gets a score from 1-10 on each of five things, which then blend into one overall difficulty score:'),
    el('ul', { class: 'plain-list' }, [
      el('li', {}, [el('strong', {}, 'Length'), ' -- how many ', el('em', {}, 'words'), ', not verses. The longest aliyah in the Torah scores a 10; the shortest scores about a 1.']),
      el('li', {}, [el('strong', {}, 'Vocabulary'), ' -- how unusual the actual words are, and how tricky they are to pronounce. Measured from the real text, not guessed.']),
      el('li', {}, [el('strong', {}, 'Trope'), ' -- how many genuinely uncommon cantillation marks the passage actually contains, counted mark by mark, plus whether it uses a special melody (like the Aseret HaDibrot, Az Yashir, or Ha\'azinu).']),
      el('li', {}, [el('strong', {}, 'Repetition'), ' -- how formulaic the text actually is, measured from the words themselves. This ', el('em', {}, 'lowers'), ' difficulty: once you have the pattern down, each repeat is easier than the same amount of brand-new text.']),
      el('li', {}, [el('strong', {}, 'Gotchas'), ' -- easy-to-fumble details the other four don\'t capture. Mostly words that look identical without nikkud but are read differently, and formal Ketiv/Qere; then rare trope marks, dense runs of unfamiliar names, passages customarily read quietly, and text read only once a year with little chance to practice.']),
    ]),
  ));

  container.append(section('Length matters most',
    p('Length alone counts for as much as the other four factors put together: 50% of the score. A long, plain-vocabulary aliyah is still a bigger undertaking than a short, tricky one -- and how long something is remains the single most reliable way to judge how much work it takes to prepare.'),
    p('Length is counted in ', el('strong', {}, 'words, not verses'), ', because verses are not equal units. Across the Torah they run from about 6 to 21 words each -- a three-fold spread. The journey-stations list in Masei, for instance, is 39 verses but only 239 words, while some 5-verse aliyot carry over 100. Counting verses would call the Masei list one of the longest readings in the Torah when by actual text it is middling.'),
    p('Of the remaining 50%, Gotchas gets a bigger share than the rest: 20% of the total score, twice as much as Vocabulary, Trope, or Repetition individually (10% each). Gotchas is weighted higher because it\'s tied to specific, avoidable reading mistakes -- ambiguous spellings and look-alike word pairs -- rather than general unfamiliarity.'),
  ));

  container.append(section('Vocabulary is measured, not guessed',
    p('Every word in every aliyah is checked against the rest of the Torah for two things: how often that same word shows up elsewhere (a word you\'ve seen a hundred times is easy; a word that appears only once has nowhere it could\'ve been practiced), and how tricky it looks to pronounce.'),
    p('The "Rare words" shown on each aliyah are only the ones that genuinely occur a handful of times or fewer in the whole Torah -- not just whatever happens to be the least-common word in that one aliyah. If nothing in an aliyah is truly rare, none are shown.'),
    p('One honest caveat: this checks the ', el('em', {}, 'exact spelling'), ' as written, not the underlying word regardless of spelling. Hebrew sometimes spells the same word two different ways in different places (with or without an extra letter for the vowel sound, like כל vs. כול), which can make a word look slightly rarer than it really is. We looked into automatically merging those variants and deliberately didn\'t ship it -- a first attempt at "ignore extra ו/י letters" ended up wrongly merging real, unrelated words (in one case, the everyday word "will be" with God\'s name), which would have been worse than leaving it alone. Fixing this properly needs real word-by-word grammatical analysis, not a shortcut.'),
  ));

  container.append(section('Words that look the same but aren\'t',
    p('One specific gotcha is also measured straight from the text rather than guessed: words spelled identically without nikkud but read completely differently. There are two sources for this, both read directly out of the real vocalized text:'),
    el('ul', { class: 'plain-list' }, [
      el('li', {}, [el('strong', {}, 'The archaic הוא/הִיא spelling'), ' -- the Torah spells the feminine pronoun "hi" (she) the same as the masculine "hu" (he), both הוא, distinguished only by the niqqud.']),
      el('li', {}, [el('strong', {}, 'Formal Ketiv/Qere'), ' -- the ~70 places in the Chumash where the Torah scroll\'s actual written letters differ from what\'s traditionally read aloud, by long-standing Masoretic tradition.']),
    ]),
    p('When one of these shows up in an aliyah, it adds a small bump to that aliyah\'s Gotchas score, and the specific word(s) are shown in the "why" breakdown.'),
  ));

  container.append(section('Look-alike word pairs count toward the score',
    p('The actual public reading is done from a Torah scroll with no nikkud at all, so two genuinely different words that look identical or nearly identical without nikkud are a real, easy way to misread. Two flavors, worse to less bad:'),
    el('ul', { class: 'plain-list' }, [
      el('li', {}, [el('strong', {}, 'Identical letters, different vowels only'), ' -- like אֹתוֹ "him" vs. אִתּוֹ "with him", or לוֹ "to him" vs. לוּ "if only". These are 100% indistinguishable on the actual scroll. Restricted to a short, hand-checked list of real word pairs rather than auto-detected -- an automatic version was tested and came back over 90% false positives (ordinary grammar, like a dagesh appearing or not, not real ambiguity).']),
      el('li', {}, [el('strong', {}, 'One letter apart'), ' -- like עד "until" vs. עוד "still", or בן "son" vs. בין "between".']),
    ]),
    p('When an aliyah has any of these pairs, up to 3 are shown in the "why" breakdown as a heads-up (identical-spelling pairs first, since they\'re the more severe kind).'),
    p('The two flavors are no longer weighted the same. An identical-letters pair counts four times as much toward Gotchas as a one-letter-apart pair, because there is genuinely nothing on the parchment to tell the first kind apart, while the second is at least visible if you look. Formal Ketiv/Qere is weighted close to the identical-letters case, and counted rather than just noted -- an aliyah with seven of them now scores well above one with a single instance, which was not true before.'),
    p('For the one-letter-apart flavor, there\'s still no reliable way to tell from spelling alone whether a given pair is truly two different words or just the same root written two different ways, so that part measures density of near-identical spellings, not a confirmed count of real traps.'),
  ));

  container.append(section('Some passages get an easier score because they\'re familiar',
    p('A handful of passages are recited so often in davening -- twice a day, in some cases -- that most regular daveners already know them by heart: the Shema, the Aseret HaDibrot, Birkat Kohanim, and Az Yashir. Their vocabulary and gotcha scores are eased to reflect that. Length and trope are left alone, since the passage is still just as long and the special melody still has to be learned.'),
  ));

  container.append(section('Double parshiot and holidays are scored for real',
    p('The 7 "double" parshiot (like Vayakhel-Pekudei) are scored against their actual combined-reading aliyah divisions, not averaged from the two separate parshiot. Every holiday, fast day, Rosh Chodesh, and special Shabbat with its own Torah reading is scored the same way, on the same scale, so any two readings on this site can be fairly compared.'),
  ));

  container.append(section('Scores use the full range',
    p('Once every aliyah has a raw score, the whole set is stretched so the single hardest reading on the site becomes a real 10 and the single easiest becomes a real 1. That keeps the 1-10 scale meaningful instead of everything bunching up in the middle.'),
  ));

  container.append(section('Where this falls short',
    el('ul', { class: 'plain-list' }, [
      el('li', {}, 'Gotchas is the criterion still leaning most on judgement. Its ambiguous-spelling, look-alike-pair and rare-trope-mark parts are measured directly from the text, but the baseline underneath them still comes from the general character of the parsha, adjusted by hand for things like the Tochacha reading custom.'),
      el('li', {}, 'Length, vocabulary, trope and repetition are now all measured from the actual text of each aliyah rather than inferred from the parsha it sits in. The exception is special melodies -- Az Yashir, the Aseret HaDibrot, Ha\'azinu -- which are set by hand, because a separate tune and an unusual scroll layout leave no trace in the cantillation marks themselves.'),
      el('li', {}, '"Difficulty" here means difficulty to prepare and read aloud -- it says nothing about how meaningful or significant a passage is.'),
      el('li', {}, 'Vocabulary rarity is measured by exact spelling, not by the underlying word -- see "Vocabulary is measured, not guessed" above.'),
    ]),
  ));
}
