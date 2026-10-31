import "server-only";
import { initialState, type State } from "../model";
import { localMode, hostedReadOnly } from "./local-mode";
import { readLocal, commitLocal, localRows, localLimit } from "./local-store";
export function configured() {
  if (hostedReadOnly()) return false;
  if (localMode()) return true;
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
  if (hostedReadOnly())
    throw Error(
      "The hosted copy is a read-only preview. Use the local site to edit.",
    );
  if (localMode()) return localRows<T>(path, body);
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
  if (localMode()) {
    if (name === "consume_limit") {
      const input = args as {
        bucket: string;
        maximum: number;
        seconds: number;
      };
      return localLimit(input.bucket, input.maximum, input.seconds) as T;
    }
    throw Error("Unsupported local operation.");
  }
  return db<T>(`rpc/${name}`, args);
}
export async function load(env: State["environment"]): Promise<State> {
  if (localMode()) return readLocal(env);
  return (
    (await rpc<State | null>("read_tournament", { env })) ?? initialState(env)
  );
}
export async function loadPublic(env: State["environment"]): Promise<State> {
  if (localMode()) return readLocal(env);
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
      localMode()
        ? commitLocal(env, old.revision, next)
        : await rpc<boolean>("commit_tournament", {
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
