import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const files = {
  landing: read("cara-zivota-master.html") + read("renta-flow-10of10.js"),
  result: read("vysledok-master.html") + read("vysledok-10of10.js"),
  pdf: read("pdf-alternativa.js"),
  email: read("boldem-email-10of10.md"),
  builtLanding: read("cara-zivota.html"),
  builtResult: read("vysledok.html")
};

const errors = [];
const comparable = value => value.replace(/\u00a0/g, " ");
const must = (channel, phrase) => {
  if (!comparable(files[channel]).includes(comparable(phrase))) errors.push(`${channel}: chýba „${phrase}“`);
};
const forbid = (channel, phrase) => {
  if (comparable(files[channel]).includes(comparable(phrase))) errors.push(`${channel}: zostalo zakázané „${phrase}“`);
};

must("landing", "rentu chcete čerpať");
must("landing", "metódy Monte Carlo");
must("landing", "800 simulovaných priebehov");
for (const channel of ["result", "email"]) must(channel, "vopred zvolený koniec čerpania");
for (const channel of ["result", "email"]) must(channel, "800 modelovaných simuláci");
must("pdf", "modelovanej simulácii");
must("landing", "Kam vám máme poslať odkaz na modeláciu?");
must("landing", "Modelácia sa vám otvorí okamžite");
must("result", "Majetok pokryl všetky plánované výplaty");
must("result", "nie odhad pravdepodobnosti budúceho úspechu");
must("pdf", "Simulácie vznikajú metódou Monte Carlo");
must("pdf", "minulá výkonnosť nie je spoľahlivým ukazovateľom budúcich výsledkov");
must("email", "Nie je odhadom pravdepodobnosti ani predpoveďou");
must("email", "Capital Market Assumptions, CMA");
must("landing", "renta-boldem.renta-relay.workers.dev");
must("landing", "JSON.stringify({meno:first,priezvisko:last,email,scenar:scenarioUrl");
for (const key of ["now", "start", "end", "rent", "existing", "combo", "infl", "vynos", "sit", "mode", "goal", "pension"]) {
  must("landing", key);
  must("result", key);
}
must("landing", "infl_on");
must("builtResult", "infl_on");

for (const channel of ["landing", "result", "builtLanding", "builtResult"]) {
  forbid(channel, "Váš plán v historických obdobiach vydržal");
  forbid(channel, "Aby vydržali v");
  forbid(channel, "Aplikácia za vás žiadny výnos nepredpokladá");
  forbid(channel, "Prejsť scenár na konzultácii");
  forbid(channel, "by váš majetok nebolo potrebné vyčerpať");
}
forbid("result", "Uvedené sumy nie sú odporúčaná výška investície");
forbid("result", "z 800 z 800");

must("builtLanding", "renta-flow-10of10.js?v=20260816-2");
must("builtLanding", "dist/renta-core.browser.js?v=20260821a");
must("builtLanding", "dist/renta-data.browser.js?v=20260821a");
must("builtLanding", "sprievodca.css?v=20260821a");
must("builtLanding", "sprievodca.js?v=20260821a");
must("builtResult", "vysledok-10of10.js?v=20260821a");
must("builtResult", "jspdf.min.js?v=20260821a");
must("builtResult", "pdf-font.js?v=20260821a");
must("builtResult", "pdf.js?v=20260821a");
must("builtResult", "pdf-alternativa.js?v=20260821a");

/* Každý lokálny meniteľný asset musí mať cache-buster. Inak môže klient po
   nasadení na desať minút skombinovať novú stránku so starým skriptom. */
for (const [channel, source] of [["builtLanding", files.builtLanding], ["builtResult", files.builtResult]]) {
  const refs = [...source.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
    .map(m => m[1])
    .concat([...source.matchAll(/nacitaj\(["']([^"']+\.js(?:\?[^"']*)?)["']\)/g)].map(m => m[1]));
  for (const ref of refs) {
    if (/^(?:https?:)?\/\//.test(ref)) continue;
    if (!/[?&]v=/.test(ref)) errors.push(`${channel}: lokálny asset bez cache-busteru „${ref}“`);
  }
}
must("result", "id=\"model-kicker\"");
must("builtResult", "id=\"model-kicker\"");
must("result", "NEPLATNE_MENA");
must("builtResult", "NEPLATNE_MENA");
forbid("result", "id=\"pre-koho\"");
forbid("builtResult", "id=\"pre-koho\"");
forbid("result", "Pripravené pre:");
forbid("builtResult", "Pripravené pre:");
for (const channel of ["landing", "result", "pdf", "email", "builtLanding", "builtResult"]) {
  forbid(channel, "skúš");
}

if (errors.length) {
  console.error(errors.map(e => `CHYBA ${e}`).join("\n"));
  process.exit(1);
}

console.log("OK konzistencia landing → výsledok → PDF → e-mail");
console.log("OK scenárová podmienka, terminológia, metodika, CTA a build väzby");
