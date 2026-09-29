#!/usr/bin/env node
/* Kontroly balíka opráv pred kampaňou (29. 9. 2026) nad skutočným kódom:
   klientske jadro z mastera, jadro modelácie, zdieľané jadro pásu a vrstva
   priameho zadávania. Čísla sa overujú výpočtom, nie výskytom reťazcov.
   Prehliadačový test (obrazovka 390/1440 px, rám v Squarespace, text PDF)
   je v tests/e2e_balik.py. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { advisoryOutlook, computePlan } from "../shared/renta-core.js";

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const master = read("cara-zivota-master.html");
const START = "/* JADRO:ZAČIATOK", END = "/* JADRO:KONIEC */";
const core = master.slice(master.indexOf(START), master.indexOf(END) + END.length);
const result = read("vysledok.html");
const histStart = result.indexOf("const HIST_OD=");
const histEnd = result.indexOf("/* ===== rozmiestnenie na čiare =====", histStart);
const historical = result.slice(histStart, histEnd);
const data = JSON.parse(read("data/msci-world-eur-annual.json"));

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; };

function klient(params) {
  const context = vm.createContext({
    URLSearchParams, console,
    location: { search: "?" + new URLSearchParams(params), protocol: "https:",
      origin: "https://hechtgit.github.io", pathname: "/strategia-renty/cara-zivota.html" },
  });
  vm.runInContext(core + "\n" + historical
    + "\n;globalThis.__o={S,compute,koniecRenty,platnyVysledok,sadzbyPlanu,vetaPoplatkov,"
    + "prehladCiastok,refDrahy,obstalo,testOdolnosti};", context);
  return context.__o;
}

/* Rovnaký preklad scenára, aký robí pás v aplikácii (funkcia scenar()). */
function scenarPasu(S) {
  return { nowAge: S.now, startAge: S.start, endAge: S.end, rentToday: S.rent,
    existingCapital: S.existing, initialCapital: S.combo, situation: S.sit,
    funding: S.mode, goal: S.goal, pension: S.pension,
    comboDirection: S.comboDir, monthlyKnown: S.monthlyKnown,
    inflationOn: S.inflOn, inflationRate: S.infl,
    buildReturn: S.vynos, drawReturn: S.vynosRent, entryFee: 1.5, managementFee: 0.9 };
}
const pas = S => {
  const plan = computePlan(scenarPasu(S));
  const v = advisoryOutlook(plan, data.vynosy);
  return Math.round(v.successRate * v.runs);
};

/* ——— bod 6: 0,8 / 0,9 / 1,0 % v oboch vetvách (pravidelne aj kombinácia) ——— */
for (const mode of ["monthly", "combo"]) {
  const M = {};
  for (const vynos of [0.8, 0.9, 1.0]) {
    const k = klient({ now: 40, start: 60, end: 85, rent: 2000, mode, combo: 50000,
      vynos, vynosRent: 5, infl: 3, infl_on: 1, sit: "build", pension: "temporary" });
    const o = k.compute();
    ok(Number.isFinite(o.M) && o.M > 0, `${mode} ${vynos} %: mesačná suma nie je platné číslo (${o.M})`);
    ok(k.platnyVysledok(o), `${mode} ${vynos} %: výsledok musí byť platný`);
    const plan = computePlan(scenarPasu(k.S));
    ok(Math.abs(plan.M - o.M) <= Math.max(1, o.M) * 1e-9,
      `${mode} ${vynos} %: klientske jadro ${o.M} ≠ zdieľané ${plan.M}`);
    M[vynos] = o.M;
  }
  ok(M[0.8] > M[0.9] && M[0.9] > M[1.0],
    `${mode}: pri vyššom zhodnotení musí mesačná suma klesať (${M[0.8]}, ${M[0.9]}, ${M[1.0]})`);
}
/* Neplatný výsledok nesmie prejsť (varovanie jadra). */
{
  const k = klient({ now: 40, start: 60, end: 90, rent: 3000, vynos: 5, vynosRent: 4,
    infl: 5, infl_on: 1, pension: "perpetuity" });
  ok(k.compute().warn && !k.platnyVysledok(k.compute()), "varovanie jadra musí zneplatniť výsledok");
}

/* ——— bod 3: vypočítaný koniec renty (58 / 62, 600 000 €, 3 000 €/mes., 5/5 %, 3 %) ——— */
{
  const k = klient({ now: 58, start: 62, end: 90, rent: 3000, existing: 600000, sit: "have",
    goal: "duration", vynos: 5, vynosRent: 5, infl: 3, infl_on: 1, pension: "temporary" });
  const o = k.compute();
  ok(o.months === 233, `„ako dlho vydrží": čakalo sa 233 mesiacov, vyšlo ${o.months}`);
  const koniec = k.koniecRenty(o);
  ok(koniec.derived && koniec.endEff === 81 && !koniec.openEnd,
    `koniec renty musí byť vypočítaný vek 81, nie ${koniec.endEff}`);
  ok(k.S.end === 90, "vstup jazdca ostáva 90 — výstupy ho nesmú ukazovať");
}

/* ——— bod 3b: vypočítaná nevyčerpateľná renta (mám + ako dlho + navždy) ——— */
{
  const k = klient({ now: 58, start: 62, end: 90, rent: 1000, existing: 600000, sit: "have",
    goal: "duration", vynos: 5, vynosRent: 5, infl: 0, infl_on: 0, pension: "temporary" });
  const o = k.compute();
  ok(o.forever === true, "renta 1 000 € bez inflácie z 600 000 € sa nevyčerpá");
  const koniec = k.koniecRenty(o);
  ok(koniec.openEnd, "nevyčerpateľná renta nemá koniec");
  const c = k.prehladCiastok();
  ok(c && c.nekonecne === true && c.vyplatene === undefined,
    "súhrn nevyčerpateľnej renty nesmie mať konečný súčet výplat");
  ok(k.testOdolnosti() === null, "historický test sa pri „ako dlho vydrží“ nerobí");
}

/* ——— bod 2 a 7: sadzby pred poplatkom a po ňom, vstupný poplatok pri „mám“ ——— */
{
  const k = klient({ now: 35, start: 55, end: 90, rent: 3000, vynos: 8, vynosRent: 4 });
  const s = k.sadzbyPlanu();
  ok(s.budovanie === 8 && s.cerpanie === 4 && s.budovanieCiste === 7.1 && s.cerpanieCiste === 3.1
    && s.sprava === 0.9 && s.vstupny === 1.5, "8/4 % musí byť 7,1/3,1 % po poplatku za správu");
  ok(/vstupného poplatku 1,5/.test(k.vetaPoplatkov()), "pri budovaní sa uvádza vstupný poplatok");
  const m = klient({ now: 58, start: 62, end: 90, existing: 600000, sit: "have", vynos: 5, vynosRent: 5 });
  ok(m.sadzbyPlanu().vstupny === 0, "pri „majetok už mám“ sa vstupný poplatok neúčtuje");
  ok(/nevzťahuje/.test(m.vetaPoplatkov()) && !/vstupného poplatku 1,5/.test(m.vetaPoplatkov()),
    "text pri „majetok už mám“ nesmie tvrdiť, že sa odpočíta vstupný poplatok");
}

/* ——— bod 4: pás hodnotí zadaný plán aj pri „poznám mesačnú sumu“ ——— */
{
  const params = { now: 45, start: 60, end: 85, rent: 3000, combo: 200000, monthlyKnown: 500,
    mode: "combo", comboDir: "known", sit: "build", vynos: 5, vynosRent: 5, infl: 2.5,
    infl_on: 1, pension: "temporary" };
  const k = klient(params);
  const o = k.compute();
  const plan = computePlan(scenarPasu(k.S));
  ok(plan.calculatesRent && Math.abs(plan.M - 500) < 1e-9 && Math.abs(plan.P0 - 200000) < 1e-9,
    `zdieľané jadro musí hodnotiť zadaných 500 €/mes., nie ${plan.M}`);
  ok(Math.abs(plan.R - o.R) <= o.R * 1e-9 && Math.abs(plan.cap - o.cap) <= o.cap * 1e-9,
    "renta aj kapitál zdieľaného jadra sa musia zhodovať s klientskym jadrom");
  const modelacia = k.testOdolnosti().zaklad;
  const aplikacia = pas(k.S);
  ok(aplikacia === modelacia, `pás aplikácie ${aplikacia} ≠ modelácia ${modelacia}`);
  ok(aplikacia !== 588, "pás už nesmie hodnotiť dopočítaný mesačný vklad (historicky 588)");
  console.log(`  pás pri známej mesačnej sume: ${aplikacia} z 800 (modelácia ${modelacia})`);
}
/* Zhoda pásu a modelácie aj v ostatných režimoch (prepínanie režimov). */
for (const extra of [
  { mode: "lump" }, { mode: "monthly" }, { mode: "combo", comboDir: "needed", combo: 150000 },
  { mode: "combo", comboDir: "known", combo: 100000, monthlyKnown: 1200 },
  { sit: "have", existing: 900000, goal: "rent" },
]) {
  const k = klient({ now: 45, start: 60, end: 88, rent: 2500, vynos: 6, vynosRent: 5, infl: 3,
    infl_on: 1, pension: "temporary", sit: "build", ...extra });
  const od = k.testOdolnosti();
  ok(od && pas(k.S) === od.zaklad, `pás ≠ modelácia pre ${JSON.stringify(extra)}`);
}

/* ——— bod 6: priame zadávanie „250.000“ € a „0.900“ % ——— */
{
  const improvements = read("vylepsenia.js");
  const i = improvements.indexOf("const cislo = (t, jed) => {");
  const j = improvements.indexOf("\n  };", i) + 4;
  ok(i > 0 && j > i, "vo vrstve priameho zadávania chýba parser s jednotkou");
  const cislo = vm.runInNewContext(`(${improvements.slice(i + "const cislo = ".length, j)})`);
  const pripady = [
    ["250.000", "€", 250000], ["1.250.000", "€", 1250000], ["1.000,50", "€", 1000.5],
    ["250 000 €", "€", 250000], ["250,000", "€", 250000], ["3 000", "€", 3000],
    ["0.900", "%", 0.9], ["0,9", "%", 0.9], ["2,5 %", "%", 2.5], ["4.1", "%", 4.1],
    ["abc", "€", null],
  ];
  for (const [vstup, jed, cakane] of pripady) {
    ok(cislo(vstup, jed) === cakane, `„${vstup}“ (${jed}) → ${cislo(vstup, jed)}, čakalo sa ${cakane}`);
  }
}

/* ——— bod 6: ?poradca sa na verejnej adrese ignoruje ——— */
{
  const a = master.indexOf("const PUBLIC_HOST=");
  const b = master.indexOf("if(PORADCA)document.body.classList.add('poradca');", a);
  const kod = master.slice(a, b).split("\n")
    .filter(r => /^\s*const (PUBLIC_HOST|qs|PORADCA)=/.test(r)).join("\n");
  const rezim = (hostname, search) => vm.runInNewContext(kod + ";PORADCA",
    { location: { hostname, search, hash: "" } });
  ok(rezim("hechtgit.github.io", "?poradca") === false, "?poradca na GitHub Pages nesmie odomknúť poradcu");
  ok(rezim("www.hechtberger.com", "?poradca=1") === false, "?poradca na webe nesmie odomknúť poradcu");
  ok(rezim("127.0.0.1", "") === true, "lokálna kópia ostáva poradenská");
  ok(rezim("127.0.0.1", "?verejna") === false, "?verejna lokálne vypne poradcu");
}

/* ——— nasadzované súbory zodpovedajú mastrom (a prehliadačové jadro zdieľanému) ———
   Oprava v masteri bez nového zostavenia by na web nikdy nedošla. */
{
  const py = [
    "import sys; sys.path.insert(0, '.'); import zostav, json",
    "a = zostav.zostav(zostav.MASTER)",
    "v = zostav.zostav_vysledok(zostav.vystrihni_jadro(zostav.MASTER.read_text(encoding='utf-8')))",
    "print(json.dumps({'app': a == zostav.VYSTUP.read_text(encoding='utf-8'),"
      + " 'vysledok': v == zostav.VYSLEDOK.read_text(encoding='utf-8')}))",
  ].join("\n");
  const zhoda = JSON.parse(execFileSync("python3", ["-c", py],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" }));
  ok(zhoda.app, "cara-zivota.html nezodpovedá masteru — spusti python3 zostav.py");
  ok(zhoda.vysledok, "vysledok.html nezodpovedá masteru — spusti python3 zostav.py");
  const zdroj = read("shared/renta-core.js");
  const hash = (await import("node:crypto")).createHash("sha256").update(zdroj).digest("hex");
  ok(read("dist/renta-core.browser.js").includes(`sha256:${hash}`),
    "dist/renta-core.browser.js nie je zostavené z aktuálneho shared/renta-core.js");
}

console.log(`OK balík pred kampaňou: ${passed} kontrol`);
