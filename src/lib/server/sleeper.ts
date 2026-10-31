import "server-only";
import { z } from "zod";
import { type State } from "../model";
import { applyFantasy, feedSchema } from "../fantasy";
import { load, mutate, rpc } from "./store";
const BASE = "https://api.sleeper.app/v1";
async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw Error(`Sleeper request failed (${res.status}).`);
  return res.json();
}
const rosterSchema = z.array(
  z
    .object({
      roster_id: z.number().int(),
      owner_id: z.string().nullable(),
      co_owners: z.array(z.string()).nullable().optional(),
    })
    .passthrough(),
);
const leagueSchema = z
  .object({
    league_id: z.string(),
    season: z.literal("2026"),
    sport: z.literal("nfl"),
    scoring_settings: z.record(z.string(), z.number()),
    roster_positions: z.array(z.string()),
    name: z.string(),
  })
  .passthrough();
export async function syncLeague(s: State) {
  if (!s.fantasy.leagueId) throw Error("Configure a Sleeper league ID first.");
  const [rawLeague, rawRosters, users] = await Promise.all([
    get(`/league/${s.fantasy.leagueId}`),
    get(`/league/${s.fantasy.leagueId}/rosters`),
    get(`/league/${s.fantasy.leagueId}/users`),
  ]);
  const league = leagueSchema.parse(rawLeague),
    rosters = rosterSchema.parse(rawRosters);
  s.fantasy.league = league;
  s.fantasy.rosters = rosters;
  s.fantasy.users = users;
  for (const p of s.participants)
    if (!s.fantasy.manualMappings.includes(p.id))
      delete s.fantasy.mappings[p.id];
  for (const p of s.participants) {
    if (s.fantasy.manualMappings.includes(p.id)) continue;
    delete s.fantasy.mappings[p.id];
    if (!p.sleeper) continue;
    const user = await get(`/user/${encodeURIComponent(p.sleeper)}`);
    const roster = rosters.find(
      (r) =>
        r.owner_id === user?.user_id || r.co_owners?.includes(user?.user_id),
    );
    if (roster && !Object.values(s.fantasy.mappings).includes(roster.roster_id))
      s.fantasy.mappings[p.id] = roster.roster_id;
  }
  if (
    !s.fantasy.playersAt ||
    Date.now() - new Date(s.fantasy.playersAt).getTime() > 86400000
  ) {
    const players = z
      .record(
        z.string(),
        z.object({
          full_name: z.string().nullable().optional(),
          first_name: z.string().nullable().optional(),
          last_name: z.string().nullable().optional(),
          team: z.string().nullable(),
          position: z.string().nullable(),
        }),
      )
      .parse(await get("/players/nfl"));
    s.fantasy.players = Object.fromEntries(
      Object.entries(players).map(([id, p]) => [
        id,
        {
          name:
            p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          team: p.team ?? "",
          position: p.position ?? "",
        },
      ]),
    );
    s.fantasy.playersAt = new Date().toISOString();
  }
  const unmatched = s.participants.filter((p) => !s.fantasy.mappings[p.id]);
  s.fantasy.warning = unmatched.length
    ? `Unmatched rosters: ${unmatched.map((p) => p.name).join(", ")}`
    : "";
  s.fantasy.status = "League imported";
  return s;
}
export async function pollFantasy(env: State["environment"]) {
  if (
    !(await rpc<boolean>("acquire_worker", {
      lock_id: `fantasy:${env}`,
      seconds: 25,
    }))
  )
    return { skipped: true };
  let s = await load(env);
  try {
    if (!process.env.FANTASY_FEED_URL)
      throw Error(
        "Sunday schedule/player-level scoring feed is not configured. Weekly aggregate totals cannot establish Sunday eligibility.",
      );
    const url = new URL(process.env.FANTASY_FEED_URL);
    if (url.protocol !== "https:")
      throw Error("The fantasy feed must use HTTPS.");
    if (
      !s.fantasy.league ||
      !s.fantasy.playersAt ||
      Date.now() - new Date(s.fantasy.playersAt).getTime() > 86400000
    )
      s = await syncLeague(s);
    const [rawFeed, rawMatchups] = await Promise.all([
      fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.FANTASY_FEED_TOKEN ?? ""}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }).then((r) => {
        if (!r.ok) throw Error("Sunday scoring provider is unavailable.");
        return r.json();
      }),
      get(`/league/${s.fantasy.leagueId}/matchups/${s.fantasy.week}`),
    ]);
    const feed = feedSchema.parse(rawFeed),
      matchups = z
        .array(
          z.object({
            roster_id: z.number().int(),
            starters: z.array(z.string()),
          }),
        )
        .parse(rawMatchups);
    // Never commit fetched data over a newer admin correction: reducer uses current state.
    await mutate(env, (current) => {
      current.fantasy = {
        ...s.fantasy,
        ...current.fantasy,
        league: current.fantasy.league ?? s.fantasy.league,
        players: current.fantasy.playersAt
          ? current.fantasy.players
          : s.fantasy.players,
        playersAt: current.fantasy.playersAt ?? s.fantasy.playersAt,
        mappings: { ...s.fantasy.mappings, ...current.fantasy.mappings },
      };
      current.fantasy.lastAttempt = new Date().toISOString();
      return applyFantasy(current, feed, matchups);
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scoring unavailable";
    await mutate(env, (current) => {
      current.fantasy.status = "Data pending";
      current.fantasy.warning = message;
      current.fantasy.lastAttempt = new Date().toISOString();
      current.fantasy.stableSince = undefined;
      return current;
    });
    return { ok: false, error: message };
  }
}
