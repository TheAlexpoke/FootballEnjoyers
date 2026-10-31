import { test, expect } from "@playwright/test";
import { NAMES } from "../../src/lib/model";
import sharp from "sharp";
test.describe.configure({ mode: "serial" });
test("real HTTP routes: atomic registration, token scope, admin scoring, backup restore and practice isolation", async ({
  browser,
  page,
}) => {
  const origin = "http://localhost:3001";
  const spectator = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const api = spectator.request;
  const action = async (a: unknown, environment = "production") =>
    api.post("/api/action", { data: { action: a, environment } });
  // Parallel requests reach actual SQL uniqueness and CAS logic through the test adapter.
  const claim = {
    type: "register",
    name: "Mark",
    profile: { team: "Fourth & Gold", nickname: "", sleeper: "" },
  };
  const claims = await Promise.all([action(claim), action(claim)]);
  expect(claims.filter((r) => r.ok())).toHaveLength(1);
  const winner = await claims.find((r) => r.ok())!.json();
  const markToken = new URL(winner.privateLink).pathname.split("/").at(-1)!;
  await Promise.all(
    NAMES.slice(1).map((name) =>
      action({
        type: "register",
        name,
        profile: { team: `${name} squad`, nickname: "", sleeper: "" },
      }).then((r) => expect(r.ok()).toBe(true)),
    ),
  );
  let s = await (await api.get("/api/state")).json();
  expect(s.participants).toHaveLength(7);
  expect(JSON.stringify(s)).not.toContain("credentialHash");
  expect(s.phase).toBe("Ready");
  const mark = s.participants.find((p: { name: string }) => p.name === "Mark");
  const other = s.participants.find((p: { name: string }) => p.name === "Hong");
  const spoof = await api.post("/api/action", {
    data: {
      action: {
        type: "profile",
        participantId: other.id,
        profile: { team: "hacked", nickname: "", sleeper: "" },
      },
      profileToken: markToken,
    },
  });
  expect(spoof.ok()).toBe(false);
  const edit = await api.post("/api/action", {
    data: {
      action: {
        type: "profile",
        participantId: mark.id,
        profile: {
          team: "Fourth & Gold",
          nickname: "Commissioner",
          sleeper: "",
        },
      },
      profileToken: markToken,
    },
  });
  expect(edit.ok()).toBe(true);
  const image = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#d4af37" },
  })
    .png()
    .toBuffer();
  const upload = await api.post("/api/upload", {
    multipart: {
      participantId: mark.id,
      token: markToken,
      file: { name: "profile.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const updated = await (await api.get("/api/state")).json();
  const avatar = updated.participants.find(
    (p: { id: string }) => p.id === mark.id,
  ).avatar;
  const imageResponse = await api.get(avatar);
  const metadata = await sharp(await imageResponse.body()).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(256);
  expect(metadata.height).toBe(256);
  const forbiddenUpload = await api.post("/api/upload", {
    multipart: {
      participantId: other.id,
      token: markToken,
      file: { name: "profile.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(forbiddenUpload.ok()).toBe(false);
  expect((await action({ type: "reset", confirm: "RESET RESULTS" })).ok()).toBe(
    false,
  );
  await page.goto("/admin");
  await page
    .getByLabel("Administrator password")
    .fill("integration-password-2026");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByText("OFFICIAL TOURNAMENT", { exact: true }),
  ).toBeVisible();
  const adminApi = page.request;
  const adminAction = async (a: unknown, environment = "production") => {
    const r = await adminApi.post("/api/action", {
      headers: { origin },
      data: { action: a, environment },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r;
  };
  const ids = s.standings.map((r: { id: string }) => r.id);
  await adminAction({ type: "start", eventId: "event-1", order: ids });
  for (const [i, id] of ids.entries())
    await adminAction({
      type: "result",
      eventId: "event-1",
      participantId: id,
      value: String(i + 1),
      absent: false,
    });
  s = await (await api.get("/api/state")).json();
  expect(s.standings.every((r: { points: string }) => r.points === "0")).toBe(
    true,
  );
  await page.reload();
  await page.getByRole("button", { name: /01 Beer Pong/ }).click();
  await expect(page.getByLabel("Mark result")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finalize event (7/7 recorded)" })
    .click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  s = await (await api.get("/api/state")).json();
  expect(s.events[0].status).toBe("finalized");
  expect(s.standings[0].points).toBe("15");
  expect(s.snapshots).toHaveLength(1);
  const download = await adminApi.get("/api/admin?mode=json");
  const backup = await download.json();
  expect(JSON.stringify(backup)).not.toContain(markToken);
  expect(JSON.stringify(backup)).not.toContain("credentialHash");
  await adminAction({ type: "reset", confirm: "RESET RESULTS" });
  s = await (await api.get("/api/state")).json();
  expect(s.participants).toHaveLength(7);
  expect(s.events[0].results).toHaveLength(0);
  const recovery = await adminApi.post("/api/admin", {
    headers: { origin },
    data: {
      type: "restore",
      environment: "production",
      confirm: "RESTORE BACKUP",
      backup,
    },
  });
  expect(recovery.ok(), await recovery.text()).toBe(true);
  s = await (await api.get("/api/state")).json();
  expect(s.standings[0].points).toBe("15");
  expect(
    (await (await adminApi.get("/api/admin?mode=backups")).json()).length,
  ).toBeGreaterThan(0);
  await adminAction({ type: "populate", confirm: "PRACTICE ONLY" }, "practice");
  const practice = await (await adminApi.get("/api/state?env=practice")).json();
  expect(practice.participants).toHaveLength(7);
  expect(practice.standings[0].points).toBe("0");
  expect((await api.get("/api/state?env=practice")).ok()).toBe(false);
  const regenerated = await (
    await adminAction({ type: "regenerate", participantId: mark.id })
  ).json();
  expect(regenerated.privateLink).toBeTruthy();
  const revoked = await api.post("/api/profile", {
    data: { token: markToken },
  });
  expect(revoked.ok()).toBe(false);
  const audit = await (await adminApi.get("/api/admin?mode=audit")).json();
  expect(audit.some((a: { action: string }) => a.action === "restore")).toBe(
    true,
  );
  await spectator.close();
});

test("real screenshot OCR: seven configured teams, reviewed scores, manual fallback and finalization", async ({
  page,
}) => {
  test.setTimeout(180000);
  const origin = "http://localhost:3001";
  const api = page.request;
  const login = await api.post("/api/auth", {
    headers: { origin },
    data: { password: "integration-password-2026" },
  });
  expect(login.ok()).toBe(true);
  const backup = await (
    await api.get("/api/admin?env=practice&mode=json")
  ).json();
  const players = backup.state.participants as {
    id: string;
    name: string;
    team: string;
  }[];
  for (const [i, e] of backup.state.events.entries())
    if (e.kind !== "fantasy") {
      e.status = "finalized";
      e.finalizedAt = new Date(Date.UTC(2026, 9, 30, 12, i)).toISOString();
      e.order = players.map((p) => p.id);
      e.results = players.map((p, j) => ({
        participantId: p.id,
        value: String(j + 1),
        absent: false,
      }));
    }
  const restored = await api.post("/api/admin", {
    headers: { origin },
    data: {
      environment: "practice",
      type: "restore",
      confirm: "RESTORE BACKUP",
      backup,
    },
  });
  expect(restored.ok(), await restored.text()).toBe(true);
  const sourceNames: Record<string, string> = {
    Mark: "Fourth and Gold",
    Hong: "Hong Kong Chiefs",
    Li: "Li Dynasty",
    Arun: "Arun It Back",
    Erfan: "Sunday Scaries",
    Dabin: "Dab to the Future",
    Alex: "End Zone Alex",
  };
  await page.goto("/admin?env=practice");
  await page.getByRole("button", { name: "fantasy", exact: true }).click();
  await expect(
    page.getByLabel("Choose ESPN scoreboard screenshot"),
  ).toBeDisabled();
  for (const p of players)
    await page.getByLabel(`${p.name} ESPN team name`).fill(sourceNames[p.name]);
  await page.getByRole("button", { name: "Save all seven team names" }).click();
  await expect(
    page.getByText(
      "All seven team names saved. Screenshot uploads are enabled.",
    ),
  ).toBeVisible();
  const shot = await page.context().newPage();
  await shot.setViewportSize({ width: 1100, height: 1100 });
  const html = `<html><body style="margin:0;background:white;color:black;font-family:Arial"><header style="height:70px;padding:15px 55px;box-sizing:border-box;font-size:30px">ESPN SUNDAY SCORES · TEST DATA</header><div style="height:55px;display:flex;justify-content:space-between;padding:0 55px;font-size:25px"><span>TEAM</span><span>TOTAL PTS</span></div>${players.map((p, i) => `<div style="height:125px;display:flex;align-items:center;justify-content:space-between;padding:0 55px;border-bottom:1px solid #ddd;font-size:38px;font-weight:600"><span>${sourceNames[p.name]}</span><span>${(100 - i * 10 + 0.25).toFixed(2)}</span></div>`).join("")}</body></html>`;
  await shot.setContent(html);
  const png = await shot.screenshot({ fullPage: true });
  const dark = await sharp(png).negate({ alpha: false }).png().toBuffer();
  await shot.close();
  const uploader = page.getByLabel("Choose ESPN scoreboard screenshot");
  const cropped = await sharp(png)
    .extract({ left: 0, top: 0, width: 1100, height: 800 })
    .png()
    .toBuffer();
  await uploader.setInputFiles({
    name: "missing-team.png",
    mimeType: "image/png",
    buffer: cropped,
  });
  await page
    .getByRole("button", { name: "Read ESPN screenshot", exact: true })
    .click();
  await expect(page.locator(".fantasy-entry [role=alert]")).toContainText(
    /All seven|unambiguous|unclear/,
    { timeout: 120000 },
  );
  expect(
    (await (await api.get("/api/state?env=practice")).json()).events[7].results,
  ).toHaveLength(0);
  const receiptResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/fantasy/screenshot") &&
      r.request().method() === "POST",
  );
  await uploader.setInputFiles({
    name: "seven-team-scoreboard.png",
    mimeType: "image/png",
    buffer: dark,
  });
  await page
    .getByRole("button", { name: "Read ESPN screenshot", exact: true })
    .click();
  const reviewReceipt = await (await receiptResponse).json();
  await expect(
    page.getByRole("heading", { name: "3. Review all seven scores" }),
  ).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".screenshot-review tbody tr")).toHaveCount(7);
  await expect(
    page.getByRole("button", {
      name: "Apply seven scores to provisional standings",
    }),
  ).toBeDisabled();
  expect(
    (await (await api.get("/api/state?env=practice")).json()).events[7].results,
  ).toHaveLength(0);
  const badSignature = await api.post("/api/fantasy/screenshot", {
    headers: { origin },
    data: {
      token: reviewReceipt.token + "x",
      environment: "practice",
      sundayOnly: true,
      confirm: "APPLY SCREENSHOT",
    },
  });
  expect(badSignature.ok()).toBe(false);
  const wrongEnvironment = await api.post("/api/fantasy/screenshot", {
    headers: { origin },
    data: {
      token: reviewReceipt.token,
      environment: "production",
      sundayOnly: true,
      confirm: "APPLY SCREENSHOT",
    },
  });
  expect(wrongEnvironment.ok()).toBe(false);
  await page.screenshot({
    path: "../fantasy-screenshot-review-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.screenshot({
    path: "../fantasy-screenshot-review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("I checked every score against the screenshot").check();
  await page
    .getByRole("button", {
      name: "Apply seven scores to provisional standings",
    })
    .click();
  await expect(
    page.getByText(
      "All seven screenshot scores saved. Provisional standings have updated.",
    ),
  ).toBeVisible();
  let current = await (await api.get("/api/state?env=practice")).json();
  expect(current.events[7].status).toBe("active");
  expect(current.events[7].results).toHaveLength(7);
  for (const [i, p] of players.entries())
    expect(
      current.events[7].results.find(
        (r: { participantId: string }) => r.participantId === p.id,
      ).value,
    ).toBe(String(100 - i * 10 + 0.25));
  await page.getByLabel(`${players[0].name} fantasy score`).fill("-1.50");
  await page
    .getByLabel(
      "I verified these totals include only eligible Sunday performances.",
    )
    .check();
  await page
    .getByRole("button", { name: "Save manual provisional scores" })
    .click();
  await expect(
    page.getByText(
      "Manual fantasy scores saved. Provisional standings have updated.",
    ),
  ).toBeVisible();
  current = await (await api.get("/api/state?env=practice")).json();
  expect(
    current.events[7].results.find(
      (r: { participantId: string }) => r.participantId === players[0].id,
    ).value,
  ).toBe("-1.5");
  const prior = current.standings.map((r: { id: string; points: string }) => [
    r.id,
    r.points,
  ]);
  await page
    .getByLabel("I verified all eligible Sunday games have ended")
    .check();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Finalize Sunday scores", exact: true })
    .click();
  await expect(
    page.getByText("ESPN fantasy scores finalized.", { exact: true }),
  ).toBeVisible();
  current = await (await api.get("/api/state?env=practice")).json();
  expect(current.phase).toBe("Complete");
  expect(
    current.standings.map((r: { id: string; points: string }) => [
      r.id,
      r.points,
    ]),
  ).toEqual(prior);
  const audit = await (
    await api.get("/api/admin?env=practice&mode=audit")
  ).json();
  expect(
    audit.some((a: { action: string }) => a.action === "fantasyScreenshot"),
  ).toBe(true);
  await page.screenshot({
    path: "../../work/fantasy-admin-verified.png",
    fullPage: true,
  });
});

test("provided ESPN screenshot: Total Pts column, shortened team label and all seven zeros", async ({
  page,
}) => {
  test.skip(
    !process.env.ESPN_EXAMPLE_IMAGE,
    "Set ESPN_EXAMPLE_IMAGE to run the private supplied-image check.",
  );
  test.setTimeout(180000);
  const origin = "http://localhost:3001",
    api = page.request;
  expect(
    (
      await api.post("/api/auth", {
        headers: { origin },
        data: { password: "integration-password-2026" },
      })
    ).ok(),
  ).toBe(true);
  const current = await (await api.get("/api/state?env=practice")).json();
  const event = current.events.find(
    (e: { kind: string }) => e.kind === "fantasy",
  );
  const reopened = await api.post("/api/action", {
    headers: { origin },
    data: {
      environment: "practice",
      action: { type: "reopen", eventId: event.id, confirm: "REOPEN" },
    },
  });
  expect(reopened.ok(), await reopened.text()).toBe(true);
  await page.goto("/admin?env=practice");
  await page.getByRole("button", { name: "fantasy", exact: true }).click();
  await page
    .getByText("1. Match ESPN team names to competitors", { exact: true })
    .click();
  const source: Record<string, string> = {
    Mark: "Mark's Magnificent Test Team",
    Hong: "Team 2",
    Li: "Team 3",
    Arun: "Team 4",
    Erfan: "Team 5",
    Dabin: "Team 6",
    Alex: "Team 7",
  };
  for (const p of current.participants)
    await page
      .getByLabel(`${p.name} ESPN team name`, { exact: true })
      .fill(source[p.name]);
  await page
    .getByLabel("Mark shortened ESPN screenshot label")
    .fill("Mark's Magnificent ...");
  await page.getByRole("button", { name: "Save all seven team names" }).click();
  await expect(
    page.getByText(
      "All seven team names saved. Screenshot uploads are enabled.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Choose ESPN scoreboard screenshot")
    .setInputFiles(process.env.ESPN_EXAMPLE_IMAGE!);
  await page
    .getByRole("button", { name: "Read ESPN screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3. Review all seven scores" }),
  ).toBeVisible({ timeout: 120000 });
  const rows = page.locator(".screenshot-review tbody tr");
  await expect(rows).toHaveCount(7);
  for (const row of await rows.all())
    await expect(row.locator("td").nth(2)).toHaveText("0");
  await expect(
    page.getByText("Visible: Mark's Magnificent ...", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../espn-example-total-pts-review.png",
    fullPage: true,
  });
  await page.getByLabel("I checked every score against the screenshot").check();
  await page
    .getByRole("button", {
      name: "Apply seven scores to provisional standings",
    })
    .click();
  await expect(
    page.getByText(
      "All seven screenshot scores saved. Provisional standings have updated.",
    ),
  ).toBeVisible();
  const updated = await (await api.get("/api/state?env=practice")).json();
  expect(
    updated.events
      .find((e: { kind: string }) => e.kind === "fantasy")
      .results.every((r: { value: string }) => r.value === "0"),
  ).toBe(true);
});
