import "server-only";
import snapshot from "@/data/shared-tournament.json";
import type { PublicState } from "../model";
export function sharedSnapshot(): PublicState {
  return structuredClone(snapshot) as PublicState;
}
