import { z } from "zod";
import { NAMES, type State } from "./model";
import { number, signedNumber, profile } from "./actions";
import { rebuildHistory } from "./scoring";
import { rebuildBracket } from "./kart";
const id = z.string().min(1).max(100);
const result = z.object({
  participantId: id,
  value: signedNumber.nullable(),
  absent: z.boolean(),
  note: z.string().max(500).optional(),
});
const event = z.object({
  id,
  name: z.string().min(1).max(80),
  weight: number.refine((v) => Number(v) > 0 && Number(v) <= 100),
  kind: z.enum(["time", "distance", "count", "kart", "fantasy"]),
  unit: z.string().max(20),
  direction: z.enum(["asc", "desc"]),
  description: z.string().max(500),
  rules: z.array(z.string().max(2000)).min(1).max(30),
  status: z.enum(["scheduled", "active", "finalized"]),
  order: z.array(id).max(7),
  originalOrder: z.array(id).max(7).optional(),
  results: z.array(result).max(7),
  seeds: z.array(id).max(7),
  trials: z.record(id, number),
  matches: z
    .array(z.object({ id, a: id, b: id, winner: id.optional() }))
    .max(7),
  finalizedAt: z.iso.datetime().optional(),
  startedAt: z.iso.datetime().optional(),
  deleted: z.boolean().optional(),
});
export const backupSchema = z.object({
  format: z.literal("football-enjoyers/v1"),
  createdAt: z.iso.datetime(),
  state: z.object({
    version: z.literal(1),
    environment: z.enum(["production", "practice"]),
    revision: z.number().int().nonnegative(),
    participants: z
      .array(
        profile.extend({
          id,
          name: z.enum(NAMES),
          avatar: z.string().max(2000),
        }),
      )
      .max(7),
    events: z.array(event).min(1).max(50),
    audit: z
      .array(
        z.object({
          id,
          at: z.iso.datetime(),
          action: z.string().max(80),
          reference: id,
          old: z.unknown(),
          value: z.unknown(),
        }),
      )
      .max(20000)
      .default([]),
    snapshots: z
      .array(
        z.object({
          id,
          eventId: id,
          at: z.iso.datetime(),
          label: z.string().max(100),
          standings: z
            .array(
              z.object({
                id,
                rank: z.number().int().min(1).max(7),
                points: number,
                finishes: z.array(z.number().int().nonnegative()).length(7),
                averagePlacement: z
                  .string()
                  .regex(/^\d+(\.\d+)?$/)
                  .nullable()
                  .optional(),
                consistencyBonus: z.enum(["0", "5"]).optional(),
              }),
            )
            .max(7),
          fantasyResults: z.array(result).max(7).optional(),
        }),
      )
      .max(500)
      .default([]),
    config: z.object({
      layout: z.enum(["standings", "events"]),
      draftOrder: z.array(id).max(7),
    }),
    fantasy: z.object({
      entry: z
        .object({
          teamNames: z.record(id, z.string().min(2).max(60)),
          labels: z.record(id, z.string().min(2).max(60)).optional(),
          updatedAt: z.iso.datetime().optional(),
          source: z.enum(["manual", "screenshot"]).optional(),
        })
        .optional(),
      leagueId: z.string().regex(/^\d*$/),
      week: z.number().int().min(1).max(18),
      mappings: z.record(id, z.number().int().positive()),
      manualMappings: z.array(id),
      overrides: z.record(
        id,
        z.object({ score: signedNumber, reason: z.string().min(10).max(500) }),
      ),
    }),
  }),
});
export function safeBackup(s: State) {
  return structuredClone({
    format: "football-enjoyers/v1" as const,
    createdAt: new Date().toISOString(),
    state: {
      version: s.version,
      revision: s.revision,
      environment: s.environment,
      participants: s.participants.map(
        ({ credentialHash: _c, deviceHash: _d, ...p }) => p,
      ),
      events: s.events,
      audit: s.audit,
      snapshots: s.snapshots,
      config: s.config,
      fantasy: {
        entry: s.fantasy.entry,
        leagueId: s.fantasy.leagueId,
        week: s.fantasy.week,
        mappings: s.fantasy.mappings,
        manualMappings: s.fantasy.manualMappings,
        overrides: s.fantasy.overrides,
      },
    },
  });
}
export function restoreBackup(current: State, input: unknown): State {
  const { state: s } = backupSchema.parse(input);
  if (s.environment !== current.environment)
    throw Error("Backups can only be restored to their original environment.");
  if (
    new Set(s.participants.map((p) => p.id)).size !== s.participants.length ||
    new Set(s.participants.map((p) => p.name)).size !== s.participants.length
  )
    throw Error("Duplicate registration identities.");
  const ids = s.participants.map((p) => p.id);
  const eventIds = s.events.map((e) => e.id);
  if (
    new Set(eventIds).size !== eventIds.length ||
    s.events.filter((e) => e.kind === "fantasy" && !e.deleted).length !== 1
  )
    throw Error("Invalid event configuration.");
  if (s.events.filter((e) => !e.deleted).at(-1)?.kind !== "fantasy")
    throw Error("Fantasy must be the finale.");
  if (
    s.events.filter(
      (e) => !e.deleted && e.kind !== "fantasy" && e.status === "active",
    ).length > 1
  )
    throw Error("Multiple active physical events.");
  for (const e of s.events) {
    if (
      [
        ...e.order,
        ...e.seeds,
        ...Object.keys(e.trials),
        ...e.results.map((r) => r.participantId),
        ...e.matches.flatMap((m) => [
          m.a,
          m.b,
          ...(m.winner ? [m.winner] : []),
        ]),
      ].some((id) => !ids.includes(id))
    )
      throw Error("Unknown participant reference.");
    if (
      new Set(e.results.map((r) => r.participantId)).size !==
        e.results.length ||
      new Set(e.order).size !== e.order.length
    )
      throw Error("Duplicate results or order entries.");
    if (e.results.some((r) => (r.absent ? r.value !== null : r.value === null)))
      throw Error("Invalid result or absence.");
    if (
      e.kind !== "fantasy" &&
      e.results.some((r) => r.value !== null && Number(r.value) < 0)
    )
      throw Error("Physical results cannot be negative.");
    if (
      e.kind === "count" &&
      e.results.some((r) => r.value !== null && !/^\d+$/.test(r.value))
    )
      throw Error("Counts must be whole numbers.");
    if (
      e.status !== "scheduled" &&
      e.kind !== "fantasy" &&
      (ids.length !== 7 || e.order.length !== 7)
    )
      throw Error(
        "Active physical events require a frozen seven-person order.",
      );
    if (
      e.status === "finalized" &&
      (!e.finalizedAt || ids.length !== 7 || e.results.length !== 7)
    )
      throw Error("Incomplete finalized event.");
    if (e.matches.some((m) => m.winner && ![m.a, m.b].includes(m.winner)))
      throw Error("Invalid bracket winner.");
    if (e.kind === "kart" && e.seeds.length) {
      const canonical = structuredClone(e);
      rebuildBracket(canonical);
      if (JSON.stringify(canonical.matches) !== JSON.stringify(e.matches))
        throw Error("Bracket advancement is inconsistent.");
      const raw = (rows: typeof e.results) =>
        JSON.stringify(
          rows
            .map((r) => [r.participantId, r.value, r.absent])
            .sort(([a], [b]) => String(a).localeCompare(String(b))),
        );
      if (raw(canonical.results) !== raw(e.results))
        throw Error("Mario Kart placements do not match the bracket.");
    }
  }
  if (
    new Set(Object.values(s.fantasy.mappings)).size !==
      Object.values(s.fantasy.mappings).length ||
    Object.keys(s.fantasy.mappings).some((id) => !ids.includes(id))
  )
    throw Error("Invalid roster mappings.");
  const next: State = {
    ...current,
    ...s,
    participants: s.participants.map((p) => {
      if (
        p.avatar &&
        (!p.avatar.startsWith("https://") ||
          !p.avatar.startsWith(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/`,
          ))
      )
        p.avatar = "";
      const existing = current.participants.find(
        (x) => x.id === p.id && x.name === p.name,
      );
      return {
        ...p,
        credentialHash: existing?.credentialHash ?? "",
        deviceHash: existing?.deviceHash ?? "",
      };
    }),
    fantasy: {
      ...current.fantasy,
      ...s.fantasy,
      entry: s.fantasy.entry ?? { teamNames: {} },
      status: "Restored · admin scores",
      warning: "",
      lineups: {},
      lastSuccess: undefined,
      stableSince: undefined,
    },
    revision: current.revision,
    audit: [
      ...current.audit,
      ...s.audit.filter((a) => !current.audit.some((old) => old.id === a.id)),
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: "restore",
        reference: current.environment,
        old: { revision: current.revision },
        value: { backupRevision: s.revision },
      },
    ],
    snapshots: s.snapshots,
  };
  rebuildHistory(next);
  return next;
}
