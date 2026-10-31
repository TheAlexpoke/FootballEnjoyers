import { test, expect } from "@playwright/test";
import { NAMES } from "../../src/lib/model";
import sharp from "sharp";

test("hosted deployment stays read-only even with LOCAL_MODE=true", async ({
  page,
  request,
}) => {
  await page.goto("http://localhost:3002/admin");
  await expect(
    page.getByRole("heading", { name: "Run the tournament locally." }),
  ).toBeVisible();
  await expect(page.getByLabel("Administrator password")).toHaveCount(0);
  expect(
    (await (await request.get("http://localhost:3002/api/auth")).json()).admin,
  ).toBe(false);
  for (const endpoint of [
    "action",
    "admin",
    "upload",
    "fantasy/screenshot",
    "profile",
  ]) {
    const res = await request.post(`http://localhost:3002/api/${endpoint}`, {
      headers: { origin: "http://localhost:3002" },
      data: {
        action: { type: "register", name: "Mark", profile: { team: "Mark" } },
      },
    });
    expect(res.ok()).toBe(false);
  }
  expect(
    (await request.get("http://localhost:3002/api/admin?mode=json")).status(),
  ).toBe(403);
});

test("local organizer manages competitors, scores, photos, and recovery without accounts", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Run the shared isolated data workflow once.",
  );
  const origin = "http://localhost:3003";
  const act = async (action: unknown, environment = "production") => {
    const res = await request.post(`${origin}/api/action`, {
      headers: { origin },
      data: { action, environment },
    });
    expect(res.ok(), await res.text()).toBe(true);
    const result = await res.json();
    expect(result.privateLink).toBeUndefined();
    return result;
  };
  const state = async (env = "production") =>
    (await request.get(`${origin}/api/state?env=${env}`)).json();
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: "players", exact: true }).click();
  await page
    .getByLabel("Competitor name", { exact: true })
    .selectOption("Mark");
  await page.getByLabel("Team name", { exact: true }).fill("Fourth & Gold");
  await page
    .getByRole("button", { name: "Add competitor", exact: true })
    .click();
  await expect(
    page.getByText("Mark · Fourth & Gold", { exact: false }),
  ).toBeVisible();
  for (const name of NAMES.slice(1))
    await act({
      type: "register",
      name,
      profile: { team: `${name} squad`, nickname: "", sleeper: "" },
    });
  let s = await state();
  expect(s.participants).toHaveLength(7);
  expect((await state("practice")).participants).toHaveLength(0);
  const order = s.participants.map((p: { id: string }) => p.id);
  await act({ type: "start", eventId: "event-1", order });
  for (let i = 0; i < 7; i++)
    await act({
      type: "result",
      eventId: "event-1",
      participantId: order[i],
      value: String(30 + i * 5),
      absent: false,
    });
  await act({ type: "finalize", eventId: "event-1", confirm: "FINALIZE" });
  await page.goto(origin);
  await expect(page.locator(".standing-row")).toHaveCount(7);
  s = await state();
  expect(s.standings[0].points).toBe("15");
  const bytes = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#eac16a" },
  })
    .png()
    .toBuffer();
  const upload = await request.post(`${origin}/api/upload`, {
    headers: { origin },
    multipart: {
      file: { name: "photo.png", mimeType: "image/png", buffer: bytes },
      participantId: order[0],
      environment: "production",
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  s = await state();
  const avatar = await request.get(origin + s.participants[0].avatar);
  expect(avatar.ok()).toBe(true);
  expect(avatar.headers()["content-type"]).toBe("image/webp");
  const backup = await request.post(`${origin}/api/admin`, {
    headers: { origin },
    data: { type: "backup", environment: "production" },
  });
  expect(backup.ok()).toBe(true);
  const backups = await (
    await request.get(`${origin}/api/admin?mode=backups`)
  ).json();
  await act({
    type: "profile",
    participantId: order[0],
    profile: { team: "Changed team", nickname: "", sleeper: "" },
  });
  const restore = await request.post(`${origin}/api/admin`, {
    headers: { origin },
    data: {
      type: "restore",
      environment: "production",
      backupId: backups[0].id,
      confirm: "RESTORE BACKUP",
    },
  });
  expect(restore.ok(), await restore.text()).toBe(true);
  expect((await state()).participants[0].team).toBe("Fourth & Gold");
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: "players", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Regenerate private link" }),
  ).toHaveCount(0);
});
