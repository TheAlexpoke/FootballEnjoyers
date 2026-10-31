import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const origin = "http://127.0.0.1:3000";
const response = await fetch(origin + "/api/state");
if (!response.ok)
  throw Error("Start the local site before publishing a snapshot.");
const local = await response.json();
if (local.environment !== "production" || !local.localMode)
  throw Error("Only the official local tournament may be published.");
const participants = [];
for (const player of local.participants) {
  let avatar = "";
  if (player.avatar) {
    const url = new URL(player.avatar, origin);
    if (url.origin !== origin || url.pathname !== "/api/local-avatar")
      throw Error("Photo must come from this local tournament.");
    const image = await fetch(url);
    const contentType = image.headers.get("content-type");
    const extension = {
      "image/png": "png",
      "image/webp": "webp",
      "image/jpeg": "jpg",
    }[contentType];
    if (!image.ok || !extension)
      throw Error("Could not read " + player.name + "'s photo.");
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) throw Error("Photo exceeds 3 MB.");
    const digest = createHash("sha256")
      .update(bytes)
      .digest("hex")
      .slice(0, 12);
    const filename = player.name.toLowerCase() + "-" + digest + "." + extension;
    await mkdir(resolve(root, "public/images/players"), { recursive: true });
    await writeFile(resolve(root, "public/images/players", filename), bytes);
    avatar = "/images/players/" + filename;
  }
  participants.push({
    id: player.id,
    name: player.name,
    team: player.team,
    nickname: "",
    sleeper: "",
    avatar,
  });
}
const events = local.events
  .filter((event) => !event.deleted)
  .map((event) => ({
    id: event.id,
    name: event.name,
    weight: event.weight,
    kind: event.kind,
    unit: event.unit,
    direction: event.direction,
    description: event.description,
    rules: event.rules,
    status: event.status,
    order: event.order,
    results: event.results.map(({ participantId, value, absent }) => ({
      participantId,
      value,
      absent,
    })),
    seeds: event.seeds,
    trials: event.trials,
    matches: event.matches,
  }));
// Explicit allowlist: no database dump, audit, backups, private links or credentials.
const snapshot = {
  version: 1,
  revision: local.revision,
  environment: "production",
  participants,
  events,
  snapshots: local.snapshots.map(({ id, eventId, at, label, standings }) => ({
    id,
    eventId,
    at,
    label,
    standings: standings.map(({ id, rank, points, finishes }) => ({
      id,
      rank,
      points,
      finishes,
    })),
  })),
  config: { layout: "standings", draftOrder: local.config.draftOrder },
  fantasy: {
    entry: { teamNames: {} },
    leagueId: "",
    week: 9,
    league: null,
    users: [],
    rosters: [],
    mappings: {},
    manualMappings: [],
    players: {},
    lineups: {},
    overrides: {},
    games: [],
    status: "Published scores",
    warning: "",
  },
  standings: local.standings.map(({ id, rank, points, finishes }) => ({
    id,
    rank,
    points,
    finishes,
  })),
  phase: local.phase,
  configured: true,
  readOnly: true,
  localMode: false,
  sharedSnapshotAt: new Date().toISOString(),
};
await mkdir(resolve(root, "src/data"), { recursive: true });
await writeFile(
  resolve(root, "src/data/shared-tournament.json"),
  JSON.stringify(snapshot, null, 2) + "\n",
);
console.log(
  `Prepared public snapshot: ${participants.length} players, ${events.length} events. Local scores and originals unchanged.`,
);
