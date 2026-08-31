#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const appMaster = read('cara-zivota-master.html');
const app = read('cara-zivota.html');
const resultMaster = read('vysledok-master.html');
const result = read('vysledok.html');
const guide = read('sprievodca.js');
const footerInjection = read('squarespace-footer-injection.html');
const pdf = read('jspdf.min.js').slice(0, 1000);
const previewPdf = read('nahlad/jspdf.min.js').slice(0, 1000);

for (const [name, html] of [
  ['app master', appMaster],
  ['app build', app],
  ['result master', resultMaster],
  ['result build', result],
]) {
  assert.match(html, /http-equiv="Content-Security-Policy"/,
    `${name}: chýba Content Security Policy`);
  assert.match(html, /script-src-attr 'none'/,
    `${name}: CSP musí zakázať inline event handlery`);
  assert.match(html, /object-src 'none'/,
    `${name}: CSP musí zakázať pluginové objekty`);
  assert.match(html, /base-uri 'none'/,
    `${name}: CSP musí zakázať podvrhnutie base URL`);
  assert.match(html, /name="referrer" content="strict-origin-when-cross-origin"/,
    `${name}: chýba referrer policy`);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i,
    `${name}: inline event handler obchádza bezpečnostnú politiku`);
}

assert.match(guide,
  /data\.type !== 'ph-renta-guide-back'[\s\S]{0,180}doveryhodnaViewportSprava\(e\.origin, e\.source === parent\)/,
  'Sprievodca musí overiť origin aj presné rodičovské okno pri guide-back správe');

assert.match(appMaster,
  /challenges\.cloudflare\.com\/turnstile[\s\S]{0,260}s\.referrerPolicy='no-referrer'/,
  'Turnstile skript nesmie dostať adresu stránky ani scenára cez Referer');

for (const [name, source] of [['jsPDF', pdf], ['preview jsPDF', previewPdf]]) {
  assert.match(source, /Version 4\.2\.1\b/,
    `${name}: musí byť na bezpečnej verzii 4.2.1`);
  assert.doesNotMatch(source, /Version 2\.5\.2\b/,
    `${name}: zraniteľná verzia 2.5.2 nesmie zostať v balíku`);
}

assert.match(footerInjection,
  /adam-player\.js\?v=3d704cc"\s+integrity="sha384-[A-Za-z0-9+/=]+"\s+crossorigin="anonymous"/,
  'Externý Adam audio skript musí mať SRI integritu a anonymný CORS režim');

console.log('OK security-contract');
