import { readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

export default async function stopTestPreviews() {
  // Windows sandboxes may prevent Playwright's taskkill subprocess. Stop only the
  // two process IDs recorded by our own isolated test launchers before teardown.
  for (const name of ["hosted", "local"]) {
    const file = join(".next", `test-${name}.json`);
    let record;
    try {
      record = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!Number.isInteger(record.pid) || record.pid <= 0)
      throw Error("Invalid test-server PID");
    try {
      process.kill(record.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    const target = resolve(record.directory);
    const expectedParent = resolve(tmpdir());
    if (
      resolve(target, "..") !== expectedParent ||
      !target.split(/[\\/]/).at(-1).startsWith("football-browser-")
    )
      throw Error("Unexpected test data directory");
    rmSync(target, { recursive: true, force: true });
    rmSync(file);
  }
}
