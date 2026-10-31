import "server-only";
import { initialState, type State } from "../model";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
export async function db<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  if (!configured())
    throw Error("Supabase is not configured. Follow the setup guide.");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`,
    {
      method,
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) {
    console.error("Database request failed", res.status, path.split("?")[0]);
    throw Error("Database operation failed. Try again.");
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
export async function rpc<T>(name: string, args: unknown) {
  return db<T>(`rpc/${name}`, args);
}
export async function load(env: State["environment"]): Promise<State> {
  return (
    (await rpc<State | null>("read_tournament", { env })) ?? initialState(env)
  );
}
export async function loadPublic(env: State["environment"]): Promise<State> {
  return (
    (await rpc<State | null>("read_public_tournament", { env })) ??
    initialState(env)
  );
}
export async function mutate(
  env: State["environment"],
  fn: (s: State) => State | Promise<State>,
): Promise<State> {
  for (let tries = 0; tries < 8; tries++) {
    const old = await load(env);
    const next = await fn(structuredClone(old));
    if (next.environment !== env) throw Error("Environment mismatch.");
    if (
      await rpc<boolean>("commit_tournament", {
        env,
        expected: old.revision,
        state: next,
      })
    )
      return { ...next, revision: old.revision + 1 };
  }
  throw Error("Another administrator updated the tournament. Please retry.");
}
export async function backup(s: State) {
  const { safeBackup } = await import("../validation");
  await db("backups", { tournament_id: s.environment, payload: safeBackup(s) });
}
