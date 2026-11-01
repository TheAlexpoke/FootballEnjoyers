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
    expect(
      notes.Li.some((note) => note.text === "The bronze medal bandit. ×3"),
    ).toBe(true);
    expect(
      notes.Dabin.some(
        (note) => note.text === "You're really letting Erfan beat you??",
      ),
    ).toBe(true);
    expect(
      notes.Hong.some((note) => note.text === "A silver medal enthusiast. ×3"),
    ).toBe(true);
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
    expect(notes.Li[0].text).toBe("Biggest mover");
    expect(notes.Arun[0].text).toBe("Biggest mover");
    expect(notes.Mark.some((note) => note.kind === "movement")).toBe(false);
  });
  it("uses a growing-gap line only for three completed events with an increasing lead", () => {
    const state = fixture(
      Array.from({ length: 3 }, () => [1, 2, 3, 4, 5, 6, 7]),
    );
    expect(
      standingsCommentary(state).Mark.some(
        (note) => note.text === "The gap is getting disrespectful.",
      ),
    ).toBe(true);
    state.snapshots[1].standings.find((row) => row.id === "Mark")!.points =
      "100";
    expect(
      standingsCommentary(state).Mark.some(
        (note) => note.text === "The gap is getting disrespectful.",
      ),
    ).toBe(false);
    const early = fixture([
      [1, 2, 3, 4, 5, 6, 7],
      [1, 2, 3, 4, 5, 6, 7],
    ]);
    expect(
      standingsCommentary(early).Mark.some(
        (note) => note.text === "The gap is getting disrespectful.",
      ),
    ).toBe(false);
  });
  it("keeps comments fixed across refreshes, provisional scores, and elapsed time", () => {
    const state = fixture([[1, 2, 3, 4, 5, 6, 7]]);
    const expected = standingsCommentary(state);
    state.standings = state.standings.map((row) => ({
      ...row,
      points: "999",
      rank: 1,
    }));
    state.snapshots.push({
      id: "live-test",
      eventId: state.events.at(-1)!.id,
      at: "2099-01-01T00:00:00Z",
      label: "Live",
      standings: state.standings,
    });
    expect(standingsCommentary(state)).toEqual(expected);
    const lines = Object.values(expected)
      .flat()
      .map((note) => note.text)
      .join(" ");
    expect(lines).not.toMatch(
      /Basement Dweller|designated punching bag|Mid Merchant|Walking Disaster/,
    );
  });
  it("uses the actual better-ranked neighbor's name and updates it after corrected results", () => {
    const state = fixture(
      Array.from({ length: 3 }, () => [1, 2, 3, 4, 5, 6, 7]),
    );
    const last = state.snapshots.at(-1)!;
    last.standings.find((row) => row.id === "Erfan")!.rank = 5;
    last.standings.find((row) => row.id === "Arun")!.rank = 6;
    expect(standingsCommentary(state).Dabin.at(-1)!.text).toBe(
      "You're really letting Arun beat you??",
    );
  });
  it("reserves controller banter for a bad Mario Kart finish in fifth overall", () => {
    const state = fixture(
      Array.from({ length: 4 }, () => [1, 2, 3, 4, 5, 6, 7]),
    );
    const latest = state.snapshots.at(-1)!;
    latest.standings.forEach((row, i) => {
      row.rank = i + 1;
    });
    const fifth = latest.standings.find((row) => row.rank === 5)!;
    state.events[3].results = state.participants.map((p, i) => ({
      participantId: p.id,
      value: String(p.id === fifth.id ? 7 : i + 1),
      absent: false,
    }));
    expect(standingsCommentary(state)[fifth.id].at(-1)!.text).toBe(
      "Somebody check his controller.",
    );
    state.events[3].status = "active";
    expect(
      Object.values(standingsCommentary(state))
        .flat()
        .some((note) => note.text === "Somebody check his controller."),
    ).toBe(false);
  });
});
