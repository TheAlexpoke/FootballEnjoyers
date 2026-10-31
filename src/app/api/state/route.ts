import { NextRequest, NextResponse } from "next/server";
import { loadPublic, db, configured } from "@/lib/server/store";
import { requireAdmin, deviceHash } from "@/lib/server/auth";
import { initialState } from "@/lib/model";
import { publicState } from "@/lib/server/public";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const env =
      req.nextUrl.searchParams.get("env") === "practice"
        ? "practice"
        : "production";
    if (env === "practice") await requireAdmin();
    const ready = configured();
    const state = publicState(
      ready ? await loadPublic(env) : initialState(env),
      ready,
    );
    const device = ready ? await deviceHash() : "";
    if (device) {
      const rows = await db<{ id: string }[]>(
        `participants?tournament_id=eq.${env}&device_hash=eq.${device}&select=id`,
      );
      state.me = rows[0]?.id;
    }
    return NextResponse.json(state, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Tournament data is unavailable. Please retry." },
      { status: 503 },
    );
  }
}
