import { NextRequest, NextResponse } from "next/server";
import { hash, assertOrigin, limit, requireAdmin } from "@/lib/server/auth";
import { load } from "@/lib/server/store";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await limit(
      `profile:${hash(req.headers.get("x-forwarded-for") ?? "unknown")}`,
      30,
      60,
    );
    const { token, environment } = await req.json();
    if (typeof token !== "string" || token.length > 100)
      throw Error("Invalid private link.");
    const env = environment === "practice" ? "practice" : "production";
    if (env === "practice") await requireAdmin();
    const s = await load(env);
    const p = s.participants.find(
      (p) => p.credentialHash && p.credentialHash === hash(token),
    );
    if (!p)
      throw Error(
        "Private link is invalid or revoked. Ask the administrator to regenerate it.",
      );
    return NextResponse.json(
      {
        participant: {
          id: p.id,
          name: p.name,
          team: p.team,
          nickname: p.nickname,
          sleeper: p.sleeper,
          avatar: p.avatar,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Profile unavailable." },
      { status: 403 },
    );
  }
}
