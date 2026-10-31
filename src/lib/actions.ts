import { z } from "zod";
import Decimal from "decimal.js";
import { NAMES, initialState, type State, type Event } from "./model";
import { rebuildHistory, standings } from "./scoring";
import { seedKart, selectWinner } from "./kart";
import {
  scoreRows,
  validateTeamNames,
  validateScreenshotLabels,
  saveFantasyScores,
} from "./fantasy-entry";
const id = z.string().min(1).max(100);
export const number = z
  .string()
  .regex(
    /^\d{1,8}(\.\d{1,4})?$/,
    "Use a nonnegative number, up to 4 decimal places.",
  );
export const signedNumber = z
  .string()
  .regex(
    /^-?\d{1,8}(\.\d{1,4})?$/,
    "Use a valid score with up to 4 decimal places.",
  );
export const profile = z.object({
  team: z.string().trim().min(1).max(40),
  nickname: z.string().trim().max(30).default(""),
  sleeper: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]*$/)
    .max(40)
    .default(""),
});
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("register"), name: z.enum(NAMES), profile }),
  z.object({ type: z.literal("profile"), participantId: id, profile }),
  z.object({
    type: z.literal("remove"),
    participantId: id,
    confirm: z.literal("REMOVE"),
  }),
  z.object({ type: z.literal("regenerate"), participantId: id }),
  z.object({
    type: z.literal("kartAbsent"),
    eventId: id,
    participantId: id,
    absent: z.boolean(),
  }),
  z.object({
    type: z.literal("start"),
    eventId: id,
    order: z.array(id).length(7),
  }),
  z.object({
    type: z.literal("correctOrder"),
    eventId: id,
    order: z.array(id).length(7),
    reason: z.string().min(10).max(500),
  }),
  z.object({
    type: z.literal("result"),
    eventId: id,
    participantId: id,
    value: number.nullable(),
    absent: z.boolean(),
    note: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("finalize"),
    eventId: id,
    confirm: z.literal("FINALIZE"),
  }),
  z.object({
    type: z.literal("reopen"),
    eventId: id,
    confirm: z.literal("REOPEN"),
  }),
  z.object({
    type: z.literal("event"),
    eventId: id,
    name: z.string().min(1).max(80),
    weight: number,
    unit: z.string().min(1).max(20),
    description: z.string().max(500),
    rules: z.array(z.string().max(2000)).min(1).max(30),
    direction: z.enum(["asc", "desc"]),
  }),
  z.object({
    type: z.literal("addEvent"),
    name: z.string().min(1).max(80),
    kind: z.enum(["time", "distance", "count"]),
    weight: number,
  }),
  z.object({
    type: z.literal("deleteEvent"),
    eventId: id,
    confirm: z.literal("DELETE"),
  }),
  z.object({ type: z.literal("reorder"), order: z.array(id) }),
  z.object({
    type: z.literal("trial"),
    eventId: id,
    participantId: id,
    value: number,
  }),
  z.object({
    type: z.literal("seed"),
    eventId: id,
    order: z.array(id).length(7),
  }),
  z.object({ type: z.literal("winner"), eventId: id, matchId: id, winner: id }),
  z.object({
    type: z.literal("layout"),
    layout: z.enum(["standings", "events"]),
  }),
  z.object({ type: z.literal("draftOrder"), order: z.array(id).length(7) }),
  z.object({
    type: z.literal("sleeper"),
    leagueId: z.string().regex(/^\d{5,30}$/),
    week: z.number().int().min(1).max(18),
  }),
  z.object({
    type: z.literal("mapping"),
    participantId: id,
    rosterId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("override"),
    participantId: id,
    score: signedNumber,
    reason: z.string().min(10).max(500),
  }),
  z.object({ type: z.literal("reset"), confirm: z.literal("RESET RESULTS") }),
  z.object({
    type: z.literal("fantasyTeamNames"),
    names: z.record(id, z.string().trim().min(2).max(60)),
    labels: z.record(id, z.string().trim().min(2).max(60)).optional(),
  }),
  z.object({
    type: z.literal("fantasyScores"),
    rows: scoreRows,
    sundayOnly: z.literal(true),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("fantasyFinalize"),
    confirm: z.literal("FINALIZE SUNDAY SCORES"),
    gamesEnded: z.literal(true),
  }),
  z.object({
    type: z.literal("manualFantasyFinal"),
    confirm: z.literal("SUNDAY SCORES VERIFIED"),
    reason: z.string().min(20).max(1000),
  }),
  z.object({
    type: z.literal("populate"),
    confirm: z.literal("PRACTICE ONLY"),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export type Authority = {
  admin: boolean;
  participantId?: string;
  credentialHash?: string;
  deviceHash?: string;
};
export function applyAction(
  s: State,
  a: Action,
  auth: Authority,
  now = new Date().toISOString(),
): State {
  const state = structuredClone(s);
  if (!["register", "profile"].includes(a.type) && !auth.admin)
    throw Error("Administrator access required.");
  const e: Event | undefined =
    "eventId" in a
      ? state.events.find((e) => e.id === a.eventId && !e.deleted)
      : undefined;
  if ("eventId" in a && !e) throw Error("Event not found.");
  const ids = state.participants.map((p) => p.id);
  const permutation = (order: string[]) =>
    order.length === ids.length &&
    new Set(order).size === ids.length &&
    ids.every((id) => order.includes(id));
  if ("participantId" in a && !ids.includes(a.participantId))
    throw Error("Participant not found.");
  const participant =
    "participantId" in a
      ? state.participants.find((p) => p.id === a.participantId)
      : undefined;
  switch (a.type) {
    case "register": {
      if (
        state.participants.length >= 7 ||
        state.participants.some((p) => p.name === a.name)
      )
        throw Error(
          "This identity is already claimed or registration is full.",
        );
      if (!auth.credentialHash || !auth.deviceHash)
        throw Error("Secure registration credentials required.");
      state.participants.push({
        id: crypto.randomUUID(),
        name: a.name,
        ...a.profile,
        avatar: "",
        credentialHash: auth.credentialHash,
        deviceHash: auth.deviceHash,
      });
      break;
    }
    case "profile":
      if (!auth.admin && auth.participantId !== a.participantId)
        throw Error("This profile belongs to another competitor.");
      Object.assign(participant!, a.profile);
      break;
    case "remove":
      if (
        state.events.some(
          (e) =>
            e.order.includes(a.participantId) ||
            e.results.some((r) => r.participantId === a.participantId),
        )
      )
        throw Error(
          "This registration has tournament history. Correct its profile or regenerate its link; reset results with a backup before removing it.",
        );
      state.participants = state.participants.filter(
        (p) => p.id !== a.participantId,
      );
      for (const event of state.events) {
        event.results = event.results.filter(
          (r) => r.participantId !== a.participantId,
        );
        event.order = event.order.filter((id) => id !== a.participantId);
        if (event.kind === "kart") {
          event.seeds = [];
          event.matches = [];
          event.trials = {};
          event.results = [];
          if (event.status === "finalized") event.status = "scheduled";
        }
      }
      delete state.fantasy.mappings[a.participantId];
      delete state.fantasy.overrides[a.participantId];
      if (state.fantasy.entry)
        delete state.fantasy.entry.teamNames[a.participantId];
      state.config.draftOrder = [];
      break;
    case "regenerate":
      if (!auth.credentialHash || !auth.deviceHash)
        throw Error("Secure credentials required.");
      participant!.credentialHash = auth.credentialHash;
      participant!.deviceHash = auth.deviceHash;
      break;
    case "start": {
      if (e!.kind === "fantasy")
        throw Error(
          "Fantasy starts automatically from verified eligible games.",
        );
      if (
        e!.status !== "scheduled" ||
        state.events.some(
          (x) => !x.deleted && x.kind !== "fantasy" && x.status === "active",
        )
      )
        throw Error("Only one physical event can be active.");
      if (ids.length !== 7 || !permutation(a.order))
        throw Error("Register all seven and order each competitor once.");
      if (state.events.some((x) => x.status === "finalized")) {
        const ranks = new Map(standings(state).map((r) => [r.id, r.rank]));
        for (let i = 1; i < a.order.length; i++)
          if (ranks.get(a.order[i - 1])! > ranks.get(a.order[i])!)
            throw Error(
              "Order must follow standings. Explicitly order shared ranks.",
            );
      }
      e!.order = [...a.order];
      e!.status = "active";
      e!.startedAt = now;
      break;
    }
    case "result": {
      if (
        e!.status === "scheduled" ||
        e!.kind === "kart" ||
        e!.kind === "fantasy"
      )
        throw Error("Use this event’s specific workflow.");
      if (!a.absent && a.value !== null) {
        if (e!.kind === "count" && !/^\d+$/.test(a.value))
          throw Error("Enter a whole-number count.");
        if (e!.kind === "time" && new Decimal(a.value).decimalPlaces() > 2)
          throw Error("Times use at most 0.01-second precision.");
        if (
          e!.kind === "count" &&
          e!.name === "Higher or Lower" &&
          new Decimal(a.value).gt(51)
        )
          throw Error("A 52-card deck permits at most 51 correct predictions.");
      }
      const r = {
        participantId: a.participantId,
        value: a.absent ? null : a.value,
        absent: a.absent,
        note: a.note,
      };
      e!.results = e!.results.filter(
        (r) => r.participantId !== a.participantId,
      );
      if (a.absent || a.value !== null) e!.results.push(r);
      break;
    }
    case "finalize": {
      if (e!.kind === "fantasy")
        throw Error(
          "Fantasy finalizes through the verified feed after the correction window.",
        );
      if (
        e!.status !== "active" ||
        ids.length !== 7 ||
        ids.some(
          (id) =>
            !e!.results.some(
              (r) => r.participantId === id && (r.absent || r.value !== null),
            ),
        )
      )
        throw Error(
          "All seven need a result or explicit absence before finalizing.",
        );
      e!.status = "finalized";
      e!.finalizedAt = now;
      break;
    }
    case "reopen":
      if (e!.status !== "finalized") throw Error("Event is not finalized.");
      if (
        e!.kind !== "fantasy" &&
        state.events.some(
          (x) =>
            x.id !== e!.id && x.kind !== "fantasy" && x.status === "active",
        )
      )
        throw Error("Another physical event is active.");
      e!.status = "active";
      delete e!.finalizedAt;
      state.fantasy.stableSince = undefined;
      if (e!.kind === "fantasy") {
        state.fantasy.status = "Provisional · reopened";
        state.fantasy.warning = "";
      }
      break;
    case "correctOrder":
      if (
        e!.status === "scheduled" ||
        e!.kind === "fantasy" ||
        !permutation(a.order)
      )
        throw Error(
          "A started physical event needs all seven competitors in its order.",
        );
      e!.originalOrder ??= [...e!.order];
      e!.order = [...a.order];
      break;
    case "event":
      if (new Decimal(a.weight).lte(0) || new Decimal(a.weight).gt(100))
        throw Error("Weight must be above 0 and at most 100.");
      Object.assign(e!, {
        name: a.name,
        weight: a.weight,
        description: a.description,
        rules: a.rules,
        direction: a.direction,
        unit: a.unit,
      });
      break;
    case "addEvent": {
      if (new Decimal(a.weight).lte(0) || new Decimal(a.weight).gt(100))
        throw Error("Invalid weight.");
      const base = initialState().events[0];
      const event = {
        ...base,
        id: crypto.randomUUID(),
        name: a.name,
        kind: a.kind,
        weight: a.weight,
        unit: a.kind === "count" ? "count" : a.kind === "time" ? "sec" : "cm",
        rules: ["Administrator: add the rules before starting."],
        direction: a.kind === "count" ? ("desc" as const) : ("asc" as const),
      };
      const idx = state.events.findIndex((x) => x.kind === "fantasy");
      state.events.splice(idx < 0 ? state.events.length : idx, 0, event);
      break;
    }
    case "deleteEvent":
      if (e!.kind === "fantasy")
        throw Error("The fantasy finale cannot be deleted.");
      e!.deleted = true;
      break;
    case "reorder": {
      const events = state.events.filter((e) => !e.deleted);
      if (
        a.order.length !== events.length ||
        new Set(a.order).size !== events.length ||
        events.some((e) => !a.order.includes(e.id))
      )
        throw Error("Invalid schedule.");
      if (state.events.find((e) => e.id === a.order.at(-1))?.kind !== "fantasy")
        throw Error("Fantasy must remain last.");
      state.events = [
        ...a.order.map((id) => events.find((e) => e.id === id)!),
        ...state.events.filter((e) => e.deleted),
      ];
      break;
    }
    case "kartAbsent": {
      if (e!.kind !== "kart" || e!.status === "scheduled")
        throw Error("Start Mario Kart first.");
      if (
        e!.status === "finalized" &&
        state.events.some(
          (x) =>
            !x.deleted &&
            x.id !== e!.id &&
            x.kind !== "fantasy" &&
            x.status === "active",
        )
      )
        throw Error("Finish the active physical event first.");
      e!.results = e!.results.filter(
        (r) => r.participantId !== a.participantId && r.absent,
      );
      if (a.absent)
        e!.results.push({
          participantId: a.participantId,
          value: null,
          absent: true,
        });
      e!.matches = [];
      e!.seeds = [];
      e!.status = "active";
      delete e!.finalizedAt;
      break;
    }
    case "trial":
      if (e!.kind !== "kart" || e!.status === "scheduled")
        throw Error("Start Mario Kart first.");
      if (
        e!.status === "finalized" &&
        state.events.some(
          (x) =>
            !x.deleted &&
            x.id !== e!.id &&
            x.kind !== "fantasy" &&
            x.status === "active",
        )
      )
        throw Error(
          "Finish the active physical event before reopening Mario Kart.",
        );
      e!.trials[a.participantId] = a.value;
      e!.seeds = [];
      e!.matches = [];
      e!.results = e!.results.filter((r) => r.absent);
      if (e!.status === "finalized") {
        e!.status = "active";
        delete e!.finalizedAt;
      }
      break;
    case "seed":
      if (e!.kind !== "kart" || e!.status !== "active")
        throw Error("Mario Kart must be active.");
      seedKart(e!, a.order, ids);
      break;
    case "winner":
      if (e!.kind !== "kart" || e!.status === "scheduled")
        throw Error("Start Mario Kart first.");
      if (
        e!.status === "finalized" &&
        state.events.some(
          (x) =>
            !x.deleted &&
            x.id !== e!.id &&
            x.kind !== "fantasy" &&
            x.status === "active",
        ) &&
        !["final", "third"].includes(a.matchId)
      )
        throw Error(
          "Finish the active physical event before reopening Mario Kart.",
        );
      selectWinner(e!, a.matchId, a.winner);
      if (e!.status === "finalized" && e!.results.length !== 7) {
        e!.status = "active";
        delete e!.finalizedAt;
      }
      break;
    case "layout":
      state.config.layout = a.layout;
      break;
    case "draftOrder": {
      if (
        !permutation(a.order) ||
        state.events
          .filter((e) => !e.deleted)
          .some((e) => e.status !== "finalized")
      )
        throw Error("Resolve ordering after the tournament is complete.");
      const ranks = new Map(standings(state).map((x) => [x.id, x.rank]));
      for (let i = 1; i < 7; i++)
        if (ranks.get(a.order[i - 1])! > ranks.get(a.order[i])!)
          throw Error("Manual resolution may only order tied competitors.");
      state.config.draftOrder = a.order;
      break;
    }
    case "fantasyTeamNames": {
      validateTeamNames(state, a.names);
      validateScreenshotLabels(state, a.names, a.labels ?? {});
      state.fantasy.entry = {
        ...state.fantasy.entry,
        teamNames: a.names,
        labels: a.labels ?? {},
      };
      break;
    }
    case "fantasyScores": {
      if (s.revision !== a.expectedRevision)
        throw Error(
          "The tournament changed while you were entering scores. Refresh and review the current values before saving.",
        );
      saveFantasyScores(state, a.rows, { type: "manual" }, now);
      break;
    }
    case "fantasyFinalize": {
      const finale = state.events.find(
        (e) => !e.deleted && e.kind === "fantasy",
      );
      if (
        !finale ||
        finale.status !== "active" ||
        ids.length !== 7 ||
        ids.some(
          (id) =>
            !finale.results.some(
              (r) => r.participantId === id && r.value !== null && !r.absent,
            ),
        )
      )
        throw Error(
          "Save provisional scores for all seven competitors before finalizing.",
        );
      if (
        state.environment === "production" &&
        now < "2026-11-09T04:00:00.000Z"
      )
        throw Error(
          "Finalization opens late Sunday. Verify every eligible Sunday game has ended before finalizing.",
        );
      finale.status = "finalized";
      finale.finalizedAt = now;
      state.fantasy.status = "Finalized · admin verified";
      state.fantasy.warning = "";
      break;
    }
    case "sleeper":
    case "mapping":
      throw Error(
        "Direct league integration has been retired. Use manual scores or a reviewed screenshot.",
      );
    case "override":
      state.fantasy.overrides[a.participantId] = {
        score: a.score,
        reason: a.reason,
      };
      state.fantasy.stableSince = undefined;
      {
        const finale = state.events.find(
          (e) => e.kind === "fantasy" && !e.deleted,
        );
        if (finale && finale.status !== "scheduled") {
          finale.results = finale.results.filter(
            (r) => r.participantId !== a.participantId,
          );
          finale.results.push({
            participantId: a.participantId,
            value: a.score,
            absent: false,
            note: a.reason,
          });
        }
      }
      break;
    case "manualFantasyFinal": {
      if (
        state.participants.length !== 7 ||
        state.events.some(
          (e) => !e.deleted && e.kind !== "fantasy" && e.status !== "finalized",
        )
      )
        throw Error("Finish all physical events before the finale.");
      if (
        state.environment === "production" &&
        now < "2026-11-09T04:00:00.000Z"
      )
        throw Error(
          "Emergency finalization is available only after the Sunday games.",
        );
      if (ids.some((id) => !state.fantasy.overrides[id]))
        throw Error(
          "Enter an audited Sunday-only score override for all seven competitors first.",
        );
      const event = state.events.find(
        (e) => !e.deleted && e.kind === "fantasy",
      )!;
      event.results = ids.map((id) => ({
        participantId: id,
        value: state.fantasy.overrides[id].score,
        absent: false,
        note: state.fantasy.overrides[id].reason,
      }));
      event.status = "finalized";
      event.finalizedAt = now;
      state.fantasy.status = "Finalized · audited overrides";
      state.fantasy.warning = `Manual verification: ${a.reason}`;
      break;
    }
    case "reset":
      for (const event of state.events) {
        event.status = "scheduled";
        event.order = [];
        delete event.originalOrder;
        event.results = [];
        event.seeds = [];
        event.trials = {};
        event.matches = [];
        delete event.finalizedAt;
        delete event.startedAt;
      }
      state.snapshots = [];
      state.config.draftOrder = [];
      state.fantasy = {
        ...initialState().fantasy,
        leagueId: state.fantasy.leagueId,
        week: state.fantasy.week,
        entry: {
          teamNames: state.fantasy.entry?.teamNames ?? {},
          labels: state.fantasy.entry?.labels ?? {},
        },
      };
      break;
    case "populate":
      if (state.environment !== "practice")
        throw Error("Sample players are allowed only in practice.");
      if (state.participants.length)
        throw Error("Reset or remove practice registrations first.");
      state.participants = NAMES.map((name, i) => ({
        id: `practice-${i}`,
        name,
        team: `${name}’s practice team`,
        nickname: "",
        sleeper: "",
        avatar: "",
        credentialHash: "",
        deviceHash: "",
      }));
      break;
  }
  rebuildHistory(state);
  const safeOld = {
    ...s,
    participants: s.participants.map(
      ({ credentialHash: _c, deviceHash: _d, ...p }) => p,
    ),
  };
  const reference =
    "eventId" in a
      ? a.eventId
      : "participantId" in a
        ? a.participantId
        : "tournament";
  const old =
    "eventId" in a
      ? s.events.find((e) => e.id === a.eventId)
      : "participantId" in a
        ? safeOld.participants.find((p) => p.id === a.participantId)
        : a.type === "layout"
          ? s.config.layout
          : null;
  state.audit.push({
    id: crypto.randomUUID(),
    at: now,
    action: a.type,
    reference,
    old: old ?? null,
    value: a,
  });
  return state;
}
