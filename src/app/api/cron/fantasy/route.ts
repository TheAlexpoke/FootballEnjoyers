import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const supplied = req.headers.get("authorization") ?? "",
    expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    {
      error:
        "Automatic scoring has been retired. Use admin manual entry or screenshot import.",
    },
    { status: 410 },
  );
}
