import { NextRequest, NextResponse } from "next/server";
import { loadPublic, db, configured } from "@/lib/server/store";
import { requireAdmin, deviceHash, isAdmin } from "@/lib/server/auth";
import { initialState } from "@/lib/model";
import { publicState } from "@/lib/server/public";
import { sharedSnapshot } from "@/lib/server/shared-snapshot";
import {
  localMode,
  hostedReadOnly,
  localAccess,
  phoneAccess,
} from "@/lib/server/local-mode";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    if (localMode() && !(await localAccess()))
      return NextResponse.json(
        { error: "Open the site using localhost." },
        { status: 403 },
      );
    const env =
      req.nextUrl.searchParams.get("env") === "practice"
        ? "practice"
        : "production";
    if (env === "practice") {
      if ((await phoneAccess()) && !(await isAdmin())) {
        // Enough public metadata to render the phone sign-in form, without
        // exposing private sandbox records before authentication.
        return NextResponse.json(
          {
            ...publicState(initialState("practice"), true),
            localMode: true,
            phoneAccess: true,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      await requireAdmin();
    }
    if (hostedReadOnly())
      return NextResponse.json(sharedSnapshot(), {
        headers: { "Cache-Control": "no-store" },
      });
    const ready = configured();
    const state = publicState(
      ready ? await loadPublic(env) : initialState(env),
      ready,
    );
    state.localMode = localMode();
    state.phoneAccess = await phoneAccess();
    state.readOnly = hostedReadOnly();
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
