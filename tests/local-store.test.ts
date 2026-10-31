import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialState } from "../src/lib/model";
import {
  readLocal,
  commitLocal,
  localRows,
  localReceiptKey,
} from "../src/lib/server/local-store";
import { localMode } from "../src/lib/server/local-mode";
import { applyAction } from "../src/lib/actions";
import { publicState } from "../src/lib/server/public";

describe("local persistence and hosted isolation", () => {
  it("uses assigned local photos across both tournaments and preserves custom uploads", () => {
    mkdirSync(join(directory, "avatars", "portraits"), { recursive: true });
    writeFileSync(
      join(directory, "avatars", "portraits", "Mark.png"),
      Buffer.from("test portrait"),
    );
    const s = applyAction(
      initialState("practice"),
      { type: "populate", confirm: "PRACTICE ONLY" },
      { admin: true },
    );
    expect(publicState(s, true).participants[0].avatar).toBe(
      "/api/local-avatar?file=portraits%2FMark.png",
    );
    s.environment = "production";
    expect(publicState(s, true).participants[0].avatar).toContain("Mark.png");
    s.participants[0].avatar = "/custom-upload.webp";
    expect(publicState(s, true).participants[0].avatar).toBe(
      "/custom-upload.webp",
    );
    s.participants[0].avatar = "";
    vi.stubEnv("VERCEL", "1");
    expect(publicState(s, false).participants[0].avatar).toBe("");
  });
  it("lets a time trial replace an older absence without an absence checkbox", () => {
    let s = applyAction(
      initialState("practice"),
      { type: "populate", confirm: "PRACTICE ONLY" },
      { admin: true },
    );
    s = applyAction(
      s,
      {
        type: "start",
        eventId: "event-4",
        order: s.participants.map((p) => p.id),
      },
      { admin: true },
    );
    s = applyAction(
      s,
      {
        type: "kartAbsent",
        eventId: "event-4",
        participantId: s.participants[0].id,
        absent: true,
      },
      { admin: true },
    );
    s = applyAction(
      s,
      {
        type: "trial",
        eventId: "event-4",
        participantId: s.participants[0].id,
        value: "45.25",
      },
      { admin: true },
    );
    expect(
      s.events[3].results.some(
        (r) => r.participantId === s.participants[0].id && r.absent,
      ),
    ).toBe(false);
    expect(s.events[3].trials[s.participants[0].id]).toBe("45.25");
  });
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "football-local-"));
    vi.stubEnv("LOCAL_DATA_DIR", directory);
    vi.stubEnv("LOCAL_MODE", "true");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  it("persists scores across database connections and rejects stale writes", () => {
    const state = applyAction(
      initialState(),
      {
        type: "register",
        name: "Mark",
        profile: { team: "Fourth & Gold", nickname: "", sleeper: "" },
      },
      { admin: true },
    );
    expect(state.participants[0].credentialHash).toBe("");
    expect(commitLocal("production", 0, state)).toBe(true);
    expect(commitLocal("production", 0, initialState())).toBe(false);
    expect(readLocal("production").participants[0].team).toBe("Fourth & Gold");
    expect(readLocal("production").revision).toBe(1);
    expect(readLocal("practice").participants).toHaveLength(0);
  });
  it("keeps recoverable backups and screenshot signing keys across connections", () => {
    const state = initialState("practice");
    localRows("backups", { tournament_id: "practice", payload: state });
    const rows = localRows<{ id: string }[]>(
      "backups?tournament_id=eq.practice",
    );
    expect(rows).toHaveLength(1);
    expect(
      localRows<{ payload: unknown }[]>(
        `backups?id=eq.${rows[0].id}&tournament_id=eq.practice`,
      )[0].payload,
    ).toEqual(state);
    expect(localRows("backups?tournament_id=eq.production")).toEqual([]);
    expect(localReceiptKey()).toBe(localReceiptKey());
  });
  it("never enables password-free storage on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(localMode()).toBe(false);
    expect(() => readLocal("production")).toThrow("disabled");
  });
});
