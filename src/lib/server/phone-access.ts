import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PhoneSettings = { origin: string; code: string };
export const PHONE_SESSION_SECONDS = 12 * 60 * 60;
export function phoneSettings(): PhoneSettings | null {
  if (process.env.VERCEL) return null;
  try {
    const settings = JSON.parse(
      readFileSync(
        resolve(
          /* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || "data",
          "phone-access.json",
        ),
        "utf8",
      ),
    );
    const url = new URL(settings.origin);
    const octets = url.hostname.split(".").map(Number);
    const privateAddress =
      octets.length === 4 &&
      octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168));
    if (
      !privateAddress ||
      url.protocol !== "http:" ||
      url.origin !== settings.origin ||
      !url.port ||
      !/^[A-F0-9]{12}$/.test(settings.code)
    )
      return null;
    return settings;
  } catch {
    return null;
  }
}
function signature(settings: PhoneSettings, expires: number) {
  return createHmac("sha256", settings.code)
    .update(`${settings.origin}|${expires}`)
    .digest("hex");
}
export function makePhoneSession(settings: PhoneSettings, now = Date.now()) {
  const expires = now + PHONE_SESSION_SECONDS * 1000;
  return `${expires}.${signature(settings, expires)}`;
}
export function validPhoneSession(
  raw: string | undefined,
  settings: PhoneSettings,
  now = Date.now(),
) {
  if (!raw) return false;
  const parts = raw.split(".");
  if (
    parts.length !== 2 ||
    !/^\d+$/.test(parts[0]) ||
    !/^[a-f0-9]{64}$/.test(parts[1])
  )
    return false;
  const expires = Number(parts[0]);
  if (expires <= now || expires > now + PHONE_SESSION_SECONDS * 1000)
    return false;
  return timingSafeEqual(
    Buffer.from(parts[1], "hex"),
    Buffer.from(signature(settings, expires), "hex"),
  );
}
