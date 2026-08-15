import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "shared", "renta-core.js");
const dataPath = path.join(root, "data", "msci-world-eur-annual.json");
const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(sourcePath, "utf8");
const exports = [...source.matchAll(/^export (?:const|function) ([A-Za-z0-9_]+)/gm)]
  .map(match => match[1]);
if (!exports.length) throw new Error("Nenašli sa exporty spoločného jadra.");
const body = source.replace(/^export /gm, "");
const sourceHash = crypto.createHash("sha256").update(source).digest("hex");
const browser = `/* GENERATED from shared/renta-core.js sha256:${sourceHash}. Do not edit. */
(() => {
"use strict";
${body}
globalThis.RentaCore = Object.freeze({${exports.join(",")}});
})();
`;
fs.writeFileSync(path.join(outDir, "renta-core.browser.js"), browser);

const dataRaw = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(dataRaw);
const dataHash = crypto.createHash("sha256").update(dataRaw).digest("hex");
const dataBrowser = `/* GENERATED from data/msci-world-eur-annual.json sha256:${dataHash}. Do not edit. */
globalThis.RentaHistoricalData = Object.freeze(${JSON.stringify(data)});
`;
fs.writeFileSync(path.join(outDir, "renta-data.browser.js"), dataBrowser);
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({
  coreSha256: sourceHash,
  dataSha256: dataHash,
  exports,
}, null, 2) + "\n");

console.log("Built browser core", sourceHash);
console.log("Built browser data", dataHash);
