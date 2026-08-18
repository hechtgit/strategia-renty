#!/usr/bin/env node
/* Testy poradenského CMA pohľadu.

   Ťažisko nie je v tom, či sa čísla vypočítajú, ale v tom, že sa nedá porušiť
   metodická hranica: CMA smie ovplyvniť výhradne fázu budovania majetku a od
   prvého mesiaca čerpania musí platiť pevný plánovací predpoklad. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  advisoryOutlook,
  historicalResilience,
  cmaPlan,
  computePlan,
  monthlyNetRate,
  PLANNING_DRAWDOWN_RETURN,
  PUBLIC_HISTORICAL_PROFILE,
} from "../shared/renta-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cmaRaw = fs.readFileSync(path.join(root, "data", "cma-assumptions.json"), "utf8");
const CMA = JSON.parse(cmaRaw);
const app = fs.readFileSync(path.join(root, "cara-zivota.html"), "utf8");
const result = fs.readFileSync(path.join(root, "vysledok.html"), "utf8");

const zaklad = {
  nowAge: 35, startAge: 55, endAge: 90, rentToday: 3000,
  situation: "build", funding: "lump", goal: "rent", pension: "temporary",
  inflationOn: true, inflationRate: 3, buildReturn: 8.3,
};
const ok = [];
const test = (nazov, fn) => { fn(); ok.push(nazov); };

/* 1. CMA ovplyvňuje iba akumuláciu. */
test("CMA mení iba akumulačnú sadzbu", () => {
  const p = cmaPlan(zaklad, CMA);
  assert.equal(p.iA, monthlyNetRate(CMA.accumulationReturn, p.scenario.managementFee),
    "akumulácia nepoužila CMA výnos");
  /* Poplatky sa riešia iba v akumulácii — vo výplatnej fáze už nie. */
  assert.ok(p.iA < monthlyNetRate(CMA.accumulationReturn, 0),
    "v akumulácii sa neodpočítal správcovský poplatok");
  assert.notEqual(p.iA, p.i, "akumulácia a čerpanie majú rovnakú sadzbu");
});

/* 2. Od prvého mesiaca čerpania vždy presne plánovací predpoklad. */
test("čerpanie vždy na pevnom predpoklade", () => {
  for (const vynos of [3, 6.3, 12, 25]) {
    const p = cmaPlan(zaklad, { ...CMA, accumulationReturn: vynos });
    /* 4 % sú tvrdý ČISTÝ výnos: po odpočte poplatku musí vyjsť presne 4 %,
       nie menej. Preto sa porovnáva s čistou sadzbou, nie s monthlyNetRate. */
    const ciste = PLANNING_DRAWDOWN_RETURN / 1200;
    assert.ok(Math.abs(p.i - ciste) < 1e-15,
      `pri CMA ${vynos} % sa čerpanie odchýlilo od čistých ${PLANNING_DRAWDOWN_RETURN} %`);
  }
});

/* CMA sa nesmie dať prepašovať do čerpania ani cez konfiguráciu, ani cez scenár. */
test("iný výnos pri čerpaní je odmietnutý", () => {
  assert.throws(() => cmaPlan(zaklad, { ...CMA, drawdownReturn: 6 }), /čerpani/i);
});
test("scenár nevie prebiť výnos pri čerpaní", () => {
  const p = cmaPlan({ ...zaklad, drawReturn: 11 }, CMA);
  const ciste = PLANNING_DRAWDOWN_RETURN / 1200;
  assert.ok(Math.abs(p.i - ciste) < 1e-15, "scenár prebil výnos pri čerpaní");
});

/* 3. Pri nulovej akumulácii CMA výsledok vôbec neovplyvní. */
test("bez akumulácie je CMA bez vplyvu", () => {
  const hned = { ...zaklad, nowAge: 55, startAge: 55 };
  const a = cmaPlan(hned, { ...CMA, accumulationReturn: 2 });
  const b = cmaPlan(hned, { ...CMA, accumulationReturn: 20 });
  assert.equal(a.Nm, 0, "scenár nemá nulovú akumuláciu");
  assert.equal(a.cap, b.cap);
  assert.equal(a.P0, b.P0);
});

/* 4. Rovnaká verzia a rovnaký vstup dajú reprodukovateľný výsledok. */
test("rovnaký vstup je reprodukovateľný", () => {
  const a = cmaPlan(zaklad, CMA), b = cmaPlan(zaklad, CMA);
  assert.deepEqual(a.cma, b.cma);
  for (const kluc of ["cap", "P0", "M", "R", "i", "iA"]) assert.equal(a[kluc], b[kluc]);
  assert.equal(a.cma.version, CMA.version);
});

/* 5. Hodnoty, názvy a zdroje pochádzajú z jediného konfiguračného zdroja. */
test("stránka nesie presne konfiguráciu zo zdroja", () => {
  const m = app.match(/<script id="cma-config" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, "v zostavenej stránke chýba vložená CMA konfigurácia");
  const vlozene = JSON.parse(m[1].replace(/<\\\//g, "</"));
  assert.deepEqual(vlozene, CMA, "vložená konfigurácia sa rozišla so zdrojom");
});
test("výnos nie je zadrôtovaný v stránke ani v jadre", () => {
  const jadro = fs.readFileSync(path.join(root, "shared", "renta-core.js"), "utf8");
  assert.equal(jadro.includes(String(CMA.accumulationReturn)), false,
    "CMA výnos sa dostal priamo do jadra");
  /* Mimo konfiguračnej značky smú byť iba odkazy na vlastnosti (CMA.accumulationReturn),
     nikdy nie samotné hodnoty — inak by sa dali zmeniť na jednom mieste a na druhom nie. */
  const bezKonfiguracie = app.replace(
    /<script id="cma-config"[\s\S]*?<\/script>/, "");
  assert.equal(bezKonfiguracie.includes(CMA.version), false,
    "verzia CMA je v stránke zapísaná aj mimo konfigurácie");
  const cislo = String(CMA.accumulationReturn).replace(".", "\\.");
  assert.equal(new RegExp(`(?<![\\d.])${cislo}(?![\\d])`).test(bezKonfiguracie), false,
    "CMA výnos je v stránke zadrôtovaný mimo konfigurácie");
  assert.equal(/["']accumulationReturn["']\s*:/.test(bezKonfiguracie), false,
    "v stránke je druhá kópia CMA predpokladov");
});

/* Plánovací predpoklad čerpania musí byť naprieč kanálmi jedno číslo. */
test("4 % platia rovnako v jadre, historickom pohľade aj konfigurácii", () => {
  assert.equal(PUBLIC_HISTORICAL_PROFILE.drawReturnNet, PLANNING_DRAWDOWN_RETURN);
  assert.equal(Number(CMA.drawdownReturn), PLANNING_DRAWDOWN_RETURN);
  assert.ok(result.includes(`const REF_CERPANIE=${PLANNING_DRAWDOWN_RETURN};`),
    "modelácia používa iný plánovací predpoklad než jadro");
});

/* 6. CMA ovládanie sa nezobrazí v klientskej verzii. */
test("klient CMA nevidí a nenačíta", () => {
  assert.ok(/<section class="assumptions-block cma-block" id="cma-block"[^>]*\shidden>/.test(app),
    "CMA sekcia nie je v zostavenej stránke skrytá");
  assert.ok(app.includes("if(!PORADCA)return;"),
    "chýba brána, ktorá poradenský kód zastaví v klientskej verzii");
  assert.equal(/<script[^>]+src="dist\/renta-core\.browser\.js"/.test(app), false,
    "poradenské jadro sa načítava staticky, teda aj klientovi");
  const brana = app.match(/const PUBLIC_HOST=([^\n]+)/);
  assert.ok(brana && /hechtberger\\?\.com/.test(brana[1]) && /hechtgit/.test(brana[1]),
    "brána nechráni produkčné domény");
});

/* Poradenská verzia nezobrazuje akvizičnú časť, klientska si ju ponecháva. */
test("akvizičná časť je skrytá iba poradcovi", () => {
  assert.ok(app.includes("body.poradca .flow-options,body.poradca .bottom-flow{display:none}"),
    "chýba pravidlo, ktoré poradcovi skryje odovzdanie modelácie a konzultáciu");
  assert.ok(app.includes("document.body.classList.add('poradca');"),
    "poradenský režim si nenastavuje vlastnú triedu");
  /* Sekcie musia v stránke fyzicky zostať — klient ich potrebuje. */
  assert.ok(app.includes('class="flow-options"'), "akvizičný blok zo stránky zmizol");
  assert.ok(app.includes('class="bottom-flow"'), "blok s modeláciou a konzultáciou zmizol");
  const pred = app.indexOf("document.body.classList.add('poradca');");
  const brana = app.indexOf("if(!PORADCA)return;");
  assert.ok(brana > 0 && pred > brana,
    "trieda sa nastavuje pred bránou, teda by ju dostal aj klient");
});

/* 7. + 11. Historická metodika a 800 ciest zostávajú nedotknuté. */
test("historický profil sa nezmenil", () => {
  assert.equal(PUBLIC_HISTORICAL_PROFILE.runs, 800);
  assert.equal(PUBLIC_HISTORICAL_PROFILE.blockYears, 5);
  assert.equal(PUBLIC_HISTORICAL_PROFILE.seed, 1234);
  assert.deepEqual(PUBLIC_HISTORICAL_PROFILE.thresholds, [600, 720]);
});

/* 8. Klientsky vlastný výnos zostáva bez zmeny. */
test("klientsky plán CMA neovplyvní", () => {
  const pred = computePlan(zaklad);
  cmaPlan(zaklad, CMA);
  const po = computePlan(zaklad);
  assert.deepEqual(po, pred, "výpočet klientskeho plánu sa po CMA zmenil");
  assert.equal(pred.i, monthlyNetRate(zaklad.buildReturn, pred.scenario.managementFee),
    "klientsky plán prestal používať vlastný výnos v oboch fázach");
});
test("cmaPlan nemutuje vstupný scenár", () => {
  const vstup = { ...zaklad };
  cmaPlan(vstup, CMA);
  assert.deepEqual(vstup, zaklad);
});

/* 9. Inflácia, poplatky, okamžité čerpanie a renta bez konca. */
test("inflácia, poplatky, okamžité čerpanie a renta bez konca", () => {
  const bezInflacie = cmaPlan({ ...zaklad, inflationOn: false }, CMA);
  const sInflaciou = cmaPlan(zaklad, CMA);
  assert.ok(bezInflacie.cap < sInflaciou.cap, "inflácia nezvýšila potrebný kapitál");

  const drahsi = cmaPlan({ ...zaklad, managementFee: 2 }, CMA);
  assert.ok(drahsi.P0 > sInflaciou.P0, "vyšší poplatok nezvýšil potrebnú investíciu");
  const bezVstupneho = cmaPlan({ ...zaklad, entryFee: 0 }, CMA);
  assert.ok(bezVstupneho.P0 < sInflaciou.P0, "vstupný poplatok sa neprejavil");

  const hned = cmaPlan({ ...zaklad, nowAge: 55 }, CMA);
  assert.equal(hned.immediate, true);
  assert.ok(hned.P0 > 0 && Number.isFinite(hned.P0));

  const navzdy = cmaPlan({ ...zaklad, pension: "perpetuity" }, CMA);
  assert.equal(navzdy.nek, true);
  assert.ok(Number.isFinite(navzdy.cap) && navzdy.cap > 0,
    "renta bez konca nedopočítala kapitál");
});

/* 12. Build sa nesmie vrátiť k duplicitám. */
test("v zostavenej stránke je CMA práve raz", () => {
  assert.equal((app.match(/id="cma-block"/g) || []).length, 1);
  assert.equal((app.match(/id="cma-config"/g) || []).length, 1);
  assert.equal(app.includes("/* CMA:KONFIGURACIA */"), false,
    "v zostavenej stránke zostala nenaplnená značka");
});

/* ===== Odolnosť plánu: poctivá metrika a krivka prežitia ===== */
const historia = JSON.parse(fs.readFileSync(
  path.join(root, "data", "msci-world-eur-annual.json"), "utf8"));
const vynosy = historia.vynosy || historia.returns;

test("advisoryOutlook vždy čerpá pevným predpokladom", () => {
  const plan = computePlan(zaklad);
  const v = advisoryOutlook(plan, vynosy);
  assert.equal(v.drawdownReturn, PLANNING_DRAWDOWN_RETURN);
  /* Historické výnosy sa do čerpania nesmú dostať ani cez options. */
  const podvrh = advisoryOutlook(plan, vynosy,
    { drawdownFactors: vynosy.map(x => 1 + x) });
  assert.deepEqual(podvrh.survival, v.survival,
    "faktory čerpania sa dali prebiť zvonku");
});

test("krivka prežitia je klesajúca a končí na úspešnosti", () => {
  const plan = computePlan(zaklad);
  const v = advisoryOutlook(plan, vynosy);
  assert.equal(v.survival.length, plan.Nm + plan.payM + 1);
  assert.equal(v.survival[0], 1, "na začiatku musí žiť každý priebeh");
  for (let i = 1; i < v.survival.length; i += 1) {
    assert.ok(v.survival[i] <= v.survival[i - 1] + 1e-12,
      `krivka prežitia stúpla na indexe ${i}`);
  }
  assert.ok(Math.abs(v.survival.at(-1) - v.successRate) < 1e-12,
    "koniec krivky sa nerovná úspešnosti");
});

/* Toto je chyba, kvôli ktorej Codex zablokoval nasadenie: coverageCount je
   konštanta z definície kvantilu, nie počet úspešných behov. */
test("coverageCount sa nesmie vydávať za úspešnosť", () => {
  const kratky = advisoryOutlook(computePlan({ ...zaklad, endAge: 75 }), vynosy);
  const dlhy = advisoryOutlook(computePlan({ ...zaklad, endAge: 110 }), vynosy);
  assert.equal(kratky.coverageCount, dlhy.coverageCount,
    "coverageCount sa mení — potom by predpoklad testu neplatil");
  assert.ok(kratky.successRate > dlhy.successRate,
    "dlhšia renta musí mať nižšiu úspešnosť");
  assert.equal(app.includes("coverageCount"), false,
    "stránka pracuje s coverageCount, ktorý nie je úspešnosť");
  assert.ok(app.includes("v.successRate*v.runs"),
    "stránka nepočíta úspešnosť zo survivalShare");
});

test("odolnosť je oddelená od CMA a varuje priamo v grafe", () => {
  assert.ok(/<section class="assumptions-block cma-block" id="odolnost-block"[^>]*\shidden>/.test(app),
    "sekcia odolnosti nie je skrytá pred klientom");
  assert.ok(app.includes("Simulovaná minulosť, nie predpoveď ani garancia."),
    "v grafe chýba varovanie");
  assert.ok(app.indexOf('id="odolnost-block"') > app.indexOf('id="cma-block"'),
    "historický a výhľadový pohľad nie sú oddelené do dvoch sekcií");
  assert.ok(app.includes("setTimeout(prepocitajOdolnost,300)"),
    "simulácia nie je odložená, pri ťahaní milníka by sekala");
});

test("akčný krok a formálne upozornenie sú na mieste", () => {
  assert.ok(app.includes('id="akcia-out"'), "chýba riadok s akčným krokom");
  assert.ok(app.includes("RentaCore.historicalResilience(scenar(),data)"),
    "akčný krok sa nepočíta klientskou metodikou");
  assert.ok(app.includes("Historické simulácie ani dlhodobé výhľadové predpoklady nie sú"),
    "chýba formálne upozornenie v pätičke");
  assert.ok(app.includes("predpokladaného vstupného poplatku"),
    "poplatky sa neoznačujú ako predpoklad");
  assert.ok(app.includes("u vás môžu byť nižšie aj vyššie"),
    "chýba upozornenie, že poplatky môžu byť iné");
});

/* Poradenská krivka a klientska modelácia musia dať to isté číslo. */
test("obe metodiky hlásia rovnakú úspešnosť", () => {
  const historia = JSON.parse(fs.readFileSync(
    path.join(root, "data", "msci-world-eur-annual.json"), "utf8"));
  const r = historia.vynosy || historia.returns;
  const hr = historicalResilience(zaklad, r);
  const v = advisoryOutlook(computePlan(zaklad), r);
  assert.equal(Math.round(v.successRate * v.runs), hr.base,
    "poradenská krivka sa rozišla s klientskou modeláciou");
});

/* 4 % vo výplatnej fáze sú ČISTÉ — poplatok sa tam už neodpočítava. */
test("poplatok sa vo výplatnej fáze neodpočítava druhýkrát", () => {
  const p = cmaPlan(zaklad, CMA);
  const ciste = PLANNING_DRAWDOWN_RETURN / 1200;
  assert.ok(Math.abs(p.i - ciste) < 1e-15,
    `čerpanie beží na ${((Math.pow(1 + p.i, 12) - 1) * 100).toFixed(2)} % namiesto čistých 4 %`);
});

/* Evidencia zdroja musí zostať v konfigurácii úplná. */
test("konfigurácia nesie úplnú evidenciu zdroja", () => {
  for (const kluc of ["version", "asOf", "sourceName", "sourceUrl", "sourceDocumentUrl",
    "sourceLocation", "assetClass", "currency", "horizonYears", "nominalOrReal",
    "grossOrNet", "returnType", "methodology", "disclaimer"]) {
    assert.ok(CMA[kluc] !== undefined && CMA[kluc] !== "", `chýba evidencia „${kluc}"`);
  }
  assert.equal(CMA.currency, "EUR");
  assert.equal(CMA.nominalOrReal, "nominal");
  assert.equal(CMA.horizonYears.length, 2);
});

console.log(`CMA pohľad: ${ok.length} testov prešlo.`);
ok.forEach(n => console.log(`  OK  ${n}`));
