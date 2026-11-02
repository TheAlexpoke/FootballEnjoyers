import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makePhoneSession,
  validPhoneSession,
  phoneSettings,
  PHONE_SESSION_SECONDS,
} from "../src/lib/server/phone-access";
const settings = { origin: "http://192.168.1.8:3001", code: "012345ABCDEF" };
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
describe("local phone sessions", () => {
  it("rejects tampering, expiry, another origin and a rotated code", () => {
    const now = Date.now();
    const session = makePhoneSession(settings, now);
    expect(validPhoneSession(session, settings, now)).toBe(true);
    expect(validPhoneSession(session + ".extra", settings, now)).toBe(false);
    expect(
      validPhoneSession(session, settings, now + PHONE_SESSION_SECONDS * 1000),
    ).toBe(false);
    expect(
      validPhoneSession(
        session,
        { ...settings, origin: "http://192.168.1.9:3001" },
        now,
      ),
    ).toBe(false);
    expect(
      validPhoneSession(session, { ...settings, code: "FEDCBA543210" }, now),
    ).toBe(false);
  });
  it("permits only configured private-network origins and never hosted mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "football-phone-"));
    directories.push(directory);
    vi.stubEnv("LOCAL_DATA_DIR", directory);
    vi.stubEnv("VERCEL", "");
    writeFileSync(
      join(directory, "phone-access.json"),
      JSON.stringify(settings),
    );
    expect(phoneSettings()).toEqual(settings);
    vi.stubEnv("VERCEL", "1");
    expect(phoneSettings()).toBeNull();
    vi.stubEnv("VERCEL", "");
    for (const origin of [
      "http://example.com:3001",
      "http://127.0.0.1:3001",
      "http://8.8.8.8:3001",
      "http://192.168.1.8:3001/path",
    ]) {
      writeFileSync(
        join(directory, "phone-access.json"),
        JSON.stringify({ ...settings, origin }),
      );
      expect(phoneSettings()).toBeNull();
    }
  });
});
