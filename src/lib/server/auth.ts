import "server-only";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { db, rpc } from "./store";
import {
  hostedReadOnly,
  localMode,
  localAccess,
  loopbackAccess,
  phoneAccess,
} from "./local-mode";
import {
  phoneSettings,
  makePhoneSession,
  validPhoneSession,
  PHONE_SESSION_SECONDS,
} from "./phone-access";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function verifyPassword(password: string, encoded: string) {
  try {
    const [scheme, salt, value] = encoded.split("$");
    if (scheme !== "scrypt" || !salt || !value) return false;
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(value, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export async function isAdmin() {
  if (hostedReadOnly()) return false;
  if (localMode()) {
    if (await loopbackAccess()) return true;
    const settings = phoneSettings();
    return Boolean(
      settings &&
      (await phoneAccess()) &&
      validPhoneSession((await cookies()).get("fe_phone")?.value, settings),
    );
  }
  const raw = (await cookies()).get("fe_admin")?.value;
  if (!raw) return false;
  const sessions = await db<{ expires_at: string }[]>(
    `admin_sessions?token_hash=eq.${hash(raw)}&select=expires_at`,
  );
  return (
    !!sessions[0] && new Date(sessions[0].expires_at).getTime() > Date.now()
  );
}
export async function requireAdmin() {
  if (!(await isAdmin())) throw Error("Administrator access required.");
}
export async function limit(bucket: string, maximum: number, seconds: number) {
  if (!(await rpc<boolean>("consume_limit", { bucket, maximum, seconds })))
    throw Error("Too many attempts. Please try again later.");
}
export async function login(password: string, ip: string) {
  if (hostedReadOnly())
    throw Error("The hosted copy is read-only. Open your local control room.");
  if (localMode()) {
    if (!(await localAccess()))
      throw Error("Open the configured local phone address.");
    if (await phoneAccess()) {
      await limit("phone-login:global", 10, 900);
      const settings = phoneSettings();
      if (
        !settings ||
        !timingSafeEqual(
          Buffer.from(hash(password.trim().toUpperCase()), "hex"),
          Buffer.from(hash(settings.code), "hex"),
        )
      )
        throw Error("Incorrect phone sign-in code.");
      (await cookies()).set("fe_phone", makePhoneSession(settings), {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/",
        maxAge: PHONE_SESSION_SECONDS,
      });
    }
    return;
  }
  await limit(`login:${hash(ip)}`, 8, 900);
  await limit("login:global", 100, 900);
  if (!process.env.ADMIN_PASSWORD_HASH)
    throw Error("Set ADMIN_PASSWORD_HASH on the server first.");
  if (!verifyPassword(password, process.env.ADMIN_PASSWORD_HASH))
    throw Error("Incorrect administrator password.");
  const raw = token();
  await db("admin_sessions", {
    token_hash: hash(raw),
    expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
  });
  (await cookies()).set("fe_admin", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 3600,
  });
}
export async function logout() {
  if (hostedReadOnly()) return;
  if (localMode()) {
    (await cookies()).delete("fe_phone");
    return;
  }
  const jar = await cookies();
  const raw = jar.get("fe_admin")?.value;
  if (raw)
    await db(`admin_sessions?token_hash=eq.${hash(raw)}`, undefined, "DELETE");
  jar.delete("fe_admin");
}
export function assertOrigin(req: Request) {
  if (hostedReadOnly())
    throw Error(
      "The hosted copy is read-only. Open the local site to make changes.",
    );
  const origin = req.headers.get("origin");
  if (localMode()) {
    const url = new URL(req.url);
    const host = req.headers.get("host") ?? "";
    const phone = phoneSettings();
    const allowed =
      /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ||
      (phone && `${url.protocol}//${host}` === phone.origin);
    if (!allowed || origin !== `${url.protocol}//${host}`)
      throw Error("Local changes must come from this localhost site.");
    return;
  }
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw Error("APP_ORIGIN must be configured.");
  if (origin !== new URL(expected).origin)
    throw Error("Request origin is not allowed.");
}
export async function setDevice(raw: string) {
  (await cookies()).set("fe_device", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400,
  });
}
export async function deviceHash() {
  const raw = (await cookies()).get("fe_device")?.value;
  return raw ? hash(raw) : "";
}
