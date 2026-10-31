import { spawn } from "node:child_process";
import { scryptSync } from "node:crypto";
import { createServer } from "node:net";
for (const port of [3001, 54325])
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        Error(
          `Port ${port} is in use. Stop the earlier integration servers first.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
const hash = `scrypt$integration-salt$${scryptSync("integration-password-2026", "integration-salt", 64).toString("hex")}`;
const env = {
  ...process.env,
  LOCAL_MODE: "false",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54325",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "integration-anon",
  SUPABASE_SERVICE_ROLE_KEY: "integration-service-key",
  ADMIN_PASSWORD_HASH: hash,
  APP_ORIGIN: "http://localhost:3001",
  CRON_SECRET: "integration-worker-secret",
  FANTASY_FEED_URL: "",
  FANTASY_FEED_TOKEN: "",
};
const children = [];
const start = (args) => {
  const child = spawn(process.execPath, args, {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
};
const waitFor = async (url, child) => {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null)
      throw Error(
        `Test server stopped with code ${child.exitCode}. Stop other Next.js dev servers before running this suite.`,
      );
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error(`Test server did not become ready: ${url}`);
};
async function stop() {
  for (const child of children.toReversed()) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}
process.on("SIGINT", () => {
  void stop().then(() => process.exit(130));
});
try {
  const db = start(["scripts/test-database.mjs"]);
  await waitFor("http://127.0.0.1:54325/health", db);
  const next = start([
    "node_modules/next/dist/bin/next",
    "dev",
    "-H",
    "127.0.0.1",
    "-p",
    "3001",
  ]);
  await waitFor("http://localhost:3001", next);
  const test = start([
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=playwright.integration.config.ts",
  ]);
  const code = await new Promise((resolve) => test.on("exit", resolve));
  await stop();
  process.exit(code ?? 1);
} catch (error) {
  console.error(error.message);
  await stop();
  process.exit(1);
}
