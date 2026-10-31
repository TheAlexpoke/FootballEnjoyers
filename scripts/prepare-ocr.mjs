import { mkdir, copyFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const worker = resolve(
  dirname(require.resolve("tesseract.js/package.json")),
  "dist/worker.min.js",
);
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const lang = resolve(
  dirname(require.resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0/eng.traineddata.gz",
);
await mkdir(resolve(root, "public/ocr/core"), { recursive: true });
await mkdir(resolve(root, "public/ocr/lang"), { recursive: true });
await copyFile(worker, resolve(root, "public/ocr/worker.min.js"));
for (const name of await readdir(core))
  if (name.endsWith(".wasm.js") || name.endsWith(".wasm"))
    await copyFile(resolve(core, name), resolve(root, "public/ocr/core", name));
await copyFile(lang, resolve(root, "public/ocr/lang/eng.traineddata.gz"));
await copyFile(
  resolve(dirname(require.resolve("tesseract.js/package.json")), "LICENSE.md"),
  resolve(root, "public/ocr/TESSERACT-LICENSE.md"),
);
console.log("Local OCR assets prepared.");
