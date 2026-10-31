import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fantasyScore } from "../fantasy-entry";
export const receiptSchema = z.object({
  version: z.literal(1),
  importId: z.uuid(),
  environment: z.enum(["production", "practice"]),
  revision: z.number().int().nonnegative(),
  expires: z.number(),
  imageHash: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().max(120),
  teams: z
    .array(
      z.object({
        participantId: z.string().min(1).max(100),
        teamName: z.string().min(2).max(60),
        matchedLabel: z.string().min(2).max(60).optional(),
        column: z.literal("Total Pts").optional(),
        score: fantasyScore,
        confidence: z.number().min(75).max(100),
      }),
    )
    .length(7),
});
export type Receipt = z.infer<typeof receiptSchema>;
function key() {
  if (!process.env.ADMIN_PASSWORD_HASH)
    throw Error("Configure administrator authentication first.");
  return process.env.ADMIN_PASSWORD_HASH;
}
export function signReceipt(receipt: Receipt) {
  const payload = Buffer.from(
    JSON.stringify(receiptSchema.parse(receipt)),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function readReceipt(token: string, now = Date.now()): Receipt {
  if (token.length > 16000) throw Error("Invalid screenshot review.");
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length)
    throw Error("Invalid screenshot review.");
  const expected = createHmac("sha256", key()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw Error("Screenshot review was changed. Read the image again.");
  const receipt = receiptSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString()),
  );
  if (receipt.expires < now)
    throw Error("Screenshot review expired. Read the image again.");
  return receipt;
}
