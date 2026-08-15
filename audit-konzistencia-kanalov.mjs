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
const must = (channel, phrase) => {
  if (!files[channel].includes(phrase)) errors.push(`${channel}: chýba „${phrase}“`);
};
const forbid = (channel, phrase) => {
  if (files[channel].includes(phrase)) errors.push(`${channel}: zostalo zakázané „${phrase}“`);
};

for (const channel of ["landing", "result", "email"]) {
  must(channel, "vopred zvolený koniec čerpania");
}
for (const channel of ["landing", "result", "email"]) {
  must(channel, "800 modelovaných simuláci");
}
must("pdf", "modelované simulácie");
must("landing", "Kam vám máme poslať odkaz na modeláciu?");
must("landing", "Modelácia sa vám otvorí okamžite");
must("result", "Kapitál pokryl všetky plánované výplaty");
must("result", "nie odhad pravdepodobnosti budúceho úspechu");
must("pdf", "novej modelovanej kombinácie");
must("pdf", "Podiel úspešných simulácií nie je odhadom pravdepodobnosti");
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
}
forbid("result", "Uvedené sumy nie sú odporúčaná výška investície");
forbid("result", "z 800 z 800");

must("builtLanding", "renta-flow-10of10.js?v=20260815-3");
must("builtResult", "vysledok-10of10.js?v=20260815-5");
must("builtResult", "pdf-alternativa.js?v=20260815-5");
must("result", "id=\"model-kicker\"");
must("builtResult", "id=\"model-kicker\"");
must("result", "NEPLATNE_MENA");
must("builtResult", "NEPLATNE_MENA");
forbid("result", "id=\"pre-koho\"");
forbid("builtResult", "id=\"pre-koho\"");
forbid("result", "Pripravené pre:");
forbid("builtResult", "Pripravené pre:");
for (const channel of ["landing", "result", "pdf", "email", "builtLanding", "builtResult"]) {
  forbid(channel, "skúšk");
}

if (errors.length) {
  console.error(errors.map(e => `CHYBA ${e}`).join("\n"));
  process.exit(1);
}

console.log("OK konzistencia landing → výsledok → PDF → e-mail");
console.log("OK scenárová podmienka, terminológia, metodika, CTA a build väzby");
