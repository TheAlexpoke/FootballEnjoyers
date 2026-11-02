import "server-only";
import { headers } from "next/headers";
import { phoneSettings } from "./phone-access";

// Never enable password-free editing on the hosted copy, even if LOCAL_MODE is set there.
export const hostedReadOnly = () => Boolean(process.env.VERCEL);
export const localMode = () =>
  process.env.LOCAL_MODE !== "false" && !hostedReadOnly();
export async function loopbackAccess() {
  if (!localMode()) return false;
  const host = (await headers()).get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}
export async function phoneAccess() {
  if (!localMode()) return false;
  const settings = phoneSettings();
  return Boolean(
    settings && (await headers()).get("host") === new URL(settings.origin).host,
  );
}
export async function localAccess() {
  return (await loopbackAccess()) || (await phoneAccess());
}
