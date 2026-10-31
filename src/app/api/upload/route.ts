import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { assertOrigin, isAdmin, hash, limit } from "@/lib/server/auth";
import { mutate } from "@/lib/server/store";
import { localMode } from "@/lib/server/local-mode";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await limit(
      `upload:${hash(req.headers.get("x-forwarded-for") ?? "unknown")}`,
      10,
      60,
    );
    if (Number(req.headers.get("content-length") ?? 0) > 3 * 1024 * 1024)
      throw Error("Choose an image under 2 MB.");
    const form = await req.formData();
    const file = form.get("file"),
      id = String(form.get("participantId")),
      raw = String(form.get("token") ?? "");
    if (
      !(file instanceof File) ||
      file.size > 2 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw Error("Choose a JPG, PNG or WebP image under 2 MB.");
    const env =
        form.get("environment") === "practice" ? "practice" : "production",
      admin = await isAdmin();
    if (env === "practice" && !admin)
      throw Error("Administrator access required.");
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20000000,
    })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    const path = `${env}/${id}/${crypto.randomUUID()}.webp`;
    await mutate(env, async (s) => {
      const p = s.participants.find((p) => p.id === id);
      if (
        !p ||
        (!admin && (!p.credentialHash || p.credentialHash !== hash(raw)))
      )
        throw Error("Profile authorization failed.");
      const old = p.avatar;
      if (localMode()) {
        const destination = resolve(
          process.env.LOCAL_DATA_DIR || "data",
          "avatars",
          path,
        );
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
        p.avatar = `/api/local-avatar?file=${encodeURIComponent(path)}`;
      } else {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${path}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "image/webp",
            },
            body: new Uint8Array(bytes),
          },
        );
        if (!res.ok) throw Error("Image upload failed.");
        p.avatar = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
      }
      s.audit.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: "avatar",
        reference: id,
        old,
        value: p.avatar,
      });
      return s;
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Image upload failed." },
      { status: 400 },
    );
  }
}
