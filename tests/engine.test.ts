import { describe, it, expect } from "vitest";
import { initialState, NAMES, type State } from "../src/lib/model";
import { actionSchema, applyAction, type Action } from "../src/lib/actions";
import {
  placements,
  standings,
  phase,
  consistencyAward,
  rebuildHistory,
  lastPlaceAward,
} from "../src/lib/scoring";
import { seedKart, selectWinner } from "../src/lib/kart";
import { restoreBackup, safeBackup } from "../src/lib/validation";
import { verifyPassword } from "../src/lib/server/auth";
import { scryptSync } from "node:crypto";
const admin = { admin: true, credentialHash: "testhash", deviceHash: "device" };
export function full(): State {
  let s = initialState("practice");
  s = applyAction(s, { type: "populate", confirm: "PRACTICE ONLY" }, admin);
  return s;
}
const action = (s: State, a: Action) =>
  applyAction(s, actionSchema.parse(a), admin);
function resultEvent(
  s: State,
  index = 0,
  values: string[] = ["1", "2", "3", "4", "5", "6", "7"],
) {
  const e = s.events[index];
  e.results = s.participants.map((p, i) => ({
    participantId: p.id,
    value: values[i],
    absent: false,
  }));
  e.order = s.participants.map((p) => p.id);
  e.status = "finalized";
  e.finalizedAt = new Date(2026, 9, 30, 12, index).toISOString();
  return e;
}
describe("exact scoring", () => {
  it("awards base points in ascending and descending order", () => {
    const s = full();
    const e = resultEvent(s);
    expect(placements(e).map((r) => r.points)).toEqual([
      "15",
      "10",
      "6",
      "3",
      "2",
      "1",
      "0",
    ]);
    e.direction = "desc";
    expect(placements(e).map((r) => r.id)).toEqual(
      s.participants.map((p) => p.id).reverse(),
    );
  });
  it("uses 180 event points plus two 10-point awards in the 200-point breakdown", () => {
    const s = full();
    expect(s.events.map((e) => e.weight)).toEqual([
      "1",
      "1",
      "1",
      "2",
      "2",
      "1",
      "1",
      "3",
    ]);
    s.events.forEach((e, i) => {
      resultEvent(s, i);
      e.direction = "asc";
    });
    expect(standings(s)[0].points).toBe("190");
    expect(
      s.events.reduce((sum, event) => sum + 15 * Number(event.weight), 0) +
        10 +
        10,
    ).toBe(200);
    expect(phase(s)).toBe("Complete");
  });
  it("averages two tied places and skips their occupied positions", () => {
    const s = full();
    const e = resultEvent(s, 0, ["1", "2", "2", "4", "5", "6", "7"]);
    expect(placements(e).map((r) => [r.place, r.points])).toEqual([
      [1, "15"],
      [2, "8"],
      [2, "8"],
      [4, "3"],
      [5, "2"],
      [6, "1"],
      [7, "0"],
    ]);
  });
  it("supports fractional three-way ties and exact weighted ordering", () => {
    const s = full();
    const e = resultEvent(s, 0, ["1", "2", "2", "2", "5", "6", "7"]);
    e.weight = "1.5";
    expect(placements(e)[1].baseTicks).toBe(2660);
    expect(placements(e)[1].points).toBe("9.5");
    const all = resultEvent(s, 1, Array(7).fill("1"));
    expect(placements(all).every((r) => Number.isInteger(r.baseTicks))).toBe(
      true,
    );
  });
  it("distinguishes missing results from absence without consuming places", () => {
    const s = full();
    const e = resultEvent(s);
    e.results[0] = {
      participantId: s.participants[0].id,
      value: null,
      absent: true,
    };
    e.results.pop();
    expect(placements(e)[0].place).toBe(1);
    expect(placements(e)[0].points).toBe("15");
    expect(placements(e).at(-1)?.absent).toBe(true);
    expect(placements(e)).toHaveLength(6);
  });
  it("ignores unfinished physical points; counts live fantasy once", () => {
    const s = full();
    resultEvent(s).status = "active";
    expect(standings(s)[0].points).toBe("0");
    const fantasy = resultEvent(s, 7);
    fantasy.direction = "asc";
    fantasy.status = "active";
    expect(standings(s)[0].points).toBe("45");
    fantasy.status = "finalized";
    expect(standings(s)[0].points).toBe("55");
  });
  it("uses outright firsts, subsequent finishes, then shared rank", () => {
    const s = full();
    const a = s.participants[0].id,
      b = s.participants[1].id;
    const e = resultEvent(s);
    e.results = [
      { participantId: a, value: "1", absent: false },
      { participantId: b, value: "2", absent: false },
    ];
    e.weight = "2";
    const f = resultEvent(s, 1);
    f.results = [
      { participantId: b, value: "1", absent: false },
      { participantId: a, value: "2", absent: false },
    ];
    f.weight = "2";
    const rows = standings(s);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(1);
    expect(rows[2].rank).toBe(3);
    e.weight = "3";
    f.weight = "2";
    expect(standings(s)[0].id).toBe(a);
  });
  it("does not count tied firsts as outright wins", () => {
    const s = full();
    const e = resultEvent(s, 0, ["1", "1", "3", "4", "5", "6", "7"]);
    expect(
      standings(s).find((r) => r.id === e.results[0].participantId)
        ?.finishes[0],
    ).toBe(0);
  });
  it("compares finish counts when points match", () => {
    const s = full();
    const a = s.participants[0].id,
      b = s.participants[1].id;
    const e = resultEvent(s);
    e.results = [
      { participantId: a, value: "1", absent: false },
      { participantId: b, value: "2", absent: false },
    ];
    const f = resultEvent(s, 1);
    f.weight = "0.5";
    f.results = [{ participantId: b, value: "1", absent: false }];
    expect(standings(s).find((r) => r.id === b)?.points).toBe("27.5");
    f.weight = "1";
    f.results = [
      { participantId: b, value: "2", absent: false },
      { participantId: s.participants[2].id, value: "1", absent: false },
      { participantId: a, value: "3", absent: false },
    ];
    e.weight = "0.8";
    const rows = standings(s);
    // Equal average places share the bonus, and points still use the normal tiebreak.
    expect(rows.find((r) => r.id === a)?.points).toBe("28");
    expect(rows.find((r) => r.id === b)?.points).toBe("28");
    expect(rows[0].id).toBe(a);
  });
});
describe("moving Consistency Award", () => {
  it("starts at zero, awards the first winner, and transfers without accumulating", () => {
    const s = full();
    expect(
      consistencyAward(s).every(
        (r) => r.consistencyBonus === "0" && r.averagePlacement === null,
      ),
    ).toBe(true);
    resultEvent(s);
    const [a, b] = s.participants;
    expect(standings(s).find((r) => r.id === a.id)).toMatchObject({
      points: "25",
      consistencyBonus: "10",
      averagePlacement: "1",
    });
    const second = resultEvent(s, 1, ["7", "1", "2", "3", "4", "5", "6"]);
    second.direction = "asc";
    const rows = standings(s);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({
      points: "20",
      consistencyBonus: "0",
      averagePlacement: "4",
    });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({
      points: "35",
      consistencyBonus: "10",
      averagePlacement: "1.5",
    });
    expect(standings(s)).toEqual(rows);
    rebuildHistory(s);
    expect(
      s.snapshots[0].standings.find((r) => r.id === a.id)?.consistencyBonus,
    ).toBe("10");
    expect(
      s.snapshots[1].standings.find((r) => r.id === b.id)?.consistencyBonus,
    ).toBe("10");
    second.status = "active";
    expect(standings(s).find((r) => r.id === a.id)?.points).toBe("25");
    second.status = "finalized";
    second.deleted = true;
    expect(standings(s).find((r) => r.id === a.id)?.points).toBe("25");
    const reset = action(s, { type: "reset", confirm: "RESET RESULTS" });
    expect(
      standings(reset).every(
        (r) => r.points === "0" && r.consistencyBonus === "0",
      ),
    ).toBe(true);
  });
  it("gives every tied leader 10 points using official shared placements", () => {
    const s = full();
    resultEvent(s, 0, ["1", "1", "3", "4", "5", "6", "7"]);
    const winners = standings(s).filter((r) => r.consistencyBonus === "10");
    expect(winners).toHaveLength(2);
    expect(
      winners.every((r) => r.averagePlacement === "1" && r.points === "22.5"),
    ).toBe(true);
  });
  it("ignores weights and provisional fantasy when choosing the leader", () => {
    const s = full();
    resultEvent(s).weight = "4";
    resultEvent(s, 1, ["6", "1", "2", "3", "4", "5", "7"]).direction = "asc";
    expect(
      consistencyAward(s)
        .filter((r) => r.consistencyBonus === "10")
        .map((r) => r.id),
    ).toEqual([s.participants[1].id]);
    const fantasy = resultEvent(s, 7);
    fantasy.direction = "asc";
    fantasy.status = "active";
    expect(
      consistencyAward(s).find((r) => r.id === s.participants[1].id)
        ?.averagePlacement,
    ).toBe("1.5");
    fantasy.status = "finalized";
    expect(
      consistencyAward(s).find((r) => r.id === s.participants[1].id)
        ?.averagePlacement,
    ).toBe("1.6666666666666666667");
  });
  it("recalculates the award after correcting a finalized result", () => {
    const s = full();
    const event = resultEvent(s);
    event.results[0].value = "8";
    rebuildHistory(s);
    expect(standings(s).find((r) => r.consistencyBonus === "10")?.id).toBe(
      s.participants[1].id,
    );
    expect(
      s.snapshots[0].standings.find((r) => r.consistencyBonus === "10")?.id,
    ).toBe(s.participants[1].id);
  });
});
describe("Most Last Places Award", () => {
  it("awards nothing before completion and splits ties exactly without accumulating", () => {
    const s = full();
    expect(lastPlaceAward(s).every((r) => r.lastPlaceBonus === "0")).toBe(true);
    resultEvent(s);
    expect(lastPlaceAward(s)[6]).toMatchObject({
      lastPlaceFinishes: 1,
      lastPlaceBonus: "10",
      bonusTicks: 4200,
    });
    resultEvent(s, 1, ["1", "2", "3", "4", "5", "7", "6"]).direction = "asc";
    expect(
      lastPlaceAward(s)
        .slice(5)
        .map((r) => r.lastPlaceBonus),
    ).toEqual(["5", "5"]);
    const third = resultEvent(s, 2, ["1", "2", "3", "4", "5", "7", "6"]);
    third.direction = "asc";
    expect(lastPlaceAward(s)[5]).toMatchObject({
      lastPlaceFinishes: 2,
      lastPlaceBonus: "10",
    });
    expect(lastPlaceAward(s)[6].lastPlaceBonus).toBe("0");
    third.status = "active";
    expect(lastPlaceAward(s)[5].lastPlaceBonus).toBe("5");
    third.status = "finalized";
    third.deleted = true;
    expect(lastPlaceAward(s)[6].lastPlaceBonus).toBe("5");
    const reset = action(s, { type: "reset", confirm: "RESET RESULTS" });
    expect(lastPlaceAward(reset).every((r) => r.lastPlaceBonus === "0")).toBe(
      true,
    );
  });
  it("counts tied last places including Mario Kart and preserves fractional shares through recovery", () => {
    const s = full();
    resultEvent(s, 3, ["1", "2", "3", "4", "5", "5", "5"]);
    const rows = lastPlaceAward(s);
    expect(
      rows
        .slice(4)
        .every(
          (r) => r.lastPlaceFinishes === 1 && r.lastPlaceBonus === "3.33333333",
        ),
    ).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.bonusTicks, 0)).toBe(4200);
    rebuildHistory(s);
    const restored = restoreBackup(s, safeBackup(s));
    expect(standings(restored)).toEqual(standings(s));
    expect(
      s.snapshots[0].standings.filter((r) => Number(r.lastPlaceBonus) > 0),
    ).toHaveLength(3);
  });
  it("excludes provisional fantasy, absences, and incomplete legacy events", () => {
    const s = full();
    const e = resultEvent(s);
    e.status = "active";
    expect(lastPlaceAward(s).every((r) => r.lastPlaceFinishes === 0)).toBe(
      true,
    );
    e.status = "finalized";
    e.results.pop();
    expect(lastPlaceAward(s).every((r) => r.lastPlaceFinishes === 0)).toBe(
      true,
    );
    e.results.push({
      participantId: s.participants[6].id,
      value: null,
      absent: true,
    });
    expect(lastPlaceAward(s)[6].lastPlaceFinishes).toBe(0);
    expect(lastPlaceAward(s)[5].lastPlaceBonus).toBe("10");
  });
});
describe("lifecycle and authorization", () => {
  it("preserves original frozen order during an audited correction", () => {
    let s = full();
    const ids = s.participants.map((p) => p.id);
    s = action(s, { type: "start", eventId: "event-1", order: ids });
    s = action(s, {
      type: "correctOrder",
      eventId: "event-1",
      order: ids.toReversed(),
      reason: "Corrected recorded order from league standings",
    });
    expect(s.events[0].originalOrder).toEqual(ids);
    expect(s.events[0].order).toEqual(ids.toReversed());
    expect(s.audit.at(-1)?.action).toBe("correctOrder");
  });
  it("allows offline ordering only within final tied ranks without changing scores", () => {
    let s = full();
    for (let i = 0; i < 8; i++) resultEvent(s, i, Array(7).fill("1"));
    const before = standings(s);
    s = action(s, {
      type: "draftOrder",
      order: s.participants.map((p) => p.id).toReversed(),
    });
    expect(standings(s)).toEqual(before);
    expect(s.config.draftOrder).toHaveLength(7);
  });
  it("requires all audited overrides and completed physical events for emergency fantasy finalization", () => {
    let s = full();
    expect(() =>
      action(s, {
        type: "manualFantasyFinal",
        confirm: "SUNDAY SCORES VERIFIED",
        reason: "Verified all eligible Sunday games and official statistics",
      }),
    ).toThrow("physical");
    for (let i = 0; i < 7; i++) resultEvent(s, i);
    expect(() =>
      action(s, {
        type: "manualFantasyFinal",
        confirm: "SUNDAY SCORES VERIFIED",
        reason: "Verified all eligible Sunday games and official statistics",
      }),
    ).toThrow("all seven");
    for (const p of s.participants)
      s = action(s, {
        type: "override",
        participantId: p.id,
        score: "-1.5",
        reason: "Verified Sunday-only official score",
      });
    s = action(s, {
      type: "manualFantasyFinal",
      confirm: "SUNDAY SCORES VERIFIED",
      reason: "Verified all eligible Sunday games and official statistics",
    });
    expect(s.events[7].status).toBe("finalized");
    expect(phase(s)).toBe("Complete");
  });
  it("requires complete results before finalization; records corrections immediately", () => {
    let s = full();
    const ids = s.participants.map((p) => p.id);
    s = action(s, { type: "start", eventId: "event-1", order: ids });
    expect(() =>
      action(s, { type: "finalize", eventId: "event-1", confirm: "FINALIZE" }),
    ).toThrow();
    for (const [i, id] of ids.entries())
      s = action(s, {
        type: "result",
        eventId: "event-1",
        participantId: id,
        value: String(i + 1),
        absent: false,
      });
    expect(standings(s)[0].points).toBe("0");
    s = action(s, {
      type: "finalize",
      eventId: "event-1",
      confirm: "FINALIZE",
    });
    expect(s.snapshots).toHaveLength(1);
    s = action(s, {
      type: "result",
      eventId: "event-1",
      participantId: ids[0],
      value: "10",
      absent: false,
    });
    expect(standings(s)[0].id).toBe(ids[1]);
    expect(s.snapshots[0].standings[0].id).toBe(ids[1]);
    expect(s.events[0].order).toEqual(ids);
  });
  it("freezes order, permits explicit tie ordering, and enforces one physical event", () => {
    let s = full();
    const ids = s.participants.map((p) => p.id);
    s = action(s, { type: "start", eventId: "event-1", order: ids });
    expect(() =>
      action(s, { type: "start", eventId: "event-2", order: ids }),
    ).toThrow("Only one");
    s = action(s, {
      type: "result",
      eventId: "event-1",
      participantId: ids[0],
      value: null,
      absent: true,
    });
    expect(s.events[0].order).toEqual(ids);
    expect(() =>
      action(s, {
        type: "start",
        eventId: "event-2",
        order: [...ids.slice(1), ids[1]],
      }),
    ).toThrow();
  });
  it("enforces predefined unique identities and seven-person cap", () => {
    let s = initialState();
    for (const name of NAMES)
      s = applyAction(
        s,
        {
          type: "register",
          name,
          profile: { team: name, nickname: "", sleeper: "" },
        },
        admin,
      );
    expect(phase(s)).toBe("Ready");
    expect(() =>
      applyAction(
        s,
        {
          type: "register",
          name: "Mark",
          profile: { team: "oops", nickname: "", sleeper: "" },
        },
        admin,
      ),
    ).toThrow();
    expect(
      actionSchema.safeParse({
        type: "register",
        name: "Stranger",
        profile: { team: "oops" },
      }).success,
    ).toBe(false);
  });
  it("protects scores and profiles against non-admins and other participants", () => {
    const s = full();
    expect(() =>
      applyAction(
        s,
        { type: "reset", confirm: "RESET RESULTS" },
        { admin: false },
      ),
    ).toThrow("Administrator");
    expect(() =>
      applyAction(
        s,
        {
          type: "profile",
          participantId: s.participants[0].id,
          profile: { team: "hacked", nickname: "", sleeper: "" },
        },
        { admin: false, participantId: s.participants[1].id },
      ),
    ).toThrow("another");
    const next = applyAction(
      s,
      {
        type: "profile",
        participantId: s.participants[0].id,
        profile: { team: "updated", nickname: "", sleeper: "" },
      },
      { admin: false, participantId: s.participants[0].id },
    );
    expect(next.participants[0].team).toBe("updated");
  });
  it("isolates practice from production", () => {
    const s = initialState();
    expect(() =>
      action(s, { type: "populate", confirm: "PRACTICE ONLY" }),
    ).toThrow("practice");
    const practice = full();
    resultEvent(practice);
    expect(s.events[0].results).toHaveLength(0);
  });
  it("rejects fractional counts and excessive time precision", () => {
    const s = full();
    s.events[0].status = "active";
    expect(() =>
      action(s, {
        type: "result",
        eventId: "event-1",
        participantId: s.participants[0].id,
        value: "1.234",
        absent: false,
      }),
    ).toThrow("precision");
    s.events[5].status = "active";
    expect(() =>
      action(s, {
        type: "result",
        eventId: "event-6",
        participantId: s.participants[0].id,
        value: "1.5",
        absent: false,
      }),
    ).toThrow("whole-number");
  });
  it("verifies scrypt hashes and rejects malformed hashes", () => {
    const salt = "random-test-salt";
    const encoded = `scrypt$${salt}$${scryptSync("long-password", salt, 64).toString("hex")}`;
    expect(verifyPassword("long-password", encoded)).toBe(true);
    expect(verifyPassword("wrong", encoded)).toBe(false);
    expect(verifyPassword("wrong", "invalid")).toBe(false);
  });
});
describe("Mario Kart", () => {
  it("gives explicit absences zero without consuming a finishing place", () => {
    const s = full(),
      e = s.events[3],
      ids = s.participants.map((p) => p.id);
    e.results = [{ participantId: ids[6], value: null, absent: true }];
    e.trials = Object.fromEntries(
      ids.slice(0, 6).map((id, i) => [id, String(i + 1)]),
    );
    seedKart(e, ids, ids);
    expect(e.matches[0].winner).toBe(ids[1]);
    expect(() => selectWinner(e, "wc-1", ids[6])).toThrow();
    selectWinner(e, "wc-2", ids[2]);
    selectWinner(e, "wc-3", ids[3]);
    selectWinner(e, "sf-1", ids[0]);
    selectWinner(e, "sf-2", ids[1]);
    selectWinner(e, "final", ids[0]);
    selectWinner(e, "third", ids[2]);
    const scores = placements(e);
    expect(scores.at(-1)?.absent).toBe(true);
    expect(scores.at(-1)?.points).toBe("0");
    expect(scores.filter((r) => r.place === 5)).toHaveLength(2);
    expect(
      scores.filter((r) => r.place === 5).every((r) => r.points === "3"),
    ).toBe(true);
  });
  it("requires explicit valid seeding and reseeds semifinals", () => {
    const s = full();
    const e = s.events[3],
      ids = s.participants.map((p) => p.id);
    e.trials = Object.fromEntries(ids.map((id, i) => [id, String(i + 1)]));
    expect(() => seedKart(e, [...ids].reverse(), ids)).toThrow();
    seedKart(e, ids, ids);
    selectWinner(e, "wc-1", ids[6]);
    selectWinner(e, "wc-2", ids[2]);
    selectWinner(e, "wc-3", ids[4]);
    expect(e.matches.find((m) => m.id === "sf-1")).toMatchObject({
      a: ids[0],
      b: ids[6],
    });
    selectWinner(e, "sf-1", ids[0]);
    selectWinner(e, "sf-2", ids[2]);
    selectWinner(e, "final", ids[0]);
    selectWinner(e, "third", ids[6]);
    const scores = placements(e);
    expect(scores.map((r) => r.points)).toEqual([
      "30",
      "20",
      "12",
      "6",
      "2",
      "2",
      "2",
    ]);
    selectWinner(e, "wc-1", ids[1]);
    expect(e.matches.some((m) => m.id === "final")).toBe(false);
    expect(e.results).toHaveLength(0);
  });
  it("permits explicitly confirmed tied time-trial seeds", () => {
    const s = full();
    const e = s.events[3],
      ids = s.participants.map((p) => p.id);
    e.trials = Object.fromEntries(ids.map((id) => [id, "10"]));
    seedKart(e, ids.toReversed(), ids);
    expect(e.seeds[0]).toBe(ids[6]);
    expect(() => selectWinner(e, "wc-1", ids[6])).toThrow();
  });
});
describe("backup restoration", () => {
  it("round-trips results, recalculates history and preserves current credentials", () => {
    const s = full();
    s.participants[0].credentialHash = "secret-hash";
    resultEvent(s);
    const saved = safeBackup(s);
    expect(JSON.stringify(saved)).not.toContain("secret-hash");
    const restored = restoreBackup(s, saved);
    expect(standings(restored)).toEqual(standings(s));
    expect(restored.participants[0].credentialHash).toBe("secret-hash");
    expect(restored.snapshots).toHaveLength(1);
    expect(restored.audit.at(-1)?.action).toBe("restore");
  });
  it("rejects wrong environments and invalid participant references without mutation", () => {
    const s = full();
    const saved = safeBackup(s);
    saved.state.environment = "production";
    expect(() => restoreBackup(s, saved)).toThrow("original environment");
    saved.state.environment = "practice";
    saved.state.events[0].results = [
      { participantId: "unknown", value: "1", absent: false },
    ];
    expect(() => restoreBackup(s, saved)).toThrow("Unknown");
    expect(s.events[0].results).toHaveLength(0);
  });
});
