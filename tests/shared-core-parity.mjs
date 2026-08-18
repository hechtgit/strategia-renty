import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  ADVISER_SIMULATION_PROFILE,
  PUBLIC_HISTORICAL_PROFILE,
  adviserSimulation,
  blockBootstrapPaths,
  computePlan,
  historicalResilience,
  summarizePlan,
  survivesHistoricalPath,
} from "../shared/renta-core.js";

const master = fs.readFileSync(new URL("../cara-zivota-master.html", import.meta.url), "utf8");
const START = "/* JADRO:ZAČIATOK";
const END = "/* JADRO:KONIEC */";
const start = master.indexOf(START);
const end = master.indexOf(END, start);
assert.ok(start >= 0 && end > start, "Chýba pôvodné verejné jadro.");
const legacyCore = master.slice(start, end + END.length);
const resultHtml = fs.readFileSync(new URL("../vysledok.html", import.meta.url), "utf8");
const historicalStart = resultHtml.indexOf("const HIST_OD=");
const historicalEnd = resultHtml.indexOf("/* ===== rozmiestnenie na čiare =====", historicalStart);
assert.ok(historicalStart >= 0 && historicalEnd > historicalStart,
  "Chýba pôvodný historický blok.");
const legacyHistoricalCore = resultHtml.slice(historicalStart, historicalEnd);

const defaults = {
  now: 50, start: 65, end: 90, rent: 3000, existing: 600000, combo: 100000,
  sit: "build", mode: "lump", goal: "rent", pension: "temporary",
  vynos: 8.3, vynosRent: 4, infl: 3, infl_on: 1,
};
const cases = [
  ["štandardný jednorazový vklad", {}],
  ["pravidelné investovanie", { now: 35, start: 65, rent: 5000, mode: "monthly", vynos: 7 }],
  ["kombinovaný vklad", { now: 45, start: 60, end: 85, rent: 4200, mode: "combo", combo: 250000 }],
  ["hotový majetok a výška renty", { now: 60, start: 65, existing: 1000000, sit: "have" }],
  ["hotový majetok a dĺžka čerpania", { now: 60, start: 65, existing: 1000000, sit: "have", goal: "duration", rent: 4000 }],
  ["renta bez časového obmedzenia", { now: 45, start: 65, vynos: 8, infl: 2, pension: "perpetuity" }],
  ["okamžité čerpanie", { now: 65, start: 65, end: 90, vynos: 6, infl: 2 }],
  ["bez inflácie", { infl_on: 0, infl: 7 }],
];

function legacy(params) {
  const search = "?" + new URLSearchParams(params).toString();
  const context = vm.createContext({
    URLSearchParams,
    location: { search, protocol: "https:", origin: "https://example.test", pathname: "/" },
    console,
  });
  vm.runInContext(legacyCore + "\n;globalThis.__out={S,compute,prehladCiastok};", context);
  return context.__out;
}

function legacyHistorical(params) {
  const search = "?" + new URLSearchParams(params).toString();
  const context = vm.createContext({
    URLSearchParams,
    location: { search, protocol: "https:", origin: "https://example.test", pathname: "/" },
    console,
  });
  vm.runInContext(legacyCore + "\n" + legacyHistoricalCore +
    "\n;globalThis.__out={S,compute,refDrahy,prezilo};", context);
  return context.__out;
}

function scenario(params) {
  return {
    nowAge: params.now,
    startAge: params.start,
    endAge: params.end,
    rentToday: params.rent,
    existingCapital: params.existing,
    initialCapital: params.combo,
    situation: params.sit,
    funding: params.mode,
    goal: params.goal,
    pension: params.pension,
    buildReturn: params.vynos,
    /* Klientske jadro má od oddelenia fáz vlastný výnos pre čerpanie. Parita
       ho musí preniesť, inak by porovnávala dva rôzne scenáre a tichu prešla. */
    drawReturn: params.vynosRent,
    inflationRate: params.infl,
    inflationOn: Boolean(Number(params.infl_on)),
    entryFee: 1.5,
    managementFee: 0.9,
  };
}

function close(actual, expected, label, tolerance = 2e-8) {
  const scale = Math.max(1, Math.abs(actual ?? 0), Math.abs(expected ?? 0));
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= scale * tolerance,
    `${label}: ${actual} != ${expected}`);
}

for (const [name, override] of cases) {
  const params = { ...defaults, ...override };
  const before = legacy(params);
  const oldPlan = before.compute();
  const next = computePlan(scenario(params));
  assert.equal(Boolean(next.warn), Boolean(oldPlan.warn), `${name}: warning`);
  for (const key of ["N", "Nm", "T", "Tm", "R", "cap", "P0", "M", "avail", "months"]) {
    if (oldPlan[key] !== undefined) close(next[key], oldPlan[key], `${name}: ${key}`);
  }
  assert.equal(Boolean(next.nek), Boolean(oldPlan.nek), `${name}: nek`);
  assert.equal(Boolean(next.forever), Boolean(oldPlan.forever), `${name}: forever`);
  const oldSummary = before.prehladCiastok();
  const nextSummary = summarizePlan(next);
  if (oldSummary && !oldSummary.nekonecne) {
    close(nextSummary.contributions, oldSummary.vklady, `${name}: contributions`);
    close(nextSummary.paid, oldSummary.vyplatene, `${name}: paid`);
  }
  console.log("OK public parity:", name);
}

const dataset = JSON.parse(fs.readFileSync(
  new URL("../data/msci-world-eur-annual.json", import.meta.url), "utf8"));
const standard = scenario(defaults);
const resilience = historicalResilience(standard, dataset.vynosy);
assert.equal(resilience.runs, 800);
/* Referenčné hodnoty platia pre Swiss Life konverziu sadzieb ((výnos−poplatok)/12,
   jednorazový vklad ročne). Pri prechode na dvanástu odmocninu boli 460 a 735 305 —
   ak sa tieto čísla znovu pohnú, znamená to, že sa zmenila metodika, nie dáta. */
assert.equal(resilience.base, 445);
close(resilience.levels[0].contribution, 738866.2199395514, "600/800", 2e-6);
const oldHistorical = legacyHistorical(defaults);
const oldPlan = oldHistorical.compute();
const oldPaths = oldHistorical.refDrahy(
  Math.ceil(oldPlan.Nm / 12), Math.ceil(oldPlan.Tm / 12));
const newPlan = computePlan(standard);
const newPaths = blockBootstrapPaths({
  seriesByAsset: { accumulation: dataset.vynosy },
  years: Math.ceil(newPlan.Nm / 12),
  runs: PUBLIC_HISTORICAL_PROFILE.runs,
  blockYears: PUBLIC_HISTORICAL_PROFILE.blockYears,
  seed: PUBLIC_HISTORICAL_PROFILE.seed,
  seedStride: PUBLIC_HISTORICAL_PROFILE.seedStride,
});
assert.equal(oldPaths.length, newPaths.length);
for (let index = 0; index < oldPaths.length; index += 1) {
  const oldFactors = [...oldPaths[index].a];
  const newFactors = newPaths[index].accumulation.map(value => 1 + value);
  assert.deepEqual(newFactors, oldFactors, "Dráha " + index + " sa zmenila.");
  const before = oldHistorical.prezilo(oldPaths[index], oldPlan, 1);
  const after = survivesHistoricalPath(
    newPaths[index], newPlan, 1, PUBLIC_HISTORICAL_PROFILE.drawReturnNet);
  assert.equal(after, before, "Verdikt dráhy " + index + " sa zmenil.");
}
close(resilience.levels[1].contribution, 1120516.6151849062, "720/800", 2e-6);

const identical = blockBootstrapPaths({
  seriesByAsset: { a: dataset.vynosy, b: dataset.vynosy },
  years: 20,
  runs: 3,
  blockYears: PUBLIC_HISTORICAL_PROFILE.blockYears,
  seed: PUBLIC_HISTORICAL_PROFILE.seed,
  seedStride: PUBLIC_HISTORICAL_PROFILE.seedStride,
});
for (const path of identical) assert.deepEqual(path.a, path.b,
  "Aktíva s rovnakými dátami musia používať rovnaké časové bloky.");

const repeatedA = blockBootstrapPaths({
  seriesByAsset: { a: dataset.vynosy }, years: 20, runs: 3,
});
const repeatedB = blockBootstrapPaths({
  seriesByAsset: { a: dataset.vynosy }, years: 20, runs: 3,
});
assert.deepEqual(repeatedA, repeatedB, "Bootstrap musí byť deterministický.");

const adviserFactors = dataset.vynosy.map(value => 1 + value);
const adviserA = adviserSimulation(newPlan, {
  accumulationFactors: adviserFactors,
  drawdownFactors: adviserFactors,
});
const adviserB = adviserSimulation(newPlan, {
  accumulationFactors: adviserFactors,
  drawdownFactors: adviserFactors,
});
assert.deepEqual(adviserA, adviserB,
  "Poradenská simulácia musí byť deterministická pri rovnakom profile.");
assert.equal(adviserA.runs, 800);
assert.equal(adviserA.blockYears, 5);
assert.equal(adviserA.circularBlocks, true);
assert.equal(adviserA.profileId, ADVISER_SIMULATION_PROFILE.id);
assert.equal(adviserA.profileVersion, ADVISER_SIMULATION_PROFILE.version);
assert.equal(adviserA.coverageQuantile, 0.90);
assert.equal(adviserA.coverageCount, 720,
  "90 % hranica znamená 720 z 800 simulácií, nie počet platných behov.");
assert.equal(adviserA.p10.length, newPlan.Nm + newPlan.payM + 1);
assert.ok(adviserA.p90.at(-1) >= adviserA.p50.at(-1));
assert.ok(adviserA.p50.at(-1) >= adviserA.p10.at(-1));
const circularProbe = blockBootstrapPaths({
  seriesByAsset: { a: [0, 1, 2, 3, 4, 5] },
  years: 5,
  runs: 50,
  blockYears: 3,
  circular: true,
});
assert.ok(circularProbe.some(path => path.a.some((value, index) =>
  index > 0 && path.a[index - 1] === 5 && value === 0)),
"Kruhový bootstrap musí vedieť plynulo prejsť cez hranicu datasetu.");

console.log("PASS shared core: public parity 8/8, all 800 historical paths and verdicts, aligned blocks, deterministic adviser simulation.");
