#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";

const master = fs.readFileSync(new URL("./cara-zivota-master.html", import.meta.url), "utf8");
const result = fs.readFileSync(new URL("./vysledok.html", import.meta.url), "utf8");
const START = "/* JADRO:ZAČIATOK";
const END = "/* JADRO:KONIEC */";

function coreFrom(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start);
  if (start < 0 || end < 0) throw new Error("Chýbajú značky finančného jadra.");
  return text.slice(start, end + END.length);
}

const core = coreFrom(master);
if (coreFrom(result) !== core) throw new Error("Finančné jadro aplikácie a výsledku nie je totožné.");
const historicalStart = result.indexOf("const HIST_OD=");
const historicalEnd = result.indexOf("/* ===== rozmiestnenie na čiare =====", historicalStart);
if (historicalStart < 0 || historicalEnd < 0) throw new Error("Chýba blok historickej modelácie.");
const historical = result.slice(historicalStart, historicalEnd);

function production(params, withHistorical = false) {
  const search = "?" + new URLSearchParams(params).toString();
  const context = vm.createContext({
    URLSearchParams,
    location: { search, protocol: "https:", origin: "https://example.test", pathname: "/cara-zivota.html" },
    console,
  });
  vm.runInContext(`${core}\n${withHistorical ? historical : ""}\n;globalThis.__audit={S,compute,prehladCiastok,payEnd${withHistorical ? ",testOdolnosti,refDrahy,prezilo,obstalo,nasobokPreMetu,HIST_VYNOSY,HIST_OD,HIST_DO,PRIEBEHOV" : ""}};`, context);
  return context.__audit;
}

function close(actual, expected, label, rel = 1e-8) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > scale * rel) {
    throw new Error(`${label}: ${actual} != ${expected}`);
  }
}

function paymentPv(R, months, i, g) {
  if (Math.abs(i - g) < 1e-12) return R * months / (1 + i);
  return R / (i - g) * (1 - Math.pow((1 + g) / (1 + i), months));
}

function annuityFactor(months, i) {
  if (Math.abs(i) < 1e-12) return months;
  return (Math.pow(1 + i, months) - 1) / i;
}

function simulateMonths(C, R, i, g, limit = 1200) {
  let balance = C;
  let payment = R;
  let months = 0;
  while (balance > 0 && months < limit) {
    balance = balance * (1 + i) - payment;
    payment *= 1 + g;
    months++;
  }
  return months;
}

const defaults = {
  now: 50, start: 65, end: 90, rent: 3000, existing: 600000, combo: 100000, monthlyKnown: 5000,
  sit: "build", mode: "lump", comboDir: "needed", goal: "rent", pension: "temporary",
  vynos: 8.3, infl: 3, infl_on: 1,
};

const cases = [
  ["štandardný jednorazový vklad", {}],
  ["pravidelné investovanie", { now: 35, start: 65, rent: 5000, mode: "monthly", vynos: 7 }],
  ["kombinovaný vklad", { now: 45, start: 60, end: 85, rent: 4200, mode: "combo", combo: 250000 }],
  ["kombinácia so známou pravidelnou investíciou", { now: 35, start: 38, end: 90, mode: "combo", comboDir: "known", combo: 750000, monthlyKnown: 5000 }],
  ["hotový majetok a výška renty", { now: 60, start: 65, existing: 1000000, sit: "have" }],
  ["hotový majetok a dĺžka čerpania", { now: 60, start: 65, existing: 1000000, sit: "have", goal: "duration", rent: 4000 }],
  ["renta bez časového obmedzenia", { now: 45, start: 65, vynos: 8, infl: 2, pension: "perpetuity" }],
  ["okamžité čerpanie", { now: 65, start: 65, end: 90, vynos: 6, infl: 2 }],
  ["bez inflácie", { infl_on: 0, infl: 7 }],
];

for (const [name, override] of cases) {
  const api = production({ ...defaults, ...override });
  const o = api.compute();
  if (o.warn) throw new Error(`${name}: neočakávané varovanie: ${o.warn}`);

  if (!o.nek && api.S.goal === "rent") {
    close(o.cap, paymentPv(o.R, o.Tm, o.i, o.g), `${name}: potrebný kapitál`, 2e-8);
    close(api.payEnd(o.cap, o.R, o.Tm, o.i, o.g), 0, `${name}: konečný zostatok`, 1e-7);
  }

  if (api.S.sit === "build") {
    let accumulated;
    if (o.immediate || api.S.mode === "lump") accumulated = o.P0 * o.e * Math.pow(1 + o.i, o.Nm);
    else if (api.S.mode === "monthly") accumulated = o.M * o.e * annuityFactor(o.Nm, o.i);
    else accumulated = api.S.combo * o.e * Math.pow(1 + o.i, o.Nm) + o.M * o.e * annuityFactor(o.Nm, o.i);
    close(accumulated, o.cap, `${name}: akumulácia`, 2e-8);
  } else {
    close(o.avail, api.S.existing * Math.pow(1 + o.i, o.Nm), `${name}: zhodnotenie hotového majetku`);
    if (api.S.goal === "duration" && !o.forever) {
      const independentMonths = simulateMonths(o.avail, o.R, o.i, o.g);
      if (independentMonths !== o.months) throw new Error(`${name}: počet mesiacov ${o.months} != ${independentMonths}`);
    }
  }

  if (o.nek) {
    close(o.R, o.cap * (o.i - o.g), `${name}: rastúca perpetuita`);
  }

  const summary = api.prehladCiastok();
  if (!summary) throw new Error(`${name}: chýba súhrn`);
  if (!summary.nekonecne) {
    const payout = Math.abs(o.g) < 1e-12
      ? o.R * o.Tm
      : o.R * (Math.pow(1 + o.g, o.Tm) - 1) / o.g;
    close(summary.vyplatene, payout, `${name}: objem vyplatenej renty`);
  }

  console.log(`OK  ${name}`);
}

console.log(`\nFinančné jadro: ${cases.length}/${cases.length} scenárov prešlo.`);

const knownComboApi = production({
  ...defaults, now: 35, start: 38, end: 90, mode: "combo",
  comboDir: "known", combo: 750000, monthlyKnown: 5000,
});
const knownCombo = knownComboApi.compute();
close(knownCombo.cap, 1110315.8919389392, "známa kombinácia: kapitál");
close(knownCombo.Rtoday, 3967.1939554147643, "známa kombinácia: renta v dnešnej hodnote");
if (!knownCombo.calculatesRent) throw new Error("Známa kombinácia neprepla smer výpočtu na rentu.");

let transitionCapital = 750000 * knownCombo.e;
for (let month = 0; month < knownCombo.Nm; month++) {
  transitionCapital = transitionCapital * (1 + knownCombo.i) + 5000 * knownCombo.e;
}
close(transitionCapital, knownCombo.cap,
  "známa kombinácia: posledný mesiac budovania bez posunu");
const firstDrawBalance = knownCombo.cap * (1 + knownCombo.i) - knownCombo.R;
close(knownComboApi.payEnd(knownCombo.cap, knownCombo.R, 1, knownCombo.i, knownCombo.g), firstDrawBalance,
  "známa kombinácia: prvý mesiac čerpania", 1e-12);

const legacyCombo = production({
  now: 45, start: 60, end: 85, rent: 4200, existing: 600000, combo: 250000,
  sit: "build", mode: "combo", goal: "rent", pension: "temporary",
  vynos: 8.3, infl: 3, infl_on: 1,
}).compute();
if (legacyCombo.calculatesRent || legacyCombo.M <= 0) {
  throw new Error("Starý kombinovaný odkaz bez nových parametrov nezachoval pôvodný smer výpočtu.");
}

const clamped = production({
  ...defaults, now: -10, start: 999, end: 0, rent: 999999, existing: -1,
  combo: 999999999, monthlyKnown: 999999, infl: 99, vynos: 999
});
/* `end` je zastropovaný na 120 — rovnaký horizont, aký kreslí časová os —
   a `start` o rok nižšie, aby koniec čerpania mal kam nasadnúť.
   Modelácia dostáva jadro z mastera aplikácie, takže obe strany kapú rovnako. */
const expectedClamp = { now: 18, start: 119, end: 120, rent: 50000, existing: 50000, combo: 10000000, monthlyKnown: 100000, infl: 10, vynos: 50 };
Object.entries(expectedClamp).forEach(([key, expected]) => {
  if (clamped.S[key] !== expected) throw new Error(`Ochrana vstupu ${key}: ${clamped.S[key]} != ${expected}`);
});

/* Ručne upravený odkaz nesmie vyrobiť záporné obdobie čerpania. Predtým prešiel
   `start` za koniec osi, takže vznikol scenár s rentou
   „za 0 €", ktorý vyzeral ako náš oficiálny výstup. */
[
  { now: 35, start: 130, end: 120 },
  { now: 35, start: 999, end: 0 },
  { now: 99, start: 99, end: 99 },
].forEach(params => {
  const api = production({ ...defaults, ...params });
  const s = api.S;
  if (!(s.now <= s.start && s.start < s.end && s.end <= 120)) {
    throw new Error(`Neplatný odkaz prešiel: now=${s.now} start=${s.start} end=${s.end}`);
  }
  const o = api.compute();
  if (!(o.T > 0)) throw new Error(`Odkaz vyrobil nekladné obdobie čerpania: T=${o.T}`);
});

/* Súčet vyplatenej renty pri otázke „ako dlho vydrží". Dĺžku čerpania tam určuje
   výpočet, nie jazdec — predtým sa sčítal horizont jazdca a suma bola násobne
   vyššia než skutočnosť, a to isté číslo išlo do modelácie aj do PDF. */
const duration = production({
  ...defaults, sit: "have", goal: "duration", existing: 400000, now: 50, start: 55,
  end: 90, rent: 4000, vynos: 5, infl: 3, infl_on: "1",
});
const durationCore = duration.compute();
const durationSummary = duration.prehladCiastok();
if (!Number.isFinite(durationCore.months)) throw new Error("Scenár „ako dlho vydrží\" nedopočítal mesiace.");
if (durationSummary.mesiacov !== durationCore.months) {
  throw new Error(`Súčet renty použil zlý horizont: ${durationSummary.mesiacov} != ${durationCore.months}`);
}
const g = durationCore.g;
const expectedPaid = Math.abs(g) < 1e-12
  ? durationCore.R * durationCore.months
  : durationCore.R * (Math.pow(1 + g, durationCore.months) - 1) / g;
close(durationSummary.vyplatene, expectedPaid, "objem vyplatenej renty pri odvodenej dĺžke", 1e-9);
/* Vyplatiť sa nedá násobne viac, než koľko kapitál uniesol. */
if (durationSummary.vyplatene > durationCore.avail * 3) {
  throw new Error("Objem vyplatenej renty je neprimeraný voči dostupnému kapitálu.");
}

/* Strop veku 120 musí platiť rovnako v aplikácii aj v modelácii — inak sa
   kanály v krajnom scenári rozídu na štítku „Plánovaný horizont". */
const appSource = fs.readFileSync(new URL("./cara-zivota.html", import.meta.url), "utf8");
[["aplikácia", appSource], ["modelácia", result]].forEach(([name, text]) => {
  if (!text.includes(":Math.min(120,Math.max(S.start+1,Math.round(S.now+o.N+(o.months||0)/12)));")) {
    throw new Error(`Odvodený horizont v kanáli „${name}" nie je zastropovaný na 120.`);
  }
});

const impossiblePerpetuity = production({ ...defaults, pension: "perpetuity", vynos: 3, infl: 5 }).compute();
if (!impossiblePerpetuity.warn || !impossiblePerpetuity.warn.includes("navždy")) {
  throw new Error("Neudržateľná rastúca renta bez časového obmedzenia nemá zrozumiteľné varovanie.");
}

const equalDrawGrowth = production({ ...defaults, infl: 3.084106 }).compute();
if (equalDrawGrowth.warn || !Number.isFinite(equalDrawGrowth.cap)) {
  throw new Error("Výpočet blízko rovnosti mesačného výnosu a rastu renty nie je stabilný.");
}

console.log("Ochrany vstupov, neudržateľná renta bez časového obmedzenia a hraničný výpočet prešli.");

const historyData = JSON.parse(fs.readFileSync(new URL("./data/msci-world-eur-annual.json", import.meta.url), "utf8"));
const historicalApi = production(defaults, true);
if (historicalApi.HIST_OD !== historyData.obdobie[0] || historicalApi.HIST_DO !== historyData.obdobie[1]) {
  throw new Error("Obdobie historických dát v kóde sa nezhoduje s dátovým súborom.");
}
if (JSON.stringify([...historicalApi.HIST_VYNOSY]) !== JSON.stringify(historyData.vynosy)) {
  throw new Error("Historické výnosy v kóde sa nezhodujú s dátovým súborom.");
}

const resilience = historicalApi.testOdolnosti();
if (!resilience || resilience.priebehov !== 800 || resilience.zaklad !== 268) {
  throw new Error(`Neočakávaný výsledok referenčného testu: ${JSON.stringify(resilience)}`);
}
const expectedThresholds = [735305, 1115116];
resilience.urovne.forEach((level, index) => {
  close(level.vklad, expectedThresholds[index], `hranica ${level.meta}/800`, 2e-6);
});

const standard = historicalApi.compute();
const paths = historicalApi.refDrahy(Math.ceil(standard.Nm / 12), Math.ceil(standard.Tm / 12));
let previous = -1;
for (const multiplier of [0.5, 0.75, 1, 1.5, 2, 3, 4]) {
  const survived = historicalApi.obstalo(paths, standard, multiplier);
  if (survived < previous) throw new Error("Počet úspešných priebehov s vyšším vkladom klesol.");
  previous = survived;
}
resilience.urovne.forEach(level => {
  const atThreshold = historicalApi.obstalo(paths, standard, level.nasobok);
  const justBelow = historicalApi.obstalo(paths, standard, level.nasobok * (1 - 1e-7));
  if (atThreshold < level.meta || justBelow >= level.meta) {
    throw new Error(`Binárne hľadanie hranice ${level.meta}/800 nie je tesné.`);
  }
});

const immediateHistory = production({ ...defaults, now: 65, start: 65 }, true).testOdolnosti();
if (!immediateHistory || ![0, 800].includes(immediateHistory.zaklad)) {
  throw new Error("Pri okamžitom čerpaní nemajú mať modelované priebehy rozdielnu akumulačnú fázu.");
}

console.log("Historická modelácia: dáta, reprodukovateľnosť, monotónnosť a hranice 600/800 a 720/800 prešli.");
