import { NextRequest, NextResponse } from "next/server";
import { assertOrigin, isAdmin, login, logout } from "@/lib/server/auth";
export async function GET() {
  try {
    return NextResponse.json(
      { admin: await isAdmin() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ admin: false });
  }
}
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    const body = await req.json();
    if (typeof body.password !== "string" || body.password.length > 256)
      throw Error("Enter your password.");
    await login(
      body.password,
      req.headers.get("x-vercel-forwarded-for") ??
        req.headers.get("x-forwarded-for") ??
        "unknown",
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed." },
      { status: 401 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  try {
    assertOrigin(req);
    await logout();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Logout failed." }, { status: 400 });
  }
}
