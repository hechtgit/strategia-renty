#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("tmp/pdfs/modelacia-privatnej-renty-audit.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });

const jsPdfModule = await import("./jspdf.min.js");
globalThis.window = globalThis;
globalThis.jspdf = jsPdfModule.default;
await import("./pdf-font.js");

const el = textContent => ({ textContent });
const testItems = [
  el("Vaša dnešná investícia: 306 384 €."),
  el("Cieľ: renta 3 000 € mesačne od 65 do 90 rokov."),
  el("Základný prepočet: pri rovnakom zhodnotení každý rok má táto suma do veku 65 rokov vyrásť na 871 922 €. V modelovaných simuláciách sa zhodnotenie počas budovania každý rok mení.")
];

function row(nadpis, vysvetlenie, hodnota, doplnenie) {
  const values = {
    ".co strong": el(nadpis), ".co small": el(vysvetlenie),
    ".kolko strong": el(hodnota), ".kolko span": el(doplnenie)
  };
  return { querySelector: selector => values[selector] || null };
}

const rows = [
  row("Vaša dnešná investícia: 306 384 €", "Testujeme, či tento vstup dokáže financovať všetky zvolené renty.", "Všetky renty vyplatil v 268 z 800 simulácií", "3 000 € mesačne od 65 do 90 rokov. Ide o podiel v tomto modeli, nie odhad budúcej pravdepodobnosti."),
  row("Vaša dnešná investícia: 735 305 €", "Ilustračný vyšší vstup namiesto 306 384 €; nejde o odporúčanie.", "Všetky renty by vyplatil aspoň v 600 z 800 simulácií", "75 % simulácií v tomto modeli, nie odhad 75 % budúcej pravdepodobnosti."),
  row("Vaša dnešná investícia: 1 115 116 €", "Ďalšia ilustrácia citlivosti; nejde o odporúčanie.", "Všetky renty by vyplatil aspoň v 720 z 800 simulácií", "90 % simulácií v tomto modeli, nie odhad 90 % budúcej pravdepodobnosti.")
];

function value(textContent) {
  return { textContent, classList: { contains: name => name === "value" } };
}
function card(nadpis, pairs, pod) {
  const labels = pairs.map(([label, val]) => ({ textContent: label, nextElementSibling: value(val) }));
  return {
    hidden: false,
    closest: () => null,
    querySelectorAll: selector => selector === ".label" ? labels : [],
    querySelector: selector => selector === "h3" ? el(nadpis) : selector === ".sub" ? el(pod) : null
  };
}
const cards = {
  "m-today": card("Dnes", [["Jednorazová investícia", "306 384 €"]], "Obdobie budovania kapitálu: 15 rokov."),
  "m-start": card("Začiatok čerpania", [["Potrebný kapitál", "871 922 €"], ["Mesačná renta pri začiatku", "4 674 €"]], "Mesačne, pri zohľadnení inflácie."),
  "m-end": card("Koniec čerpania", [["Plánovaný horizont", "90 rokov"]], "25 rokov pravidelného čerpania.")
};
const summaryItems = [
  ["Koľko investujete dnes", "306 384 €"],
  ["Objem vyplatenej renty", "2 072 852 €"],
  ["Rozdiel medzi nominálnou rentou a investíciami", "1 766 468 €"]
].map(([k, v]) => ({ querySelector: selector => selector === ".k" ? el(k) : selector === ".v" ? el(v) : null }));

const byId = {
  ...cards,
  odolnost: {
    hidden: false,
    querySelector: selector => selector === "h2" ? el("Obstál by váš plán aj pri rozdielnom vývoji trhov?") : selector === ".odolnost-zaver" ? el("Čo si z toho odniesť? Základný prepočet funguje pri rovnakom zhodnotení každý rok. Modelované simulácie ukazujú citlivosť na poradie výnosov počas budovania majetku. Kolísanie výnosov počas čerpania renty tento test nemodeluje.") : null,
    querySelectorAll: selector => selector === ".odolnost-testuje li" ? testItems : []
  },
  "odolnost-uvod": el("Základný prepočet počíta každý rok s rovnakým zhodnotením, ktoré ste zadali. V 800 modelovaných simuláciách meníme vývoj iba počas budovania majetku. Po začatí renty všetky simulácie používajú rovnaký plánovací výnos 4 % ročne po investičných nákladoch, pred infláciou."),
  "odolnost-vystraha": el("Uvedené sumy nie sú odporúčaná výška investície. Bez posúdenia celého vášho majetku a rizikového profilu z nich nemožno robiť investičné rozhodnutie."),
  "odolnost-pod": el("Počet priebehov nie je pravdepodobnosť ani predpoveď. Modelované priebehy používajú päťročné súvislé bloky výnosov MSCI World z rokov 1970 až 2025. Výplatná fáza počíta s čistým nominálnym výnosom 4 % ročne a so zadanou infláciou.")
  ,suhrn: { hidden: false, querySelector: selector => selector === "h2" ? el("Čo to znamená v číslach") : null, querySelectorAll: selector => selector === ".suhrn-polozka" ? summaryItems : [] }
  ,"suhrn-pod": el("Renta je počas čerpania krytá vloženým kapitálom a modelovaným výnosom portfólia. Sumy sú nominálne, pred zdanením.")
  ,"ciel": el("Vaším cieľom je privátna renta 3 000 € mesačne v dnešnej hodnote od 65 rokov počas 25 rokov.")
  ,"pre-koho": el("Modelácia pre Audit Klienta")
  ,"vyhotovene": el("Vyhotovené 14. augusta 2026")
};

const queryOne = {
  "h1": el("Váš plán privátnej renty v jednom prehľade"),
  ".lead": el("Modelácia zachytáva scenár, ktorý ste si nastavili v kalkulačke, a dopĺňa ho o test založený na historických výnosoch."),
  ".section-head h2": el("Váš plán privátnej renty"),
  ".blok .vystraha": el("Minulá výkonnosť nie je spoľahlivým ukazovateľom budúcich výsledkov."),
  ".blok h2": el("Použité predpoklady"),
  ".recap h3": el("Východiská modelácie"),
  ".next h2": el("Váš plán v dnešnom kontexte"),
  ".next p": el("Modelované priebehy ukazujú, ako by plán reagoval na výnosy z minulosti. Osobná konzultácia doplní, čo to znamená pre váš konkrétny majetok."),
  ".disclaimer": el("Tento modelový výpočet slúži výhradne na ilustračné a vzdelávacie účely. Nejde o investičné poradenstvo ani odporúčanie.")
};

globalThis.document = {
  getElementById: id => byId[id] || null,
  querySelector: selector => {
    return queryOne[selector] || null;
  },
  querySelectorAll: selector => {
    if (selector === ".odolnost-testuje li") return testItems;
    if (selector === "#odolnost-riadky tr") return rows;
    if (selector === ".next p") return [
      el("Modelované priebehy ukazujú, ako by plán reagoval na výnosy z minulosti. Osobná konzultácia doplní, čo môže prísť a čo to znamená pre váš konkrétny majetok."),
      el("Vychádzame z dlhodobých očakávaní popredných svetových investičných inštitúcií. Nejde o predpoveď ani garanciu.")
    ];
    if (selector === ".blok p:not(.vystraha)") return [
      el("Aplikácia počíta so zhodnotením, ktoré ste zadali vy. Nejde o odhad ani odporúčanie."),
      el("Výpočet zohľadňuje vstupný poplatok 1,5 %, správu 0,9 % ročne a infláciu 3 % ročne.")
    ];
    if (selector === ".recap li") return [
      el("Spôsob tvorby kapitálu: jednorazová investícia"), el("Zhodnotenie: 8,3 % ročne"), el("Inflácia: 3 % ročne")
    ];
    return [];
  }
};

const save = jspdf.jsPDF.API.save;
jspdf.jsPDF.API.save = function () {
  fs.writeFileSync(out, Buffer.from(this.output("arraybuffer")));
  return this;
};

await import("./pdf.js?audit=1");
await import("./pdf-alternativa.js?audit=1");
window.PH_PDF();
jspdf.jsPDF.API.save = save;

if (!fs.existsSync(out) || fs.statSync(out).size < 10000) {
  throw new Error("Alternatívny PDF nevznikol alebo je neúplný.");
}
console.log(out);
