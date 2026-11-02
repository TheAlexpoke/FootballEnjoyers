import { createServer, request } from "node:http";
import { networkInterfaces } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.VERCEL)
  throw Error("Phone access runs only on the local computer.");
const flag = (name) =>
  process.argv
    .find((arg) => arg.startsWith(name + "="))
    ?.slice(name.length + 1);
const addresses = Object.entries(networkInterfaces())
  .flatMap(([name, list]) =>
    (list ?? [])
      .filter(
        (item) =>
          item.family === "IPv4" &&
          !item.internal &&
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
      )
      .map((item) => ({ name, address: item.address })),
  )
  .sort(
    (a, b) =>
      Number(/wi-?fi|wlan/i.test(b.name)) - Number(/wi-?fi|wlan/i.test(a.name)),
  );
const host = flag("--host") || addresses[0]?.address;
if (!addresses.some((item) => item.address === host))
  throw Error("Connect to Wi-Fi, then run npm run phone again.");
const port = Number(flag("--port") || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000)
  throw Error("Use a separate phone port between 1024 and 65535.");
const directory = resolve(process.env.LOCAL_DATA_DIR || "data");
const file = resolve(directory, "phone-access.json");
let code;
try {
  code = JSON.parse(readFileSync(file, "utf8")).code;
} catch {}
if (!/^[A-F0-9]{12}$/.test(code) || process.argv.includes("--rotate"))
  code = randomBytes(6).toString("hex").toUpperCase();
const origin = `http://${host}:${port}`;
mkdirSync(directory, { recursive: true });
writeFileSync(file, JSON.stringify({ origin, code }, null, 2) + "\n", {
  mode: 0o600,
});
const server = createServer((incoming, outgoing) => {
  // Never forward a caller-controlled Host or forwarding identity to the
  // password-free loopback app. This gateway is the only LAN listener.
  if (
    incoming.headers.host !== new URL(origin).host ||
    !incoming.url?.startsWith("/") ||
    incoming.url.startsWith("//")
  ) {
    outgoing.writeHead(403);
    outgoing.end("Use the phone address shown on the computer.");
    return;
  }
  if (
    !["GET", "HEAD"].includes(incoming.method ?? "GET") &&
    incoming.headers.origin !== origin
  ) {
    outgoing.writeHead(403);
    outgoing.end("Phone changes must come from this site.");
    return;
  }
  const headers = { ...incoming.headers, host: new URL(origin).host };
  for (const key of Object.keys(headers))
    if (
      key.startsWith("x-forwarded-") ||
      key === "forwarded" ||
      key === "connection" ||
      key === "upgrade"
    )
      delete headers[key];
  headers["x-forwarded-for"] = incoming.socket.remoteAddress;
  headers["x-forwarded-proto"] = "http";
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 3000,
      path: incoming.url,
      method: incoming.method,
      headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  upstream.on("error", () => {
    if (!outgoing.headersSent)
      outgoing.writeHead(502, { "Content-Type": "text/plain" });
    outgoing.end(
      "Start the local site on this computer at 127.0.0.1:3000, then refresh.",
    );
  });
  incoming.on("aborted", () => upstream.destroy());
  incoming.pipe(upstream);
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Phone Control room: ${origin}/admin`);
  console.log(`Practice Control room: ${origin}/admin?env=practice`);
  console.log(`Private phone sign-in code: ${code}`);
  console.log(
    "Keep this process and the local site running. Scores stay on this computer.",
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
