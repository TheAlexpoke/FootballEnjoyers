import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NAMES } from "../model";
import { localMode } from "./local-mode";

// Originals remain in private local data. Circular crops are rendered by CSS/SVG.
export function localPortrait(name: string) {
  if (!localMode() || !NAMES.some((identity) => identity === name)) return "";
  const file = `portraits/${name}.png`;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || "data",
    "avatars",
    file,
  );
  return existsSync(path)
    ? `/api/local-avatar?file=${encodeURIComponent(file)}`
    : "";
}
