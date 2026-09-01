#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDir = path.join(root, "tmp", "pdfs", "matrix");
const scenarios = ["building", "existing", "short", "long"];

fs.mkdirSync(outputDir, { recursive: true });

for (const scenario of scenarios) {
  const output = path.join(outputDir, `modelacia-${scenario}.pdf`);
  execFileSync(process.execPath, [path.join(root, "audit-pdf-alternativa.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      RENTA_PDF_SCENARIO: scenario,
      RENTA_PDF_OUT: output
    },
    stdio: "inherit"
  });
}

let portraitFailureWasRejected = false;
try {
  execFileSync(process.execPath, [path.join(root, "audit-pdf-alternativa.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      RENTA_PDF_SCENARIO: "building",
      RENTA_PDF_OUT: path.join(outputDir, "modelacia-bez-portretu.pdf"),
      RENTA_PDF_FORCE_PORTRAIT_FAILURE: "1"
    },
    encoding: "utf8",
    stdio: "pipe"
  });
} catch (error) {
  const output = `${error.stdout || ""}\n${error.stderr || ""}`;
  if (!output.includes("portrét sa nepodarilo načítať")) throw error;
  portraitFailureWasRejected = true;
}
if (!portraitFailureWasRejected) {
  throw new Error("PDF bez portrétu nesmie byť vygenerované.");
}

console.log(`PDF layout matrix: ${scenarios.length}/${scenarios.length} scenárov prešlo.`);
console.log("PDF fail-closed kontrola portrétu prešla.");
