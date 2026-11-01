import { describe, expect, it } from "vitest";
import { initialState, NAMES, type PublicState } from "../src/lib/model";
import { rebuildHistory, standings } from "../src/lib/scoring";
import { standingsCommentary } from "../src/lib/standings-commentary";

function fixture(eventOrders: number[][]): PublicState {
  const state = initialState("practice");
  state.participants = NAMES.map((name) => ({
    id: name,
    name,
    team: name,
    nickname: "",
    sleeper: "",
    avatar: "",
    credentialHash: "",
    deviceHash: "",
  }));
  eventOrders.forEach((order, i) => {
    const event = state.events[i];
    event.direction = "asc";
    event.status = "finalized";
    event.finalizedAt = new Date(2026, 9, 30, 12, i).toISOString();
    event.results = order.map((value, player) => ({
      participantId: NAMES[player],
      value: String(value),
      absent: false,
    }));
  });
  rebuildHistory(state);
  return {
    ...state,
    standings: standings(state),
    phase: "test",
    configured: true,
  };
}

describe("standings commentary", () => {
  it("stays empty before results and leaves scores untouched", () => {
    const state = fixture([]);
    const before = JSON.stringify(state);
    expect(Object.values(standingsCommentary(state)).flat()).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("counts consecutive official finishes and backs banter with a real deficit", () => {
    const state = fixture(
      Array.from({ length: 3 }, () => [1, 2, 3, 4, 5, 6, 7]),
    );
    const before = JSON.stringify(state);
    const notes = standingsCommentary(state);
    expect(notes.Li.some((note) => note.text === "3rd place streak ×3!")).toBe(
      true,
    );
    expect(
      notes.Dabin.some((note) => note.text === "You need a handicap, bro?"),
    ).toBe(true);
    expect(notes.Mark.some((note) => note.text.includes("3 event wins"))).toBe(
      true,
    );
    expect(JSON.stringify(state)).toBe(before);
  });
  it("awards biggest mover to every player tied for the largest latest rank gain", () => {
    const state = fixture([
      [1, 2, 3, 4, 5, 6, 7],
      [7, 6, 5, 4, 3, 2, 1],
    ]);
    state.snapshots[0].standings.forEach((row, i) => {
      row.rank = i + 1;
    });
    state.snapshots[1].standings = state.snapshots[0].standings.map((row) => ({
      ...row,
      rank: row.id === "Li" || row.id === "Arun" ? row.rank - 2 : row.rank,
    }));
    const notes = standingsCommentary(state);
    expect(notes.Li[0].text).toBe("Biggest mover: +2");
    expect(notes.Arun[0].text).toBe("Biggest mover: +2");
    expect(notes.Mark.some((note) => note.kind === "movement")).toBe(false);
  });
});
