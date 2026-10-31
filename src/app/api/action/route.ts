import { NextRequest, NextResponse } from "next/server";
import { actionSchema, applyAction } from "@/lib/actions";
import { mutate, backup } from "@/lib/server/store";
import {
  assertOrigin,
  isAdmin,
  hash,
  token,
  limit,
  setDevice,
} from "@/lib/server/auth";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > 50000)
      throw Error("Request is too large.");
    const input = await req.json();
    const env = input.environment === "practice" ? "practice" : "production";
    const action = actionSchema.parse(input.action);
    const admin = await isAdmin();
    if (env === "practice" && !admin)
      throw Error("Administrator access required.");
    if (!["register", "profile"].includes(action.type) && !admin)
      throw Error("Administrator access required.");
    await limit(
      `mutations:${hash(req.headers.get("x-forwarded-for") ?? "unknown")}`,
      120,
      60,
    );
    const credential = token(),
      device = token();
    let participantId: string | undefined;
    const next = await mutate(env, async (state) => {
      if (action.type === "profile" && !admin) {
        if (
          typeof input.profileToken !== "string" ||
          input.profileToken.length > 100
        )
          throw Error("Private profile link required.");
        participantId = state.participants.find(
          (p) =>
            p.credentialHash && p.credentialHash === hash(input.profileToken),
        )?.id;
      }
      if (action.type === "reset") await backup(state);
      return applyAction(state, action, {
        admin,
        participantId,
        credentialHash: hash(credential),
        deviceHash: hash(device),
      });
    });
    if (action.type === "register") await setDevice(device);
    const privateLink = ["register", "regenerate"].includes(action.type)
      ? `${process.env.APP_ORIGIN}/manage/${credential}${env === "practice" ? "?env=practice" : ""}`
      : undefined;
    return NextResponse.json(
      { ok: true, revision: next.revision, privateLink },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save changes.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
