import { describe, it, expect } from "vitest";
import { initialState, NAMES } from "../src/lib/model";
import {
  applyFantasy,
  eligibleGame,
  type Feed,
  type Matchup,
} from "../src/lib/fantasy";
import { standings } from "../src/lib/scoring";
function setup() {
  const s = initialState();
  s.participants = NAMES.map((name, i) => ({
    id: String(i),
    name,
    team: name,
    nickname: "",
    sleeper: "",
    avatar: "",
    credentialHash: "",
    deviceHash: "",
  }));
  s.events.slice(0, 7).forEach((e) => (e.status = "finalized"));
  s.fantasy.leagueId = "12345";
  s.fantasy.league = {
    scoring_settings: { rec: 1 },
    roster_positions: ["RB", "WR"],
  };
  s.fantasy.mappings = Object.fromEntries(
    s.participants.map((p, i) => [p.id, i + 1]),
  );
  s.fantasy.players = {
    sun: { name: "Sunday", team: "SUN", position: "RB" },
    mon: { name: "Monday", team: "MON", position: "WR" },
  };
  const feed: Feed = {
    season: "2026",
    week: 9,
    updatedAt: "2026-11-08T20:00:00.000Z",
    scheduleComplete: true,
    leagueId: "12345",
    scoringSettings: { rec: 1 },
    games: [
      {
        id: "s",
        home: "SUN",
        away: "AWY",
        kickoff: "2026-11-08T18:00:00.000Z",
        status: "live",
      },
      {
        id: "m",
        home: "MON",
        away: "X",
        kickoff: "2026-11-10T01:00:00.000Z",
        status: "scheduled",
      },
    ],
    scores: {
      sun: { gameId: "s", score: "10.25" },
      mon: { gameId: "m", score: "99" },
    },
  };
  const matchups: Matchup[] = s.participants.map((_, i) => ({
    roster_id: i + 1,
    starters: ["sun", "mon"],
  }));
  return { s, feed, matchups };
}
describe("Sunday-only scoring", () => {
  it("uses America/New_York dates, including Sunday Night Football after UTC midnight", () => {
    expect(
      eligibleGame({
        id: "snf",
        home: "A",
        away: "B",
        status: "live",
        kickoff: "2026-11-09T01:20:00.000Z",
      }),
    ).toBe(true);
    expect(
      eligibleGame({
        id: "mnf",
        home: "A",
        away: "B",
        status: "live",
        kickoff: "2026-11-10T01:20:00.000Z",
      }),
    ).toBe(false);
  });
  it("excludes Monday, uses Sunday player data, and counts provisional points once", () => {
    const { s, feed, matchups } = setup();
    const out = applyFantasy(s, feed, matchups, new Date(feed.updatedAt));
    expect(out.events[7].results[0].value).toBe("10.25");
    expect(out.events[7].status).toBe("active");
    expect(out.fantasy.lineups["0"][1].eligible).toBe(false);
    expect(standings(out).every((r) => r.points === "21.14285714")).toBe(true);
  });
  it("refuses missing player data, stale feeds, and mismatched league rules", () => {
    const { s, feed, matchups } = setup();
    feed.scores = {};
    expect(() =>
      applyFantasy(s, feed, matchups, new Date(feed.updatedAt)),
    ).toThrow("Missing Sunday");
    feed.scoringSettings = { rec: 0.5 };
    expect(() =>
      applyFantasy(s, feed, matchups, new Date(feed.updatedAt)),
    ).toThrow("settings differ");
    feed.scoringSettings = { rec: 1 };
    expect(() =>
      applyFantasy(s, feed, matchups, new Date("2026-11-08T20:10:00Z")),
    ).toThrow("stale");
  });
  it("requires all physical events before Sunday starts", () => {
    const { s, feed, matchups } = setup();
    s.events[0].status = "active";
    expect(() =>
      applyFantasy(s, feed, matchups, new Date(feed.updatedAt)),
    ).toThrow("physical events");
  });
  it("waits for games to end and scores to stabilize, then accepts later corrections", () => {
    const { s, feed, matchups } = setup();
    feed.games[0].status = "final";
    let out = applyFantasy(s, feed, matchups, new Date(feed.updatedAt));
    expect(out.events[7].status).toBe("active");
    feed.updatedAt = "2026-11-08T20:31:00.000Z";
    out = applyFantasy(out, feed, matchups, new Date(feed.updatedAt));
    expect(out.events[7].status).toBe("finalized");
    const before = standings(out)[0].points;
    out = applyFantasy(out, feed, matchups, new Date(feed.updatedAt));
    expect(standings(out)[0].points).toBe(before);
    feed.scores.sun.score = "12";
    feed.updatedAt = "2026-11-08T20:32:00.000Z";
    out = applyFantasy(out, feed, matchups, new Date(feed.updatedAt));
    expect(out.events[7].results[0].value).toBe("12");
  });
  it("allows clearly audited overrides when player data is unavailable", () => {
    const { s, feed, matchups } = setup();
    feed.scores = {};
    for (const p of s.participants)
      s.fantasy.overrides[p.id] = {
        score: "20",
        reason: "Verified official Sunday score",
      };
    const out = applyFantasy(s, feed, matchups, new Date(feed.updatedAt));
    expect(
      out.events[7].results.every((r) => r.value === "20" && !!r.note),
    ).toBe(true);
  });
});
