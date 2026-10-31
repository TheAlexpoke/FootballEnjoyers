import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localAccess } from "@/lib/server/local-mode";
import { NAMES } from "@/lib/model";

export async function GET(req: NextRequest) {
  if (!(await localAccess())) return new NextResponse(null, { status: 404 });
  const file = req.nextUrl.searchParams.get("file") || "";
  const portrait = /^portraits\/([A-Za-z]+)\.png$/.exec(file);
  const isPortrait = Boolean(
    portrait && NAMES.some((name) => name === portrait[1]),
  );
  if (
    !isPortrait &&
    !/^(production|practice)\/[a-zA-Z0-9-]+\/[a-f0-9-]{36}\.webp$/.test(file)
  )
    return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(
      resolve(process.env.LOCAL_DATA_DIR || "data", "avatars", file),
    );
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": isPortrait ? "image/png" : "image/webp",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
