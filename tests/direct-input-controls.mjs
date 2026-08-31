#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const master = fs.readFileSync(new URL('../cara-zivota-master.html', import.meta.url), 'utf8');
const improvements = fs.readFileSync(new URL('../vylepsenia.js', import.meta.url), 'utf8');

const scaleStart = master.indexOf('function mkScale');
const scaleEnd = master.indexOf('/* ===== finančné jadro', scaleStart);
assert.ok(scaleStart >= 0 && scaleEnd > scaleStart, 'Chýba blok nelineárnych škál.');

const context = vm.createContext({ window: {} });
const mappingStart = master.indexOf('window.__SC=Object.freeze({', scaleEnd);
const mappingEnd = master.indexOf('\n});', mappingStart);
assert.ok(mappingStart >= 0 && mappingEnd > mappingStart, 'Chýba verejná mapa sumových škál.');
vm.runInContext(master.slice(scaleStart, scaleEnd)
  + master.slice(mappingStart, mappingEnd + 4)
  + ';globalThis.scales=window.__SC;', context);

const expected = {
  'sl-rent': [500, 50000],
  'sl-c0': [50000, 30000000],
  'sl-combo': [0, 10000000],
  'sl-monthly-known': [0, 100000],
};
assert.deepEqual(Object.keys(context.scales).sort(), Object.keys(expected).sort(),
  'Vrstva priameho zadávania musí dostať všetky štyri sumové škály.');
for (const [id, [minimum, maximum]] of Object.entries(expected)) {
  const scale = context.scales[id];
  assert.equal(scale.toVal(0), minimum, `${id}: nesprávne minimum`);
  assert.equal(scale.toVal(1000), maximum, `${id}: nesprávne maximum`);
  assert.ok(scale.toPos(minimum) === 0 && scale.toPos(maximum) === 1000,
    `${id}: kraje škály sa neprevedú späť na polohu.`);
}

assert.ok(improvements.includes("const skala = cfg => (window.__SC || {})[cfg.slider] || null;"),
  'Ovládacia vrstva musí používať škály aplikácie, nie HTML rozsah 0–1000.');
assert.ok(improvements.includes('const zobrazene = cislo($(cfg.id).textContent);')
  && improvements.includes('if (zobrazene !== null) return zobrazene;'),
  'Opakované otvorenie musí čítať presnú vykreslenú sumu, nie približnú polohu jazdca.');
assert.ok(improvements.includes("new CustomEvent('ph-renta-presna-hodnota'")
  && master.includes("sl.addEventListener('ph-renta-presna-hodnota'"),
  'Presný zápis musí mať odosielateľa aj prijímača vlastnej udalosti.');
assert.ok(improvements.includes('const orez = zapisPresne(cfg, v);'),
  'Ručne napísaná hodnota musí ísť presnou cestou.');
assert.ok(master.includes('set(presne);') && master.includes('sl.value=scale.toPos(presne);'),
  'Aplikácia musí uložiť presnú sumu; posuvník je iba jej vizuálnou polohou.');
assert.ok(master.includes('vylepsenia.js?v=20260831a'),
  'Po oprave musí byť zvýšená verzia skriptu kvôli cache prehliadača.');

console.log('OK: priame zadávanie súm používa ľudské jednotky a zachováva presnú hodnotu.');
