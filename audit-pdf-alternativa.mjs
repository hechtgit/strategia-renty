#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const scenario = process.env.RENTA_PDF_SCENARIO || "building";
const out = path.resolve(process.env.RENTA_PDF_OUT
  || `tmp/pdfs/modelacia-privatnej-renty-${scenario}.pdf`);
fs.mkdirSync(path.dirname(out), { recursive: true });

const allowedScenarios = new Set(["building", "existing", "short", "long"]);
if (!allowedScenarios.has(scenario)) throw new Error(`Neznámy PDF scenár „${scenario}“`);
const existing = scenario === "existing";
const shortCopy = scenario === "short";
const longCopy = scenario === "long";
const todayLabel = existing ? "Váš dnešný majetok" : "Všetky vaše investície počas budovania";
const todayValue = existing ? "600 000 €" : "540 000 €";
const goalText = shortCopy
  ? "Cieľ: renta 3 000 € mesačne od 55 do 90 rokov."
  : "Cieľ: renta 3 000 € mesačne v dnešnej hodnote od 55 do 90 rokov; počas čerpania rastie so zadanou infláciou."
    + (longCopy ? " Modelácia zároveň zachováva rovnaký plánovací horizont a zvolenú výšku renty." : "");

/* V prehliadači sa portrét načíta cez fetch + FileReader. Node audit používa
   presne ten istý PNG súbor, iba bez HTTP vrstvy, aby skutočne overil výsledný
   obrazový objekt v PDF a nie variantu po zlyhaní sieťového načítania. */
const povodnyFetch = globalThis.fetch;
globalThis.fetch = async input => {
  if (String(input) === "portrait-petr-kruh.png") {
    if (process.env.RENTA_PDF_FORCE_PORTRAIT_FAILURE === "1") {
      throw new Error("Simulované zlyhanie načítania portrétu.");
    }
    return new Response(fs.readFileSync(path.resolve("portrait-petr-kruh.png")), {
      status: 200, headers: { "content-type": "image/png" }
    });
  }
  return povodnyFetch(input);
};
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type || "image/png"};base64,${Buffer.from(buffer).toString("base64")}`;
      if (this.onload) this.onload();
    }).catch(error => {
      this.error = error;
      if (this.onerror) this.onerror(error);
    });
  }
};

const jsPdfModule = await import("./jspdf.min.js");
globalThis.window = globalThis;
globalThis.location = { search: "?now=35&start=55&end=90&pension=temporary" };
globalThis.jspdf = jsPdfModule.default;
globalThis.PH_KRIVKA = () => {
  const dnes = 35, start = 55, koniec = 90;
  const N = start - dnes, Nm = N * 12, Tm = (koniec - start) * 12;
  const e = 1 - 1.5 / 100;
  const rocnaCista = (5 - 0.9) / 100;
  const iA = (5 - 0.9) / 1200;
  const i = (5 - 0.9) / 1200;
  const g = 3 / 1200;
  const anuita = m => (Math.pow(1 + iA, m) - 1) / iA;
  const body = [];
  for (let k = 0; k <= N; k++) {
    body.push({
      vek: dnes + k,
      suma: 300000 * e * Math.pow(1 + rocnaCista, k) + 1000 * e * anuita(k * 12)
    });
  }
  let bal = body[body.length - 1].suma;
  let lo = 0, hi = bal;
  for (let n = 0; n < 60; n++) {
    const renta = (lo + hi) / 2;
    let testBal = bal, testRenta = renta;
    for (let m = 0; m < Tm; m++) {
      testBal = testBal * (1 + i) - testRenta;
      testRenta *= 1 + g;
    }
    if (testBal > 0) lo = renta; else hi = renta;
  }
  let renta = (lo + hi) / 2;
  for (let rok = 1, mesiac = 0; rok <= Tm / 12; rok++) {
    for (; mesiac < rok * 12; mesiac++) {
      bal = bal * (1 + i) - renta;
      renta *= 1 + g;
    }
    body.push({ vek: start + rok, suma: Math.max(0, bal) });
  }
  const vrchol = body[N].suma;
  return {
    body,
    vrchol,
    vrcholText: "1 025 404 €",
    maximum: body.reduce((maximum, point) => Math.max(maximum, point.suma), 0),
    dnes,
    start,
    koniec
  };
};
await import("./pdf-font.js");

const el = textContent => ({ textContent });
const testItems = [
  el(`${todayLabel}: ${todayValue}.`),
  el(goalText),
  el("Základný prepočet: pri rovnakom zhodnotení každý rok má táto suma do veku 55 rokov vyrásť na 1 025 404 €.")
];

function row(nadpis, vysvetlenie, hodnota, doplnenie) {
  const values = {
    ".co strong": el(nadpis), ".co small": el(vysvetlenie),
    ".kolko strong": el(hodnota), ".kolko span": el(doplnenie)
  };
  return { querySelector: selector => values[selector] || null };
}

function mainRow(hodnota, doplnenie) {
  const values = {
    ".kolko strong": el(hodnota),
    ".kolko span:not(.vysledok-label)": el(doplnenie),
    ".kolko span": el(doplnenie)
  };
  return { querySelector: selector => values[selector] || null };
}

const rows = [
  mainRow("Majetok pokryl všetky plánované výplaty v 613 z 800 simulácií", "Ide o podiel úspešných simulácií v tomto modeli, nie odhad pravdepodobnosti budúceho úspechu."),
  row("Túto úroveň spĺňa už všetky vaše investície počas budovania 540 000 €", "Dosiahli ste 613 z 800 simulácií.", "600 z 800 simulácií", "Majetok by všetky plánované výplaty pokryl aspoň v 600 z 800 simulácií."),
  row("Približná modelová výška vstupu: 801 000 €", "Namiesto vašich 540 000 €. Ide o zaokrúhlenú ilustračnú hranicu.", "720 z 800 simulácií", "Majetok by všetky plánované výplaty pokryl aspoň v 720 z 800 simulácií.")
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
  "m-today": card("Dnes", [[existing ? "Dnešný majetok" : "Jednorazová investícia", existing ? "600 000 €" : "300 000 €"]], existing ? "" : "a mesačne 1 000 € počas 20 rokov."),
  "m-start": card("Začiatok čerpania", [["Potrebný majetok", "1 025 404 €"], ["Mesačná renta pri začiatku", "2 949 €"]], "mesačne, pri zohľadnení inflácie"),
  "m-end": card("Koniec čerpania", [["Koniec čerpania vo veku", "90 rokov"]], "35 rokov pravidelného čerpania.")
};
const summaryItems = [
  ["Koľko investujete spolu", "540 000 €"],
  ["Nominálny súčet vyplatenej renty", "2 186 599 €"],
  ["Rozdiel medzi nominálnou rentou a investíciami", "1 646 599 €"]
].map(([k, v]) => ({ querySelector: selector => selector === ".k" ? el(k) : selector === ".v" ? el(v) : null }));

const byId = {
  ...cards,
  odolnost: {
    hidden: false,
    querySelector: selector => selector === "h2" ? el("Obstál by váš plán aj pri rozdielnom vývoji trhov?")
      : selector === ".odolnost-testuje li:first-child" ? testItems[0]
      : selector === ".odolnost-zaver" ? el("Čo si z toho odniesť? Základný prepočet predpokladá rovnaké zhodnotenie každý rok. Modelované simulácie ukazujú citlivosť na poradie výnosov počas budovania majetku. Kolísanie výnosov počas čerpania renty tento test nemodeluje."
        + (longCopy ? " Výsledok preto čítajte ako skúšku nastaveného plánu, nie ako predpoveď budúceho vývoja." : ""))
      : selector === ".odolnost-citlivost summary" ? el("Doplňujúci detail: ako sa výsledok mení s vyššou rezervou")
      : selector === ".odolnost-citlivost .uvod" ? el("Dve ilustračné úrovne ukazujú, ako by sa výsledok menil pri vyššom vstupe. Jednu z nich váš dnešný vstup už dosahuje.")
      : selector === ".odolnost-testuje p strong" ? el("Čo presne testujeme?") : null,
    querySelectorAll: selector => selector === ".odolnost-testuje li" ? testItems : []
  },
  "odolnost-uvod": el("Základný prepočet počíta každý rok s rovnakým zhodnotením, ktoré ste zadali. V 800 modelovaných simuláciách meníme vývoj iba počas budovania majetku. Po začatí renty všetky simulácie používajú rovnaký plánovací výnos 4 % ročne po investičných nákladoch, pred infláciou."),
  "odolnost-vystraha": el("Nejde o odporúčané výšky investície. Bez posúdenia celého vášho majetku a rizikového profilu z nich nemožno robiť investičné rozhodnutie."),
  "odolnost-pod": el("Počet priebehov nie je pravdepodobnosť ani predpoveď. Modelované priebehy používajú päťročné súvislé bloky výnosov MSCI World z rokov 1970 až 2025. Výplatná fáza počíta s čistým nominálnym výnosom 4 % ročne a so zadanou infláciou.")
  ,suhrn: { hidden: false, querySelector: selector => selector === "h2" ? el("Čo to znamená v číslach") : null, querySelectorAll: selector => selector === ".suhrn-polozka" ? summaryItems : [] }
  ,"suhrn-pod": el("Ide o nominálny súčet mesačných rent, ktoré počas čerpania rastú so zadanou infláciou. Rozdiel odčítava dnešnú investíciu od budúcich rent, nejde teda o výnos ani zisk. Nie je to suma v dnešnej kúpnej sile; údaje sú pred zdanením.")
  ,"ciel": el("Vaším cieľom je privátna renta 1 633 € mesačne v dnešnej hodnote od 55 rokov počas 35 rokov.")
  ,"pre-koho": el("")
  ,"vyhotovene": el("Vyhotovené 1. septembra 2026")
};

const queryOne = {
  "h1": el("Váš plán privátnej renty v jednom prehľade"),
  ".lead": el("Vaším cieľom je privátna renta 1 633 € mesačne v dnešnej hodnote od 55 rokov počas 35 rokov. Nižšie uvidíte, aký majetok si tento plán vyžaduje a ako obstál v modelovaných simuláciách založených na historických dátach."),
  ".section-head h2": el(""),
  ".blok .vystraha": el("Minulá výkonnosť nie je spoľahlivým ukazovateľom budúcich výsledkov."),
  ".blok h2": el("Použité predpoklady"),
  ".recap h3": el("Východiská modelácie"),
  ".next h2": el("Od modelácie k premyslenej stratégii"),
  ".next p": el("Modelované priebehy ukazujú, ako by plán reagoval na výnosy z minulosti. Osobná konzultácia doplní, čo to znamená pre váš konkrétny majetok."),
  ".disclaimer": el("Tento modelový výpočet slúži výhradne na ilustračné a vzdelávacie účely. Nejde o investičné poradenstvo, investičné odporúčanie ani o ponuku či návrh na uzavretie zmluvy. Zhodnotenie nie je garantované, hodnota investície môže v čase kolísať a nie je zaručená návratnosť investovanej sumy.")
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
      el("Modelované priebehy ukazujú, ako by plán reagoval na výnosy z minulosti. Osobná konzultácia doplní, čo môže prísť a čo to znamená pre váš konkrétny majetok."),
      el("Vychádzame z dlhodobých očakávaní popredných svetových investičných inštitúcií. Nejde o predpoveď ani garanciu.")
    ];
    if (selector === ".blok p:not(.vystraha)") return [
      el("Výpočet používa zhodnotenie, ktoré ste zadali vy."),
      el("Zohľadňuje vstupný poplatok 1,5 %, správu 0,9 % ročne, zadanú infláciu a mesačný priebeh výpočtu; dane z výnosov nezohľadňuje."),
      el("Metodiku modelovaných simulácií nájdete na druhej strane.")
    ];
    if (selector === ".recap li") return [
      el("Spôsob tvorby majetku: jednorazová investícia a pravidelné investovanie"),
      el("Zhodnotenie: 5 % ročne (váš predpoklad)"),
      el("Inflácia: 3 % ročne"),
      el("Renta rastie počas čerpania")
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
await window.PH_PDF();
jspdf.jsPDF.API.save = save;

if (!fs.existsSync(out) || fs.statSync(out).size < 10000) {
  throw new Error("Alternatívny PDF nevznikol alebo je neúplný.");
}
function extractPdfText(file) {
  try {
    return execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    /* Air už má lokálny pypdf; test preto nemusí inštalovať celý Poppler iba
       kvôli extrakcii textu z vlastného syntetického PDF. */
    const script = [
      "from pathlib import Path",
      "from pypdf import PdfReader",
      "import sys",
      "reader = PdfReader(Path(sys.argv[1]))",
      "print('\\n'.join((page.extract_text() or '') for page in reader.pages))",
    ].join(";");
    try {
      return execFileSync("python3", ["-c", script, file], { encoding: "utf8" });
    } catch (fallbackError) {
      const detail = String(fallbackError?.stderr || fallbackError?.message || fallbackError);
      throw new Error(`PDF audit potrebuje nástroj pdftotext alebo modul pypdf. ${detail}`);
    }
  }
}
const pdfText = extractPdfText(out);
const normalizedPdfText = pdfText.replace(/\s+/g, " ");
if (scenario === "building") {
  const reference = path.resolve(process.env.RENTA_PDF_REFERENCE
    || "/Users/hecht/Downloads/modelacia-privatnej-renty (18).pdf");
  if (!fs.existsSync(reference)) {
    throw new Error(`Chýba referenčné PDF pre kontrolu scenára: ${reference}`);
  }
  const normalizeSpaces = value => value.replace(/\s+/g, " ");
  const longFooter = normalizeSpaces("Tento modelový výpočet slúži výhradne na ilustračné a vzdelávacie účely. Nejde o investičné poradenstvo, investičné odporúčanie ani o ponuku či návrh na uzavretie zmluvy. Zhodnotenie nie je garantované, hodnota investície môže v čase kolísať a nie je zaručená návratnosť investovanej sumy.");
  const shortFooter = normalizeSpaces("Ilustračný a vzdelávací výpočet. Nejde o investičné poradenstvo ani odporúčanie.");
  const canonicalize = value => normalizeSpaces(value)
    .replace(/\b[12]\s*\/\s*2\b/g, "")
    .replace(/\s+/g, " ")
    .replace(longFooter, shortFooter)
    .replace(normalizeSpaces("Od čísla k stratégii"), normalizeSpaces("Od modelácie k premyslenej stratégii"))
    .trim();
  const extractLayoutText = file => execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  const expected = canonicalize(extractLayoutText(reference));
  const actual = canonicalize(extractLayoutText(out));
  if (actual !== expected) {
    let index = 0;
    while (index < actual.length && index < expected.length && actual[index] === expected[index]) index++;
    throw new Error("PDF kandidát sa mimo troch schválených zmien líši od referencie. "
      + `Prvý rozdiel pri znaku ${index}: očakávané „${expected.slice(index, index + 120)}“, `
      + `nájdené „${actual.slice(index, index + 120)}“.`);
  }
}
for (const required of ["Čo presne testujeme?", "Cieľ: renta 3 000 € mesačne", "Základný prepočet:", "Od modelácie k premyslenej stratégii"]) {
  if (!normalizedPdfText.includes(required.replace(/\s+/g, " "))) {
    throw new Error(`PDF druhá strana: chýba „${required}“`);
  }
}
for (const required of ["BUDOVANIE MAJETKU", "ČERPANIE RENTY", "1 025 404 €"]) {
  if (!normalizedPdfText.includes(required.replace(/\s+/g, " "))) {
    throw new Error(`PDF graf: chýba „${required}“`);
  }
}
const todayNeedle = `${todayLabel}: ${todayValue}`.replace(/\s+/g, " ");
const todayMatches = normalizedPdfText.split(todayNeedle).length - 1;
if (todayMatches !== 1) {
  throw new Error(`PDF druhá strana: dnešná hodnota sa musí uviesť raz, našla sa ${todayMatches}×.`);
}
const pdfInfo = execFileSync("pdfinfo", [out], { encoding: "utf8" });
if (!/^Pages:\s+2\s*$/m.test(pdfInfo)) throw new Error("PDF musí mať presne dve strany.");
const imageList = execFileSync("pdfimages", ["-list", out], { encoding: "utf8" });
if (!/^\s*2\s+\d+\s+image\s+/m.test(imageList)) {
  throw new Error("PDF druhá strana: chýba obrazový objekt s portrétom.");
}
/* Textová extrakcia vie potvrdiť obsah, nie však jeho polohu. XML layout
   z Poppleru preto stráži tri schválené vizuálne zmeny samostatne:
   portrét musí byť vpravo od textu a pätička musí na oboch stranách
   zostať jediným čitateľným riadkom bez kolízie s číslom strany. */
const layoutDir = path.resolve("tmp/pdfs/layout-audit");
fs.mkdirSync(layoutDir, { recursive: true });
const layoutXml = path.join(layoutDir, `${path.basename(out, ".pdf")}.xml`);
execFileSync("pdftohtml", ["-xml", "-hidden", "-nodrm", out, layoutXml], {
  stdio: "ignore"
});

function attributes(source) {
  return Object.fromEntries(Array.from(source.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
}
function plainXmlText(source) {
  return source
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const xml = fs.readFileSync(layoutXml, "utf8");
const layoutPages = Array.from(xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g), match => {
  const pageAttributes = attributes(match[1]);
  const body = match[2];
  const texts = Array.from(body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g), textMatch => ({
    ...attributes(textMatch[1]),
    text: plainXmlText(textMatch[2])
  })).map(item => ({
    ...item,
    top: Number(item.top),
    left: Number(item.left),
    width: Number(item.width),
    height: Number(item.height)
  }));
  const images = Array.from(body.matchAll(/<image\b([^>]*)\/?\s*>/g), imageMatch => ({
    ...attributes(imageMatch[1])
  })).map(item => ({
    ...item,
    top: Number(item.top),
    left: Number(item.left),
    width: Number(item.width),
    height: Number(item.height)
  }));
  return {
    number: Number(pageAttributes.number),
    width: Number(pageAttributes.width),
    height: Number(pageAttributes.height),
    texts,
    images
  };
});
if (layoutPages.length !== 2) throw new Error("PDF layout audit očakáva presne dve strany.");

const secondPage = layoutPages[1];
const portrait = secondPage.images.find(image => image.width >= 80 && image.height >= 80);
const ctaHeadingText = plainXmlText("Od modelácie k premyslenej stratégii");
const ctaHeading = secondPage.texts.find(item => item.text === ctaHeadingText);
if (!portrait || portrait.left <= secondPage.width / 2) {
  throw new Error("PDF druhá strana: portrét nie je umiestnený vpravo.");
}
if (!ctaHeading || ctaHeading.left >= portrait.left) {
  throw new Error("PDF druhá strana: text záverečného bloku nie je vľavo od portrétu.");
}

const expectedFooter = plainXmlText("Ilustračný a vzdelávací výpočet. Nejde o investičné poradenstvo ani odporúčanie.");
const footerPrefix = plainXmlText("Ilustračný a vzdelávací výpočet.");
layoutPages.forEach(page => {
  const footerLines = page.texts.filter(item => item.text.includes(footerPrefix));
  if (footerLines.length !== 1 || footerLines[0].text !== expectedFooter) {
    throw new Error(`PDF strana ${page.number}: disclaimer pätičky nie je v jednom úplnom riadku.`);
  }
  const pageNumber = page.texts.find(item => item.text === `${page.number} / 2`);
  if (!pageNumber) throw new Error(`PDF strana ${page.number}: chýba číslo strany.`);
  const footer = footerLines[0];
  const verticalOverlap = footer.top < pageNumber.top + pageNumber.height
    && pageNumber.top < footer.top + footer.height;
  const horizontalOverlap = footer.left < pageNumber.left + pageNumber.width
    && pageNumber.left < footer.left + footer.width;
  if (verticalOverlap && horizontalOverlap) {
    throw new Error(`PDF strana ${page.number}: disclaimer koliduje s číslom strany.`);
  }
});
console.log(`${scenario}: ${out}`);
