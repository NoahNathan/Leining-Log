import { el } from '../util.js';

const RUBRIC_URL = 'https://github.com/NoahNathan/Leining-Log/blob/main/data/difficulty-rubric.md';

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
    el('strong', {}, 'starting heuristic'),
    ', not a scientific measurement of how hard a real person will find a real aliyah -- a rule-based estimate meant to be tuned over time, ideally against real feedback from gabbaim and baalei korei.',
  ]));

  container.append(section('The five ingredients',
    p('Every aliyah gets a score from 1-10 on each of five criteria, which then blend into one final difficulty score:'),
    el('ul', { class: 'plain-list' }, [
      el('li', {}, [el('strong', {}, 'Length'), ' -- how many verses, ranked against every aliyah in the Torah. The single longest aliyah scores 10; the single shortest scores about 1.']),
      el('li', {}, [el('strong', {}, 'Vocabulary'), ' -- computed from the actual Hebrew words: how rarely each one appears elsewhere in the Torah, and how tricky it is to pronounce (guttural letters, reduced vowels, and the like). Not a guess -- see "Vocabulary" below.']),
      el('li', {}, [el('strong', {}, 'Trope'), ' -- how often unusual cantillation shows up, and whether the passage uses a special melody (like the elevated system for the Aseret HaDibrot or Az Yashir).']),
      el('li', {}, [el('strong', {}, 'Repetition'), ' -- how formulaic the text is. This ', el('em', {}, 'lowers'), ' difficulty: once you have the template (e.g. the 12 near-identical Nesiim gifts in Nasso), each repeat is easier than the same length of genuinely new text.']),
      el('li', {}, [el('strong', {}, 'Gotchas'), ' -- easy-to-fumble details the other four criteria don\'t capture: rare trope marks (like the shalshelet, used only 4 times in the whole Torah), passages customarily read quietly, or text that\'s only read once a year with little chance to practice.']),
    ]),
  ));

  container.append(section('Length counts for half the final score',
    p('The formula:'),
    el('pre', { class: 'formula-box' }, 'final = (4 x length + vocabulary + trope + repetition + gotchas) / 8'),
    p('Length alone carries as much weight as the other four criteria combined. A long, plain-vocabulary aliyah is still a bigger undertaking than a short, tricky one -- and raw length is the most reliable, least subjective predictor available.'),
  ));

  container.append(section('Vocabulary is measured, not guessed',
    p('Every word in every aliyah is checked against the full Masoretic Torah text (~80,000 word tokens across all 5 books) for two real properties:'),
    el('ul', { class: 'plain-list' }, [
      el('li', {}, [el('strong', {}, 'Rarity'), ' -- how many times that exact word appears anywhere else in the Torah. A word occurring hundreds of times is easy, because you\'ve seen it constantly; a word appearing once has nowhere else it could\'ve been practiced.']),
      el('li', {}, [el('strong', {}, 'Pronunciation complexity'), ' -- consonant count, guttural letters, reduced vowels, and dagesh -- concrete, checkable features that correlate with where readers actually stumble.']),
    ]),
    p('The "Rare words" chips shown on each aliyah only include words that occur ', el('strong', {}, 'at most 5 times'), ' across the whole Torah -- a genuine rarity bar, not just "the least-common word in this one aliyah." If nothing in an aliyah clears that bar, no rare words are shown at all.'),
  ));

  container.append(section('Familiarity makes some passages easier',
    p('A handful of passages are recited so often in davening -- twice a day, in some cases -- that most regular attendees already know them by heart: the Shema paragraphs, the Aseret HaDibrot, Birkat Kohanim, and Az Yashir. Their vocabulary and gotcha scores get a discount to reflect that; length and trope are untouched, since the passage is still exactly as long and the special cantillation still has to be learned.'),
  ));

  container.append(section('Combined parshiot and chagim get their own real scores',
    p('The 7 "double" parshiot (like Vayakhel-Pekudei) are scored directly against their actual combined-reading aliyah divisions -- not averaged from the two components, since a combined reading\'s aliyah boundaries land in genuinely different places. Every chag, fast, Rosh Chodesh, and special-Shabbat reading with its own Torah portion is scored the same way, on the same scale, so a chag reading and a weekly parsha aliyah are directly comparable.'),
  ));

  container.append(section('Using the full 1-10 range',
    p('After every aliyah\'s raw score is computed, the whole pool (~918 aliyot across parshiot, combined parshiot, and chagim) is stretched so the single hardest aliyah becomes a real 10 and the single easiest a real 1. This doesn\'t change any aliyah\'s ranking relative to the others -- it just makes sure the full scale is actually in use, rather than everything clustering in the middle.'),
  ));

  container.append(section('Honest limitations',
    el('ul', { class: 'plain-list' }, [
      el('li', {}, 'Trope, repetition, and gotcha scores mostly come from a content-type baseline per parsha (narrative, legal, poetry, etc.), not an independent check of every single aliyah -- vocabulary is the one criterion measured directly from the text.'),
      el('li', {}, 'Word rarity is measured on the exact inflected form (including prefixes like ו-/ב-/ל-), not the underlying root -- so a common root can still register as "rare" in one specific prefixed form.'),
      el('li', {}, '"Difficulty" here means difficulty to prepare and read aloud correctly -- it says nothing about a passage\'s meaning or significance.'),
      el('li', {}, 'No real usage feedback is blended in yet. This is a cold-start heuristic, meant to be corrected by actual leining experience over time.'),
    ]),
  ));

  container.append(el('p', { class: 'muted small' }, [
    'Full technical writeup, including the exact scoring code and revision history: ',
    el('a', { href: RUBRIC_URL, target: '_blank', rel: 'noopener' }, 'difficulty-rubric.md'),
    '.',
  ]));
}
