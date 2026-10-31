import "server-only";
import { headers } from "next/headers";

// Never enable password-free editing on the hosted copy, even if LOCAL_MODE is set there.
export const hostedReadOnly = () => Boolean(process.env.VERCEL);
export const localMode = () =>
  process.env.LOCAL_MODE !== "false" && !hostedReadOnly();
export async function localAccess() {
  if (!localMode()) return false;
  const host = (await headers()).get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}
