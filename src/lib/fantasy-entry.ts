import { z } from "zod";
import Decimal from "decimal.js";
import type { State } from "./model";
import { rebuildHistory, standings } from "./scoring";

export const fantasyScore = z
  .string()
  .regex(
    /^-?\d{1,8}(\.\d{1,4})?$/,
    "Enter a fantasy score with up to four decimal places.",
  );
export const scoreRows = z
  .array(
    z.object({
      participantId: z.string().min(1).max(100),
      score: fantasyScore,
    }),
  )
  .length(7);
export const normalizeTeam = (name: string) =>
  name
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\.{2,}$/, "...");
export function validateTeamNames(
  s: { participants: { id: string }[] },
  names: Record<string, string>,
) {
  if (
    s.participants.length !== 7 ||
    Object.keys(names).length !== 7 ||
    s.participants.some((p) => !names[p.id]?.trim())
  )
    throw Error(
      "Configure a screenshot team name for all seven registered competitors first.",
    );
  const keys = Object.values(names).map(normalizeTeam);
  if (keys.some((n) => n.length < 2 || n.length > 60 || !/[\p{L}]/u.test(n)))
    throw Error(
      "Each screenshot team name needs 2–60 characters and at least one letter.",
    );
  if (new Set(keys).size !== 7)
    throw Error(
      "Screenshot team names must be unique, ignoring case and extra spaces.",
    );
  return names;
}
export function validateScreenshotLabels(
  s: { participants: { id: string }[] },
  names: Record<string, string>,
  labels: Record<string, string> = {},
) {
  validateTeamNames(s, names);
  if (
    Object.entries(labels).some(
      ([id, label]) => !names[id] || !label.trim() || label.length > 60,
    )
  )
    throw Error(
      "Screenshot labels must belong to a configured team and contain 2–60 characters.",
    );
  return validateTeamNames(
    s,
    Object.fromEntries(
      Object.entries(names).map(([id, name]) => [id, labels[id] || name]),
    ),
  );
}
export type EntrySource =
  | { type: "manual" }
  | {
      type: "screenshot";
      importId: string;
      imageHash: string;
      fileName: string;
      teams: {
        participantId: string;
        teamName: string;
        matchedLabel?: string;
        column?: "Total Pts";
        score: string;
        confidence: number;
      }[];
    };
export function saveFantasyScores(
  s: State,
  rows: z.infer<typeof scoreRows>,
  source: EntrySource,
  now: string,
) {
  scoreRows.parse(rows);
  const ids = s.participants.map((p) => p.id);
  if (
    ids.length !== 7 ||
    new Set(rows.map((r) => r.participantId)).size !== 7 ||
    ids.some((id) => !rows.some((r) => r.participantId === id))
  )
    throw Error(
      "Every update must contain exactly one score for each of the seven competitors.",
    );
  if (
    s.events.some(
      (e) => !e.deleted && e.kind !== "fantasy" && e.status !== "finalized",
    )
  )
    throw Error("Finalize all physical events before entering fantasy scores.");
  if (s.environment === "production" && now < "2026-11-08T05:00:00.000Z")
    throw Error(
      "Official fantasy scoring opens on Sunday, November 8, 2026. Use practice to rehearse.",
    );
  const event = s.events.find((e) => !e.deleted && e.kind === "fantasy");
  if (!event) throw Error("Fantasy event not found.");
  if (event.status === "finalized")
    throw Error("Reopen the fantasy event before replacing finalized scores.");
  if (
    source.type === "screenshot" &&
    s.audit.some(
      (a) =>
        a.action === "fantasyScreenshot" &&
        (a.value as { imageHash?: string })?.imageHash === source.imageHash,
    )
  )
    throw Error(
      "This screenshot has already been applied. Upload a newer screenshot or enter a manual correction.",
    );
  const old = structuredClone(event.results);
  event.results = rows.map((r) => ({
    participantId: r.participantId,
    value: new Decimal(r.score).toString(),
    absent: false,
    note:
      source.type === "screenshot"
        ? "Admin-reviewed screenshot"
        : "Admin-entered Sunday score",
  }));
  event.status = "active";
  event.startedAt ??= now;
  s.config.draftOrder = [];
  s.fantasy.entry = {
    ...s.fantasy.entry,
    teamNames: s.fantasy.entry?.teamNames ?? {},
    updatedAt: now,
    source: source.type,
  };
  s.fantasy.status = "Provisional · admin updated";
  s.fantasy.warning = "";
  s.fantasy.lastSuccess = now;
  rebuildHistory(s);
  s.snapshots.push({
    id: `live-${crypto.randomUUID()}`,
    eventId: event.id,
    at: now,
    label:
      source.type === "screenshot"
        ? "Fantasy screenshot"
        : "Fantasy manual update",
    standings: standings(s),
    fantasyResults: structuredClone(event.results),
  });
  s.snapshots = [
    ...s.snapshots.filter((x) => !x.id.startsWith("live-")),
    ...s.snapshots.filter((x) => x.id.startsWith("live-")).slice(-100),
  ];
  s.audit.push({
    id: crypto.randomUUID(),
    at: now,
    action:
      source.type === "screenshot"
        ? "fantasyScreenshot"
        : "fantasyManualScores",
    reference: event.id,
    old,
    value: { ...source, rows },
  });
  return s;
}
