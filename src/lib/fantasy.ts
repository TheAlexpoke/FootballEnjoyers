import { z } from "zod";
import Decimal from "decimal.js";
import type { State, Game, FantasyLine } from "./model";
import { standings, rebuildHistory } from "./scoring";
export const FINALE_DATE = "2026-11-08";
export const dateInNewYork = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function eligibleGame(game: Game) {
  return dateInNewYork(game.kickoff) === FINALE_DATE;
}
const gameSchema = z.object({
  id: z.string(),
  home: z.string(),
  away: z.string(),
  kickoff: z.iso.datetime(),
  status: z.enum(["scheduled", "live", "final"]),
});
export const feedSchema = z.object({
  season: z.literal("2026"),
  week: z.number().int(),
  updatedAt: z.iso.datetime(),
  scheduleComplete: z.literal(true),
  games: z.array(gameSchema).min(1),
  scores: z.record(
    z.string(),
    z.object({
      gameId: z.string(),
      score: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
    }),
  ),
  leagueId: z.string(),
  scoringSettings: z.record(z.string(), z.number()),
});
export type Feed = z.infer<typeof feedSchema>;
export type Matchup = {
  roster_id: number;
  starters: string[];
  players_points?: Record<string, number>;
};
export function applyFantasy(
  s: State,
  feed: Feed,
  matchups: Matchup[],
  now = new Date(),
): State {
  if (s.environment === "practice" && feed.leagueId !== s.fantasy.leagueId)
    throw Error("Practice league mismatch.");
  const event = s.events.find((e) => e.kind === "fantasy" && !e.deleted);
  if (!event) throw Error("Fantasy event missing.");
  if (feed.leagueId !== s.fantasy.leagueId || feed.week !== s.fantasy.week)
    throw Error("Scoring feed does not match configured league/week.");
  const settings = s.fantasy.league?.scoring_settings;
  if (!settings || typeof settings !== "object")
    throw Error("Import Sleeper scoring settings first.");
  const canonical = (v: Record<string, unknown>) =>
    JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  if (
    canonical(settings as Record<string, unknown>) !==
    canonical(feed.scoringSettings)
  )
    throw Error("Feed scoring settings differ from the actual Sleeper league.");
  const age = now.getTime() - new Date(feed.updatedAt).getTime();
  if (age > 120000 || age < -30000)
    throw Error("Scoring feed is stale or has a future timestamp.");
  const games = feed.games.filter(eligibleGame);
  if (!games.length) throw Error("No verified games for November 8, 2026.");
  if (new Set(feed.games.map((g) => g.id)).size !== feed.games.length)
    throw Error("Duplicate games in schedule.");
  s.fantasy.games = feed.games;
  s.fantasy.sourceUpdatedAt = feed.updatedAt;
  const hasStarted = games.some(
    (g) => g.status !== "scheduled" && new Date(g.kickoff) <= now,
  );
  if (!hasStarted) {
    s.fantasy.status = "Waiting for Sunday kickoff";
    return s;
  }
  if (
    s.participants.length !== 7 ||
    s.events.some(
      (e) => !e.deleted && e.kind !== "fantasy" && e.status !== "finalized",
    )
  )
    throw Error(
      "Complete all physical events and register all seven before fantasy begins.",
    );
  const positionSlots =
    (s.fantasy.league?.roster_positions as string[] | undefined)?.filter(
      (x) => x !== "BN",
    ) ?? [];
  const lineups: Record<string, FantasyLine[]> = {};
  const mappingValues = Object.values(s.fantasy.mappings);
  if (new Set(mappingValues).size !== mappingValues.length)
    throw Error("Duplicate roster mappings.");
  if (new Set(matchups.map((m) => m.roster_id)).size !== matchups.length)
    throw Error("Duplicate weekly rosters.");
  const results = [];
  for (const p of s.participants) {
    const roster = s.fantasy.mappings[p.id];
    const matchup = matchups.find((m) => m.roster_id === roster);
    const override = s.fantasy.overrides[p.id];
    if (!matchup && !override)
      throw Error(`Missing Sleeper roster for ${p.name}.`);
    let total = new Decimal(0);
    const lines: FantasyLine[] = [];
    if (matchup)
      for (const [i, id] of matchup.starters.entries()) {
        if (id === "0") continue;
        const player = s.fantasy.players[id];
        if (!player) throw Error(`Missing NFL metadata for starter ${id}.`);
        const game = feed.games.find(
          (g) => g.home === player.team || g.away === player.team,
        );
        // A complete weekly schedule explicitly excludes bye-week players.
        const eligible = !!game && eligibleGame(game);
        let score = "0";
        if (eligible) {
          const item = feed.scores[id];
          if (!item || item.gameId !== game!.id) {
            if (!override)
              throw Error(
                `Missing Sunday player-level score for ${player.name}.`,
              );
          } else score = item.score;
          total = total.plus(score);
        }
        lines.push({
          id,
          name: player.name,
          team: player.team,
          position: player.position,
          slot: positionSlots[i] ?? `Starter ${i + 1}`,
          score,
          eligible,
        });
      }
    lineups[p.id] = lines;
    results.push({
      participantId: p.id,
      value: override?.score ?? total.toString(),
      absent: false,
      note: override?.reason,
    });
  }
  const fingerprint = JSON.stringify(
    results.map((r) => [r.participantId, r.value]).sort(),
  );
  if (s.fantasy.fingerprint !== fingerprint) {
    s.fantasy.stableSince = now.toISOString();
    s.fantasy.fingerprint = fingerprint;
  }
  s.fantasy.stableSince ??= now.toISOString();
  s.fantasy.lineups = lineups;
  const oldResults = JSON.stringify(event.results);
  event.results = results;
  if (event.status === "scheduled") {
    event.status = "active";
    event.startedAt = now.toISOString();
  }
  const allFinal = games.every((g) => g.status === "final");
  // Require complete player data and 30 minutes of unchanged totals after all games end.
  if (!allFinal) s.fantasy.stableSince = now.toISOString();
  if (
    allFinal &&
    now.getTime() - new Date(s.fantasy.stableSince).getTime() >= 30 * 60000
  ) {
    event.status = "finalized";
    event.finalizedAt ??= now.toISOString();
    s.fantasy.status = "Finalized";
  } else
    s.fantasy.status =
      event.status === "finalized"
        ? "Finalized · corrected"
        : allFinal
          ? "Awaiting stat-correction window"
          : "Live · provisional";
  if (event.status === "finalized") rebuildHistory(s);
  else if (oldResults !== JSON.stringify(results)) {
    s.snapshots.push({
      id: `live-${crypto.randomUUID()}`,
      eventId: event.id,
      at: now.toISOString(),
      label: "Fantasy live",
      standings: standings(s),
      fantasyResults: structuredClone(results),
    });
    const finals = s.snapshots.filter((x) => !x.id.startsWith("live-"));
    s.snapshots = [
      ...finals,
      ...s.snapshots.filter((x) => x.id.startsWith("live-")).slice(-100),
    ];
  }
  s.fantasy.lastSuccess = now.toISOString();
  s.fantasy.warning = "";
  return s;
}
