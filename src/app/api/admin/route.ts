import { NextRequest, NextResponse } from "next/server";
import { assertOrigin, requireAdmin } from "@/lib/server/auth";
import { backup, db, load, mutate } from "@/lib/server/store";
import { safeBackup, restoreBackup } from "@/lib/validation";
import { placements, standings } from "@/lib/scoring";
const quote = (v: unknown) =>
  `"${String(v ?? "")
    .replaceAll('"', '""')
    .replace(/^[=+@\-\t\r]/, "'$&")}"`;
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const env =
      req.nextUrl.searchParams.get("env") === "practice"
        ? "practice"
        : "production";
    const s = await load(env);
    const mode = req.nextUrl.searchParams.get("mode");
    if (mode === "audit") return NextResponse.json(s.audit.toReversed());
    if (mode === "backups")
      return NextResponse.json(
        await db(
          `backups?tournament_id=eq.${env}&select=id,created_at&order=created_at.desc&limit=30`,
        ),
      );
    if (mode === "csv") {
      const rows = [
        [
          "section",
          "event",
          "name",
          "team",
          "nickname",
          "legacy_sleeper_username",
          "raw",
          "absent",
          "placement",
          "weight",
          "points",
          "metadata",
        ],
      ];
      for (const p of s.participants)
        rows.push([
          "profile",
          "",
          p.name,
          p.team,
          p.nickname,
          p.sleeper,
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
      for (const e of s.events) {
        rows.push([
          "event",
          e.name,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          e.weight,
          "",
          JSON.stringify({
            status: e.status,
            rules: e.rules,
            order: e.order,
            deleted: e.deleted,
          }),
        ]);
        for (const r of e.results) {
          const p = s.participants.find((p) => p.id === r.participantId),
            score = placements(e).find((x) => x.id === r.participantId);
          rows.push([
            "result",
            e.name,
            p?.name ?? "",
            p?.team ?? "",
            "",
            "",
            r.value ?? "",
            String(r.absent),
            String(score?.place ?? ""),
            e.weight,
            score?.points ?? "",
            "",
          ]);
        }
      }
      for (const r of standings(s)) {
        const p = s.participants.find((p) => p.id === r.id);
        rows.push([
          "standing",
          "",
          p?.name ?? "",
          p?.team ?? "",
          "",
          "",
          "",
          "",
          String(r.rank),
          "",
          r.points,
          "",
        ]);
      }
      return new NextResponse(
        rows.map((row) => row.map(quote).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="football-enjoyers-${env}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return NextResponse.json(
      {
        ...safeBackup(s),
        standings: standings(s),
        history: s.snapshots,
        audit: s.audit,
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="football-enjoyers-${env}.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await requireAdmin();
    if (Number(req.headers.get("content-length") ?? 0) > 10 * 1024 * 1024)
      throw Error("Backup exceeds 10 MB.");
    const body = await req.json();
    const env = body.environment === "practice" ? "practice" : "production";
    if (body.type === "backup") await backup(await load(env));
    else if (body.type === "restore") {
      if (body.confirm !== "RESTORE BACKUP")
        throw Error("Type RESTORE BACKUP to confirm.");
      let input: unknown = body.backup;
      if (body.backupId) {
        if (
          typeof body.backupId !== "string" ||
          !/^[0-9a-f-]{36}$/.test(body.backupId)
        )
          throw Error("Invalid backup ID.");
        const rows = await db<{ payload: unknown }[]>(
          `backups?id=eq.${body.backupId}&tournament_id=eq.${env}&select=payload`,
        );
        input = rows[0]?.payload;
      }
      await mutate(env, async (s) => {
        const restored = restoreBackup(s, input);
        await backup(s);
        return restored;
      });
    } else throw Error("Unknown administrative operation.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Operation failed." },
      { status: 400 },
    );
  }
}
