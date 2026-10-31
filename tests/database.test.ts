import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initialState, NAMES, type State } from "../src/lib/model";
import { applyAction } from "../src/lib/actions";
const pg = new PGlite();
beforeAll(async () => {
  await pg.exec(
    "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  const sql = readFileSync(
    new URL("../supabase/migrations/001_tournament.sql", import.meta.url),
    "utf8",
  ).replace(
    "alter publication supabase_realtime add table public.tournament_pulse;",
    "",
  );
  await pg.exec(sql);
});
afterAll(async () => {
  await pg.close();
});
async function load(env: State["environment"]) {
  const r = await pg.query<{ s: State }>(
    "select public.read_tournament($1) as s",
    [env],
  );
  return r.rows[0].s ?? initialState(env);
}
async function commit(s: State) {
  return (
    await pg.query<{ ok: boolean }>(
      "select public.commit_tournament($1,$2,$3::jsonb) as ok",
      [s.environment, s.revision, JSON.stringify(s)],
    )
  ).rows[0].ok;
}
async function register(name: (typeof NAMES)[number]) {
  for (let i = 0; i < 10; i++) {
    const s = await load("production");
    const next = applyAction(
      s,
      {
        type: "register",
        name,
        profile: { team: name, nickname: "", sleeper: "" },
      },
      {
        admin: false,
        credentialHash: `hash-${name}`,
        deviceHash: `device-${name}`,
      },
    );
    if (await commit(next)) return;
  }
  throw Error("Conflict retry exceeded");
}
describe("Postgres transactional safety", () => {
  it("omits secrets and NFL catalog from spectator database projections", async () => {
    await commit(initialState("practice"));
    const s = (
      await pg.query<{ s: State }>(
        "select public.read_public_tournament('practice') as s",
      )
    ).rows[0].s;
    expect(JSON.stringify(s)).not.toContain("credentialHash");
    expect(JSON.stringify(s)).not.toContain("deviceHash");
    expect(s.fantasy.players).toBeUndefined();
    expect(s.audit).toEqual([]);
  });
  it("serializes simultaneous claims; only one request owns an identity", async () => {
    const attempts = await Promise.allSettled([
      register("Mark"),
      register("Mark"),
    ]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await load("production")).participants).toHaveLength(1);
  });
  it("enforces the cap and retains all registrations through revision conflicts", async () => {
    await Promise.all(NAMES.slice(1).map(register));
    const s = await load("production");
    expect(s.participants).toHaveLength(7);
    expect(new Set(s.participants.map((p) => p.name)).size).toBe(7);
    await expect(register("Alex")).rejects.toThrow();
  });
  it("rejects stale commits and separates practice and production", async () => {
    const s = await load("production");
    expect(await commit(s)).toBe(true);
    expect(await commit(s)).toBe(false);
    const practice = await load("practice");
    expect(await commit(practice)).toBe(true);
    expect((await load("practice")).participants).toHaveLength(0);
    expect((await load("production")).participants).toHaveLength(7);
  });
  it("rolls back an invalid multirow restoration as one transaction", async () => {
    const old = await load("production");
    const next = structuredClone(old);
    next.participants[1].name = next.participants[0].name;
    await expect(commit(next)).rejects.toThrow();
    const current = await load("production");
    expect(current.revision).toBe(old.revision);
    expect(current.participants).toEqual(old.participants);
  });
  it("denies anonymous access to credentials and privileged functions", async () => {
    await pg.exec("set role anon");
    try {
      await expect(
        pg.query("select * from public.participants"),
      ).rejects.toThrow();
      await expect(
        pg.query("select public.read_tournament('production')"),
      ).rejects.toThrow();
      const pulses = await pg.query<{ id: string }>(
        "select id from public.tournament_pulse",
      );
      expect(pulses.rows.map((r) => r.id)).toEqual(["production"]);
    } finally {
      await pg.exec("reset role");
    }
  });
  it("enforces distributed rate limits atomically", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        pg.query<{ ok: boolean }>(
          "select public.consume_limit('test-bucket',3,60) as ok",
        ),
      ),
    );
    expect(results.filter((x) => x.rows[0].ok)).toHaveLength(3);
  });
});
