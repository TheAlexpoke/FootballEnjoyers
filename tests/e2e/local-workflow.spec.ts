import { test, expect } from "@playwright/test";
import { NAMES } from "../../src/lib/model";
import sharp from "sharp";

test("hosted deployment stays read-only even with LOCAL_MODE=true", async ({
  page,
  request,
}) => {
  await page.goto("http://localhost:3002/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Standings", "Events", "History"]);
  await expect(page.locator(".standing-row")).toHaveCount(7);
  await expect(
    page.getByRole("link", { name: "Commissioner access" }),
  ).toHaveCount(0);
  await expect(page.locator('.standing-row[href^="/players/"]')).toHaveCount(7);
  const publicData = await (
    await request.get("http://localhost:3002/api/state")
  ).json();
  expect(publicData.readOnly).toBe(true);
  const previous = publicData.snapshots
    .filter((snapshot: { id: string }) => !snapshot.id.startsWith("live-"))
    .at(-2);
  if (previous) {
    const expected = publicData.standings.map(
      (row: { id: string; rank: number; previousRank?: number }) => {
        const prior = previous.standings.find(
          (other: { id: string }) => other.id === row.id,
        );
        expect(row.previousRank).toBe(prior.rank);
        const delta = prior.rank - row.rank;
        return delta === 0 ? "—" : String(Math.abs(delta));
      },
    );
    await expect(page.locator(".standing-row .movement")).toHaveText(expected);
  }
  if (publicData.sharedDemo) {
    await expect(page.getByRole("note")).toContainText(
      "EXAMPLE TOURNAMENT · Simulated results through event 7. Not official standings.",
    );
  }
  await page.locator(".standing-row").first().locator(".avatar").click();
  await expect(page).toHaveURL(
    new RegExp(`/players/${publicData.standings[0].id}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Event performance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Save|Edit|Upload/ }),
  ).toHaveCount(0);
  await page.goto("http://localhost:3002/");
  expect(
    publicData.events.find(
      (event: { kind: string }) => event.kind === "fantasy",
    ).weight,
  ).toBe("3");
  await expect(page.locator(".scoring-maximum strong")).toHaveText(
    `MAX ${publicData.events.filter((event: { deleted?: boolean; status: string }) => !event.deleted && event.status !== "finalized").reduce((sum: number, event: { weight: string }) => sum + 15 * Number(event.weight), 0)} Points Remaining`,
  );
  expect(JSON.stringify(publicData)).not.toMatch(
    /credentialHash|deviceHash|admin_sessions|profileToken/,
  );
  for (const path of ["admin", "register", "manage/private", "players/test"]) {
    expect((await request.get(`http://localhost:3002/${path}`)).status()).toBe(
      404,
    );
  }
  await page.goto("http://localhost:3002/history");
  await expect(
    page.getByRole("heading", { name: "Event Finishes" }),
  ).toBeVisible();
  expect(
    (await request.get("http://localhost:3002/api/state?env=practice")).ok(),
  ).toBe(false);
  await page.goto("http://localhost:3002/events");
  await expect(page.locator(".all-events .event-card")).toHaveCount(9);
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
  await expect(page.getByLabel(/Nickname/)).toHaveCount(0);
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
  await page.goto(origin);
  await expect(page.locator(".standing-row .rank")).toHaveText(
    Array(7).fill("-"),
  );
  await page.goto(`${origin}/players/${order[0]}`);
  await expect(page.locator(".player-stats b").first()).toHaveText("-");
  await act({ type: "start", eventId: "event-1", order });
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: /Beer Pong/ }).click();
  await expect(page.getByRole("checkbox", { name: /absent/i })).toHaveCount(0);
  await expect(page.getByLabel("Mark result", { exact: true })).toBeEnabled();
  await page
    .getByText("Edit event rules & configuration", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save event configuration", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Event configuration saved." }),
  ).toBeVisible();
  for (let i = 0; i < 7; i++)
    await act({
      type: "result",
      eventId: "event-1",
      participantId: order[i],
      value: String(30 + i * 5),
      absent: false,
    });
  await page.goto(origin);
  await expect(page.locator(".standing-row .rank")).toHaveText(
    Array(7).fill("-"),
  );
  await act({ type: "finalize", eventId: "event-1", confirm: "FINALIZE" });
  await page.goto(origin);
  await expect(page.locator(".standing-row")).toHaveCount(7);
  expect(
    await page.locator(".standing-row .rank").allTextContents(),
  ).not.toContain("-");
  s = await state();
  expect(s.standings[0].points).toBe("25");
  await act({
    type: "start",
    eventId: "event-4",
    order: s.standings.map((r: { id: string }) => r.id),
  });
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: /Mario Kart/ }).click();
  await expect(page.getByRole("checkbox", { name: /absent/i })).toHaveCount(0);
  await expect(
    page.getByLabel("Mark time trial", { exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "fantasy", exact: true }).click();
  await expect(
    page.getByText("Each name matches its competitor automatically", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Choose ESPN scoreboard screenshot"),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Save all seven team names" }),
  ).toHaveCount(0);
  const ocr = {
    width: 1000,
    height: 1000,
    words: [
      {
        text: "TEAM",
        confidence: 96,
        bbox: { x0: 40, x1: 130, y0: 40, y1: 60 },
      },
      {
        text: "TOTAL",
        confidence: 96,
        bbox: { x0: 800, x1: 870, y0: 40, y1: 60 },
      },
      {
        text: "PTS",
        confidence: 96,
        bbox: { x0: 880, x1: 930, y0: 40, y1: 60 },
      },
      ...NAMES.flatMap((name, i) => [
        {
          text: name,
          confidence: 96,
          bbox: { x0: 40, x1: 130, y0: 100 + i * 100, y1: 135 + i * 100 },
        },
        {
          text: String(80 - i * 10),
          confidence: 96,
          bbox: { x0: 800, x1: 930, y0: 100 + i * 100, y1: 135 + i * 100 },
        },
      ]),
    ],
  };
  const screenshot = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const prepare = () =>
    request.post(`${origin}/api/fantasy/screenshot`, {
      headers: { origin },
      multipart: {
        file: {
          name: "scoreboard.png",
          mimeType: "image/png",
          buffer: screenshot,
        },
        environment: "production",
        ocr: JSON.stringify(ocr),
      },
    });
  const review = await prepare();
  expect(review.ok(), await review.text()).toBe(true);
  expect(
    (await review.json()).teams.map((t: { teamName: string }) => t.teamName),
  ).toEqual([...NAMES]);
  ocr.words = ocr.words.filter((w) => w.text !== "Alex");
  const incomplete = await prepare();
  expect(incomplete.ok()).toBe(false);
  expect((await incomplete.json()).error).toContain("Alex");
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
