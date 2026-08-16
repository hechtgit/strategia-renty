#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./cara-zivota.html", import.meta.url), "utf8");
const injection = fs.readFileSync(new URL("./squarespace-injection.html", import.meta.url), "utf8");

function has(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`UI kontrakt: chýba ${label}.`);
}

has(app, 'id="fund-out"', "samostatný výstup karty Dnes");
has(app, "$('fund-out').hidden=S.sit==='build'&&S.mode==='combo'&&S.comboDir==='known'&&!o.immediate;",
  "skrytie výsledku v karte Dnes pri známej kombinácii");
has(app, "txt($('cap-k'),'Dosiahnuteľná renta v dnešných cenách');",
  "výsledok renty v karte Začiatok čerpania");
has(app, "txt($('fut-k'),`Vytvorený kapitál vo veku ${S.start} rokov`);",
  "vytvorený kapitál v karte Začiatok čerpania");
has(app, "document.documentElement.classList.contains('viewport-compact')",
  "prepnutie kompaktného desktopu");
has(app, "const top=maxH+STEM;", "jednoradové kompaktné rozloženie");
has(app, "e.source===parent", "kontrolu zdroja viewport správy");
has(app, "hostOrigins.has(origin)", "kontrolu pôvodu viewport správy");
has(injection, 'type:"ph-renta-host-viewport"', "odoslanie veľkosti hostiteľského okna");

const policySource = app.match(/\/\* VIEWPORT_POLICY:START \*\/([\s\S]*?)\/\* VIEWPORT_POLICY:END \*\//)?.[1];
if (!policySource) throw new Error("UI kontrakt: chýba testovateľná viewport policy.");
const policyContext = {};
vm.runInNewContext(`${policySource}; this.policy = viewportCompactPolicy;`, policyContext);
const policy = policyContext.policy;
const prod = "https://www.hechtberger.com";

function equal(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(`UI kontrakt: ${label}; očakávané ${expected}, získané ${actual}.`);
  }
}

equal(policy("https://utocnik.example", true, "hechtgit.github.io", 1280, 760), null,
  "cudzí origin sa musí odmietnuť");
equal(policy(prod, false, "hechtgit.github.io", 1280, 760), null,
  "správa z iného window sa musí odmietnuť");
equal(policy("http://127.0.0.1:8899", true, "hechtgit.github.io", 1280, 760), null,
  "localhost origin sa na produkcii musí odmietnuť");
equal(policy("http://127.0.0.1:8899", true, "127.0.0.1", 1280, 760), true,
  "lokálny náhľad musí zostať testovateľný");
equal(policy(prod, true, "hechtgit.github.io", 480, 899), false,
  "šírka 480 px patrí mobilu");
equal(policy(prod, true, "hechtgit.github.io", 481, 899), true,
  "kompaktný desktop začína nad 480 px a pod 900 px");
equal(policy(prod, true, "hechtgit.github.io", 481, 900), false,
  "výška 900 px už kompaktný režim nepotrebuje");
equal(policy(prod, true, "hechtgit.github.io", 1280, 899), true,
  "nízky desktop musí byť kompaktný");
equal(policy(prod, true, "hechtgit.github.io", "šírka", 899), null,
  "nečíselná šírka sa musí odmietnuť");
equal(policy(prod, true, "hechtgit.github.io", 1280, Number.NaN), null,
  "nečíselná výška sa musí odmietnuť");
equal(policy(prod, true, "hechtgit.github.io", 0, 899), null,
  "nulová šírka sa musí odmietnuť");
equal(policy(prod, true, "hechtgit.github.io", 1280, -1), null,
  "záporná výška sa musí odmietnuť");

if (app.includes("Pokračovať tam, kde ste skončili") || app.includes("ponukniNavrat")) {
  throw new Error("UI kontrakt: nefunkčný odkaz na návrat zostal v aplikácii.");
}
has(app, "localStorage.removeItem('ph-renta-scenar')", "upratanie starého lokálneho záznamu");

console.log("OK UI kontrakt: výstupy, compact layout, message bridge a odstránenie návratového odkazu.");
