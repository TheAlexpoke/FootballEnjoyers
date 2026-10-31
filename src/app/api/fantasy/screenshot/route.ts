import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertOrigin, requireAdmin, hash, limit } from "@/lib/server/auth";
import { load, mutate } from "@/lib/server/store";
import { matchScreenshot, ocrSchema } from "@/lib/screenshot";
import {
  screenshotTeamNames,
  saveFantasyScores,
  normalizeTeam,
} from "@/lib/fantasy-entry";
import {
  readReceipt,
  signReceipt,
  type Receipt,
} from "@/lib/server/screenshot-receipt";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await requireAdmin();
    await limit(
      `screenshot:${hash(req.headers.get("x-forwarded-for") ?? "unknown")}`,
      15,
      60,
    );
    if (Number(req.headers.get("content-length") ?? 0) > 4 * 1024 * 1024)
      throw Error(
        "Screenshot upload exceeds 4 MB including recognized text. Choose an image under 3 MB.",
      );
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const environment =
        form.get("environment") === "practice" ? "practice" : "production";
      if (
        !(file instanceof File) ||
        file.size > 3 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw Error("Choose a PNG, JPG or WebP screenshot under 3 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const imageHash = createHash("sha256").update(bytes).digest("hex");
      const metadata = await sharp(bytes, {
        limitInputPixels: 18000000,
      }).metadata();
      if (
        !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
        (metadata.pages ?? 1) > 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 18000000
      )
        throw Error(
          "Choose a single PNG, JPG or WebP screenshot under 18 megapixels.",
        );
      const ocr = ocrSchema.parse(JSON.parse(String(form.get("ocr") ?? "")));
      if (metadata.width !== ocr.width || metadata.height !== ocr.height)
        throw Error(
          "Screenshot dimensions do not match its recognized text. Read the image again.",
        );
      const s = await load(environment);
      const names = screenshotTeamNames(s);
      const teams = matchScreenshot(ocr, names);
      const receipt: Receipt = {
        version: 1,
        importId: crypto.randomUUID(),
        environment,
        revision: s.revision,
        expires: Date.now() + 10 * 60000,
        imageHash,
        fileName: file.name.replace(/[\x00-\x1f]/g, "").slice(0, 120),
        teams,
      };
      return NextResponse.json(
        { token: signReceipt(receipt), teams, revision: s.revision },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = z
      .object({
        token: z.string().max(16000),
        environment: z.enum(["production", "practice"]),
        sundayOnly: z.literal(true),
        confirm: z.literal("APPLY SCREENSHOT"),
      })
      .parse(await req.json());
    const receipt = readReceipt(body.token);
    if (receipt.environment !== body.environment)
      throw Error("Screenshot review belongs to another environment.");
    await mutate(body.environment, (s) => {
      if (s.revision !== receipt.revision)
        throw Error(
          "Scores or team mappings changed after this review. Read the screenshot again before applying.",
        );
      const names = screenshotTeamNames(s);
      if (
        receipt.teams.some(
          (t) =>
            normalizeTeam(t.teamName) !==
              normalizeTeam(names[t.participantId] ?? "") ||
            normalizeTeam(t.matchedLabel ?? t.teamName) !==
              normalizeTeam(names[t.participantId] ?? ""),
        )
      )
        throw Error("Team mappings changed. Read the screenshot again.");
      return saveFantasyScores(
        s,
        receipt.teams.map((t) => ({
          participantId: t.participantId,
          score: t.score,
        })),
        {
          type: "screenshot",
          importId: receipt.importId,
          imageHash: receipt.imageHash,
          fileName: receipt.fileName,
          teams: receipt.teams,
        },
        new Date().toISOString(),
      );
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Screenshot could not be accepted.",
      },
      { status: 400 },
    );
  }
}
