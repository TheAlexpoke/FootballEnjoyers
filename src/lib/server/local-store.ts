import "server-only";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { initialState, type State } from "../model";
import { localMode } from "./local-mode";

function connect() {
  if (!localMode()) throw Error("Local storage is disabled.");
  const directory = resolve(
    /* turbopackIgnore: true */
    process.env.LOCAL_DATA_DIR || join(process.cwd(), "data"),
  );
  mkdirSync(directory, { recursive: true });
  const sql = new DatabaseSync(join(directory, "tournament.sqlite"));
  sql.exec(`PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tournament_state (environment TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_backups (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);
  sql.exec(
    "CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  return sql;
}
export function localReceiptKey() {
  return withDatabase((sql) => {
    sql
      .prepare("INSERT OR IGNORE INTO local_settings VALUES ('receipt-key', ?)")
      .run(randomBytes(32).toString("hex"));
    return String(
      sql
        .prepare("SELECT value FROM local_settings WHERE key = 'receipt-key'")
        .get()!.value,
    );
  });
}
function withDatabase<T>(fn: (sql: DatabaseSync) => T): T {
  const sql = connect();
  try {
    return fn(sql);
  } finally {
    sql.close();
  }
}
export function readLocal(environment: State["environment"]): State {
  return withDatabase((sql) => {
    const row = sql
      .prepare("SELECT payload FROM tournament_state WHERE environment = ?")
      .get(environment);
    return row ? JSON.parse(String(row.payload)) : initialState(environment);
  });
}
export function commitLocal(
  environment: State["environment"],
  expected: number,
  state: State,
) {
  return withDatabase((sql) => {
    sql.exec("BEGIN IMMEDIATE");
    try {
      sql
        .prepare("INSERT OR IGNORE INTO tournament_state VALUES (?, 0, ?)")
        .run(environment, JSON.stringify(initialState(environment)));
      const result = sql
        .prepare(
          "UPDATE tournament_state SET revision = ?, payload = ? WHERE environment = ? AND revision = ?",
        )
        .run(
          expected + 1,
          JSON.stringify({ ...state, revision: expected + 1 }),
          environment,
          expected,
        );
      sql.exec("COMMIT");
      return result.changes === 1;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  });
}
export function localLimit(bucket: string, maximum: number, seconds: number) {
  return withDatabase((sql) => {
    const now = Date.now();
    const row = sql
      .prepare(
        `INSERT INTO local_limits VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET
      attempts = CASE WHEN local_limits.reset_at < ? THEN 1 ELSE local_limits.attempts + 1 END,
      reset_at = CASE WHEN local_limits.reset_at < ? THEN excluded.reset_at ELSE local_limits.reset_at END
      RETURNING attempts`,
      )
      .get(bucket, now + seconds * 1000, now, now);
    return Number(row!.attempts) <= maximum;
  });
}
export function localRows<T>(path: string, body?: unknown): T {
  const [table, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const equals = (key: string) => (params.get(key) || "").replace(/^eq\./, "");
  if (table === "participants") {
    const state = readLocal(
      equals("tournament_id") === "practice" ? "practice" : "production",
    );
    return state.participants
      .filter(
        (p) =>
          !params.has("device_hash") || p.deviceHash === equals("device_hash"),
      )
      .map((p) => ({ id: p.id })) as T;
  }
  if (table === "backups")
    return withDatabase((sql) => {
      if (body) {
        const backup = body as { tournament_id: string; payload: unknown };
        sql
          .prepare("INSERT INTO local_backups VALUES (?, ?, ?, ?)")
          .run(
            crypto.randomUUID(),
            backup.tournament_id,
            new Date().toISOString(),
            JSON.stringify(backup.payload),
          );
        return [] as T;
      }
      if (params.has("id"))
        return sql
          .prepare(
            "SELECT payload FROM local_backups WHERE id = ? AND tournament_id = ?",
          )
          .all(equals("id"), equals("tournament_id"))
          .map((row) => ({ payload: JSON.parse(String(row.payload)) })) as T;
      return sql
        .prepare(
          "SELECT id, created_at FROM local_backups WHERE tournament_id = ? ORDER BY created_at DESC LIMIT 30",
        )
        .all(equals("tournament_id")) as T;
    });
  throw Error("Unsupported local database operation.");
}
