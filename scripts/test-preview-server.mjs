import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const hosted = process.argv[2] === "hosted";
const directory = mkdtempSync(join(tmpdir(), "football-browser-"));
writeFileSync(
  join(".next", `test-${hosted ? "hosted" : "local"}.json`),
  JSON.stringify({ pid: process.pid, directory }),
);
process.env.VERCEL = hosted ? "1" : "";
process.env.LOCAL_MODE = "true";
process.env.LOCAL_DATA_DIR = directory;
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
// Run the regular Next CLI in this process so Playwright can stop it cleanly.
process.argv = [
  process.execPath,
  fileURLToPath(import.meta.resolve("next/dist/bin/next")),
  "start",
  "-H",
  "127.0.0.1",
  "-p",
  hosted ? "3002" : "3003",
];
await import("next/dist/bin/next");
