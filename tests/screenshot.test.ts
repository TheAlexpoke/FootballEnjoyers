import { describe, it, expect, beforeEach } from "vitest";
import { initialState } from "../src/lib/model";
import { applyAction } from "../src/lib/actions";
import {
  saveFantasyScores,
  validateTeamNames,
  validateScreenshotLabels,
} from "../src/lib/fantasy-entry";
import { matchScreenshot, type Ocr } from "../src/lib/screenshot";
import {
  readReceipt,
  signReceipt,
  type Receipt,
} from "../src/lib/server/screenshot-receipt";
import { standings, placements } from "../src/lib/scoring";
import { safeBackup, restoreBackup } from "../src/lib/validation";
import example from "./fixtures/espn-total-pts-ocr.json";

const names = Object.fromEntries(
  [
    "Fourth and Gold",
    "Hong Kong Chiefs",
    "Li Dynasty",
    "Arun It Back",
    "Sunday Scaries",
    "Dab to the Future",
    "End Zone Alex",
  ].map((name, i) => [`practice-${i}`, name]),
);
function ocr(): Ocr {
  return {
    width: 1000,
    height: 1000,
    words: [
      {
        text: "TEAM",
        confidence: 96,
        bbox: { x0: 40, x1: 130, y0: 40, y1: 60 },
      },
      {
        text: "TOTAL",
        confidence: 96,
        bbox: { x0: 800, x1: 870, y0: 40, y1: 60 },
      },
      {
        text: "PTS",
        confidence: 96,
        bbox: { x0: 880, x1: 930, y0: 40, y1: 60 },
      },
      ...Object.values(names).flatMap((name, i) => [
        ...name.split(" ").map((text, j) => ({
          text,
          confidence: 96,
          bbox: {
            x0: 40 + j * 100,
            x1: 130 + j * 100,
            y0: 100 + i * 100,
            y1: 135 + i * 100,
          },
        })),
        {
          text: `${80 - i * 10}.25`,
          confidence: 96,
          bbox: { x0: 800, x1: 930, y0: 100 + i * 100, y1: 135 + i * 100 },
        },
      ]),
    ],
  };
}
function ready() {
  const s = applyAction(
    initialState("practice"),
    { type: "populate", confirm: "PRACTICE ONLY" },
    { admin: true },
  );
  for (const e of s.events.filter((e) => e.kind !== "fantasy")) {
    e.status = "finalized";
    e.finalizedAt = "2026-10-30T12:00:00.000Z";
    e.order = s.participants.map((p) => p.id);
    e.results = s.participants.map((p, i) => ({
      participantId: p.id,
      value: String(i + 1),
      absent: false,
    }));
  }
  s.fantasy.entry = { teamNames: names };
  return s;
}
const receipt = (): Receipt => ({
  version: 1,
  importId: crypto.randomUUID(),
  environment: "practice",
  revision: 0,
  expires: Date.now() + 60000,
  imageHash: "a".repeat(64),
  fileName: "scoreboard.png",
  teams: matchScreenshot(ocr(), names),
});
describe("all-seven screenshot acceptance", () => {
  it("rejects ambiguous shortened labels and preserves explicit mappings in backups", () => {
    const s = ready();
    expect(() =>
      validateScreenshotLabels(s, names, {
        "practice-0": "Same ...",
        "practice-1": "Same ...",
      }),
    ).toThrow("unique");
    const labels = { "practice-0": "Fourth ..." };
    const mapped = applyAction(
      s,
      { type: "fantasyTeamNames", names, labels },
      { admin: true },
    );
    expect(
      restoreBackup(mapped, safeBackup(mapped)).fantasy.entry?.labels,
    ).toEqual(labels);
    expect(
      applyAction(
        mapped,
        { type: "reset", confirm: "RESET RESULTS" },
        { admin: true },
      ).fantasy.entry?.labels,
    ).toEqual(labels);
  });
  it("reads the provided ESPN table using Total Pts and explicit truncated labels", () => {
    const teams = {
      "practice-0": "Mark's Magnificent Test Team",
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          `practice-${i + 1}`,
          `Team ${i + 2}`,
        ]),
      ),
    };
    const labels = { "practice-0": "Mark's Magnificent ..." };
    const actual = structuredClone(example);
    expect(() => matchScreenshot(actual, teams)).toThrow("All seven");
    const rows = matchScreenshot(actual, teams, labels);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.score === "0" && r.column === "Total Pts")).toBe(
      true,
    );
    expect(rows[0].matchedLabel).toBe("Mark's Magnificent ...");
    actual.words.find((w) => w.text === "0.0")!.text = "42.25";
    actual.words.push({
      text: "999.99",
      confidence: 99,
      bbox: { x0: 515, x1: 574, y0: 642, y1: 662 },
    });
    expect(matchScreenshot(actual, teams, labels)[0].score).toBe("42.25");
  });
  it("requires the Total Pts heading rather than guessing a score column", () => {
    const actual = structuredClone(example);
    actual.words = actual.words.filter((w) => w.text !== "TOTALPTS");
    expect(() => matchScreenshot(actual, names)).toThrow("Total Pts column");
  });
  it("rejects a configured name that is only part of an actual team name", () => {
    const data = ocr();
    data.words.splice(3, 0, {
      text: "United",
      confidence: 96,
      bbox: { x0: 470, x1: 570, y0: 100, y1: 135 },
    });
    expect(() => matchScreenshot(data, names)).toThrow("exactly");
  });
  it("accepts exactly matched seven teams and scores", () => {
    const rows = matchScreenshot(ocr(), names);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      participantId: "practice-0",
      teamName: "Fourth and Gold",
      score: "80.25",
    });
  });
  it("rejects missing teams, unknown teams and incomplete mapping", () => {
    const missing = ocr();
    missing.words = missing.words.filter((w) => w.bbox.y0 < 700);
    expect(() => matchScreenshot(missing, names)).toThrow("All seven");
    const wrong = ocr();
    wrong.words.find((w) => w.text === "Fourth")!.text = "Unrelated";
    expect(() => matchScreenshot(wrong, names)).toThrow("unmatched");
    expect(() => validateTeamNames(ready(), {})).toThrow("all seven");
  });
  it("rejects duplicate team occurrences even when all seven appear", () => {
    const data = ocr();
    data.words.push(
      ...data.words
        .filter((w) => w.bbox.y0 === 100)
        .map((w) => ({ ...w, bbox: { ...w.bbox, y0: 850, y1: 885 } })),
    );
    expect(() => matchScreenshot(data, names)).toThrow("more than once");
  });
  it("rejects score projections and unclear scores rather than guessing", () => {
    const projection = ocr();
    projection.words.push({
      text: "99.50",
      confidence: 95,
      bbox: { x0: 600, x1: 690, y0: 100, y1: 135 },
    });
    expect(() => matchScreenshot(projection, names)).toThrow("unambiguous");
    const unclear = ocr();
    unclear.words.at(-1)!.confidence = 50;
    expect(() => matchScreenshot(unclear, names)).toThrow("unclear");
    const integer = ocr();
    integer.words.at(-1)!.text = "80";
    expect(matchScreenshot(integer, names).at(-1)?.score).toBe("80");
  });
  it("does not fuzzy match OCR mistakes and accepts normalized case/spacing", () => {
    const data = ocr();
    data.words.find((w) => w.text === "Fourth")!.text = "fourth";
    expect(matchScreenshot(data, names)).toHaveLength(7);
    data.words.find((w) => w.text === "fourth")!.text = "F0urth";
    expect(() => matchScreenshot(data, names)).toThrow();
    const s = ready();
    const duplicate = { ...names, "practice-1": "  FOURTH   AND GOLD " };
    expect(() => validateTeamNames(s, duplicate)).toThrow("unique");
  });
  it("accepts negative decimal scores and rejects invalid geometry", () => {
    const data = ocr();
    data.words.at(-1)!.text = "-2.50";
    expect(matchScreenshot(data, names).at(-1)?.score).toBe("-2.5");
    data.words[0].bbox.x1 = 2000;
    expect(() => matchScreenshot(data, names)).toThrow("coordinates");
  });
});
describe("screenshot review receipts", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD_HASH = "private-unit-test-signing-key";
  });
  it("signs accepted rows and rejects tampered or expired reviews", () => {
    const draft = receipt();
    const token = signReceipt(draft);
    expect(readReceipt(token)).toEqual(draft);
    const [payload, sig] = token.split(".");
    const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
    changed.teams[0].score = "999";
    expect(() =>
      readReceipt(
        `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${sig}`,
      ),
    ).toThrow("changed");
    expect(() => readReceipt(token, Date.now() + 120000)).toThrow("expired");
  });
});
describe("admin fantasy score updates", () => {
  it("counts provisional screenshot points, records evidence, and rejects repeat imports", () => {
    const s = ready(),
      draft = receipt(),
      before = standings(s)[0].points;
    saveFantasyScores(
      s,
      draft.teams,
      { type: "screenshot", ...draft },
      "2026-11-08T20:00:00.000Z",
    );
    expect(s.events[7].status).toBe("active");
    expect(Number(standings(s)[0].points)).toBe(Number(before) + 60);
    expect(s.audit.at(-1)?.action).toBe("fantasyScreenshot");
    expect(s.snapshots.at(-1)?.fantasyResults).toHaveLength(7);
    expect(() =>
      saveFantasyScores(
        s,
        draft.teams,
        { type: "screenshot", ...draft },
        "2026-11-08T20:01:00.000Z",
      ),
    ).toThrow("already been applied");
  });
  it("requires all seven manual scores and administrator authorization", () => {
    const s = ready(),
      rows = receipt().teams;
    expect(() =>
      saveFantasyScores(
        s,
        rows.slice(0, 6),
        { type: "manual" },
        "2026-11-08T20:00:00.000Z",
      ),
    ).toThrow();
    expect(() =>
      applyAction(
        s,
        { type: "fantasyScores", rows, sundayOnly: true, expectedRevision: 0 },
        { admin: false },
      ),
    ).toThrow("Administrator");
    expect(() =>
      applyAction(
        s,
        { type: "fantasyScores", rows, sundayOnly: true, expectedRevision: 5 },
        { admin: true },
      ),
    ).toThrow("changed");
  });
  it("keeps finalized scores locked until reopening and never double-counts them", () => {
    let s = ready();
    s = applyAction(
      s,
      {
        type: "fantasyScores",
        rows: receipt().teams,
        sundayOnly: true,
        expectedRevision: 0,
      },
      { admin: true },
    );
    const score = standings(s)[0].points;
    s = applyAction(
      s,
      {
        type: "fantasyFinalize",
        confirm: "FINALIZE SUNDAY SCORES",
        gamesEnded: true,
      },
      { admin: true },
    );
    expect(standings(s)[0].points).toBe(score);
    expect(() =>
      applyAction(
        s,
        {
          type: "fantasyScores",
          rows: receipt().teams,
          sundayOnly: true,
          expectedRevision: 0,
        },
        { admin: true },
      ),
    ).toThrow("Reopen");
    s = applyAction(
      s,
      { type: "reopen", eventId: s.events[7].id, confirm: "REOPEN" },
      { admin: true },
    );
    s = applyAction(
      s,
      {
        type: "fantasyScores",
        rows: receipt()
          .teams.toReversed()
          .map((r, i) => ({ ...r, score: String(100 - i) })),
        sundayOnly: true,
        expectedRevision: 0,
      },
      { admin: true },
    );
    expect(placements(s.events[7])[0].id).toBe("practice-6");
    expect(
      s.events[7].results.find((r) => r.participantId === "practice-0")?.value,
    ).toBe("94");
  });
  it("preserves mappings through reset and backup restore and rejects retired integration configuration", () => {
    const s = ready(),
      backup = safeBackup(s);
    expect(restoreBackup(s, backup).fantasy.entry?.teamNames).toEqual(names);
    const reset = applyAction(
      s,
      { type: "reset", confirm: "RESET RESULTS" },
      { admin: true },
    );
    expect(reset.fantasy.entry?.teamNames).toEqual(names);
    expect(() =>
      applyAction(
        s,
        { type: "sleeper", leagueId: "12345", week: 9 },
        { admin: true },
      ),
    ).toThrow("retired");
  });
});
