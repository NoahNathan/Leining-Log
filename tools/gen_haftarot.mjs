import { getLeyningForParsha } from '@hebcal/leyning';
import { writeFileSync } from 'fs';

const ALL = [
 "Bereshit","Noach","Lech-Lecha","Vayera","Chayei Sara","Toldot","Vayetzei","Vayishlach",
 "Vayeshev","Miketz","Vayigash","Vayechi","Shemot","Vaera","Bo","Beshalach","Yitro","Mishpatim",
 "Terumah","Tetzaveh","Ki Tisa","Vayakhel","Pekudei","Vayikra","Tzav","Shmini","Tazria","Metzora",
 "Achrei Mot","Kedoshim","Emor","Behar","Bechukotai","Bamidbar","Nasso","Beha'alotcha","Sh'lach",
 "Korach","Chukat","Balak","Pinchas","Matot","Masei","Devarim","Vaetchanan","Eikev","Re'eh",
 "Shoftim","Ki Teitzei","Ki Tavo","Nitzavim","Vayeilech","Ha'azinu","Vezot Haberakhah",
 "Vayakhel-Pekudei","Tazria-Metzora","Achrei Mot-Kedoshim","Behar-Bechukotai",
 "Chukat-Balak","Matot-Masei","Nitzavim-Vayeilech"
];

// Some haftarot (Shemot, Yitro, Mishpatim, Tzav, Masei/Matot-Masei) are read
// as two non-adjacent excerpts -- @hebcal/leyning represents those as an
// array of citations rather than one, so cite() must handle both shapes.
function cite(h) {
  if (!h) return null;
  if (Array.isArray(h)) return h.map(cite);
  return { book: h.k, start: h.b, end: h.e, verses: h.v };
}
function citeKey(v) {
  // stable string form for equality-checking single citations OR arrays of them
  if (!v) return '';
  return (Array.isArray(v) ? v : [v]).map(p => `${p.book} ${p.start}-${p.end}`).join('; ');
}

const haftarot = ALL.map(name => {
  const r = getLeyningForParsha(name);
  const ashkenazi = cite(r.haft);
  const sefardi = r.seph ? cite(r.seph) : null;
  const chabad = r.chabad ? cite(r.chabad) : null;
  const differsFromAshkenazi = (v) => v && ashkenazi && citeKey(v) !== citeKey(ashkenazi);
  return {
    id: name,
    parsha: r.name.en,
    nusach: {
      ashkenazi,
      sefardi: sefardi ?? { sameAs: 'ashkenazi' },
      chabad: chabad ? (differsFromAshkenazi(chabad) ? chabad : { sameAs: 'ashkenazi' }) : { sameAs: 'ashkenazi' },
    },
    variesByNusach: differsFromAshkenazi(sefardi) || differsFromAshkenazi(chabad),
  };
});

writeFileSync('../data/haftarot.json', JSON.stringify({
  description: "Haftarah readings for the annual (fullkriyah) Shabbat Torah-reading cycle, split by nusach where customs differ. 'ashkenazi' is the default/most common custom; 'sefardi' covers Sephardic and Edot HaMizrach communities; 'chabad' covers the Chabad-Lubavitch (Nusach Ari/Sefard) tradition specifically. Most Chassidic 'Sefard'-nusach shuls that are not Chabad follow the Ashkenazi haftarah custom unless noted otherwise locally. Italian (Italki) and Yemenite (Baladi/Shami) haftarah customs are NOT yet populated here -- they differ from all three of the above in a number of parshiot and would need a dedicated source to add reliably; treat their absence as a known gap, not as 'same as Ashkenazi'.",
  source: "@hebcal/leyning v10.0.0 (getLeyningForParsha: haft/seph/chabad fields)",
  knownGaps: ["Italian (Italki) nusach", "Yemenite Baladi nusach", "Yemenite Shami nusach"],
  generatedAt: new Date().toISOString(),
  count: haftarot.length,
  haftarot
}, null, 2));

console.log('Wrote', haftarot.length, 'haftarot entries');
console.log('Entries where nusach varies:', haftarot.filter(h=>h.variesByNusach).map(h=>h.id));
