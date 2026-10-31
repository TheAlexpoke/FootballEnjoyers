// Local integration-test adapter. Not a production Supabase replacement.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
const pg = new PGlite();
const images = new Map();
await pg.exec(
  "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
);
await pg.exec(
  readFileSync(
    new URL("../supabase/migrations/001_tournament.sql", import.meta.url),
    "utf8",
  ).replace(
    "alter publication supabase_realtime add table public.tournament_pulse;",
    "",
  ),
);
const server = createServer(async (req, res) => {
  const send = (status, value) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.url === "/health") return send(200, { ok: true });
    if (req.url.startsWith("/storage/v1/object/public/avatars/")) {
      const bytes = images.get(req.url.replace("/public", ""));
      if (!bytes) return send(404, {});
      res.writeHead(200, { "Content-Type": "image/webp" });
      return res.end(bytes);
    }
    if (req.headers.authorization !== "Bearer integration-service-key")
      return send(403, { error: "service authorization required" });
    if (
      req.method === "POST" &&
      req.url.startsWith("/storage/v1/object/avatars/")
    ) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      images.set(req.url, Buffer.concat(chunks));
      return send(200, { ok: true });
    }
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname.replace("/rest/v1/", "");
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : undefined;
    if (path.startsWith("rpc/")) {
      const name = path.slice(4);
      const args = {
        read_public_tournament: ["env"],
        read_tournament: ["env"],
        commit_tournament: ["env", "expected", "state"],
        consume_limit: ["bucket", "maximum", "seconds"],
        acquire_worker: ["lock_id", "seconds"],
      }[name];
      if (!args) return send(404, {});
      const values = args.map((k) =>
        k === "state" ? JSON.stringify(data[k]) : data[k],
      );
      const result = await pg.query(
        `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
        values,
      );
      return send(200, result.rows[0].value);
    }
    if (!["admin_sessions", "backups", "participants"].includes(path))
      return send(404, {});
    if (req.method === "POST") {
      const cols =
        path === "admin_sessions"
          ? ["token_hash", "expires_at"]
          : ["tournament_id", "payload"];
      const values = cols.map((k) =>
        k === "payload" ? JSON.stringify(data[k]) : data[k],
      );
      const result = await pg.query(
        `insert into ${path} (${cols.join(",")}) values(${cols.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
        values,
      );
      return send(201, result.rows);
    }
    const keys =
      path === "admin_sessions"
        ? ["token_hash"]
        : path === "participants"
          ? ["tournament_id", "device_hash"]
          : ["tournament_id", "id"];
    const vals = [],
      conditions = [];
    for (const key of keys) {
      const val = url.searchParams.get(key);
      if (val?.startsWith("eq.")) {
        vals.push(val.slice(3));
        conditions.push(`${key}=$${vals.length}`);
      }
    }
    const where = conditions.length ? " where " + conditions.join(" and ") : "";
    if (req.method === "DELETE") {
      await pg.query(`delete from ${path}${where}`, vals);
      return send(200, []);
    }
    const rows = (
      await pg.query(
        `select * from ${path}${where}${path === "backups" ? " order by created_at desc" : ""}`,
        vals,
      )
    ).rows;
    const selection = url.searchParams.get("select")?.split(",");
    return send(
      200,
      selection
        ? rows.map((row) =>
            Object.fromEntries(selection.map((key) => [key, row[key]])),
          )
        : rows,
    );
  } catch (e) {
    send(400, { error: e.message });
  }
});
server.listen(54325, "127.0.0.1", () =>
  console.log("Integration Postgres adapter: http://127.0.0.1:54325"),
);
process.on("SIGINT", async () => {
  server.close();
  await pg.close();
  process.exit(0);
});
