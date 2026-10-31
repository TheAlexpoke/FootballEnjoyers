import { test, expect } from "@playwright/test";
import { initialState, NAMES } from "../../src/lib/model";
import { standings, phase } from "../../src/lib/scoring";
const fixture = () => {
  const s = initialState();
  s.participants = NAMES.map((name, i) => ({
    id: `p${i}`,
    name,
    team: [
      "Fourth & Gold",
      "Hong Kong Chiefs",
      "Li Dynasty",
      "Arun It Back",
      "Sunday Scaries",
      "Dab to the Future",
      "The End Zone",
    ][i],
    nickname: "",
    sleeper: "",
    avatar: "",
    credentialHash: "",
    deviceHash: "",
  }));
  s.events[0].status = "finalized";
  s.events[0].results = s.participants.map((p, i) => ({
    participantId: p.id,
    value: String(30 + i * 5),
    absent: false,
  }));
  return {
    ...s,
    participants: s.participants.map(
      ({ credentialHash: _c, deviceHash: _d, ...p }) => p,
    ),
    audit: undefined,
    configured: true,
    standings: standings(s),
    phase: phase(s),
    me: "p1",
  };
};
test("public dashboard fits viewport and shows all competitors", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: fixture() }));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tournament standings" }),
  ).toBeVisible();
  await expect(page.locator(".standing-row")).toHaveCount(7);
  await expect(page.locator(".is-me")).toContainText("YOU");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch homepage layout" }).click();
  await page.reload();
  await expect(page.locator(".main-column>.next-card")).toBeVisible();
});
test("event rules and player details navigate correctly", async ({ page }) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: fixture() }));
  await page.goto("/events/event-5");
  await expect(
    page.getByRole("heading", { name: "Relay Race", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/5 · Paper Plane Landing/)).toBeVisible();
  await page.goto("/players/p0");
  await expect(
    page.getByRole("heading", { name: "Fourth & Gold" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Event performance" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("registration closes at seven and spectators can read standings", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: fixture() }));
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "The field is set." }),
  ).toBeVisible();
  await expect(page.getByText("Registration is closed.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join the tournament" }),
  ).toHaveCount(0);
});
test("local control room needs no password or participant sign-up", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Make every result count." }),
  ).toBeVisible();
  await expect(page.getByLabel("Administrator password")).toHaveCount(0);
  await page.getByRole("button", { name: "players", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add competitor" }),
  ).toBeVisible();
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "No sign-up needed." }),
  ).toBeVisible();
});
test("local editing rejects cross-origin and non-loopback requests", async ({
  request,
}) => {
  const res = await request.post("/api/action", {
    headers: { origin: "https://unrelated.example" },
    data: { action: { type: "reset", confirm: "RESET RESULTS" } },
  });
  expect(res.ok()).toBe(false);
  const practice = await request.get("/api/state?env=practice", {
    headers: { host: "unrelated.example" },
  });
  expect(practice.ok()).toBe(false);
  const exportRes = await request.get("/api/admin?mode=json", {
    headers: { host: "unrelated.example" },
  });
  expect(exportRes.status()).toBe(403);
  const cron = await request.get("/api/cron/fantasy");
  expect(cron.status()).toBe(401);
});

test("compact hero keeps both headlines readable across screen sizes", async ({
  page,
}) => {
  for (const width of [375, 768, 1024, 1440, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const hero = page.locator(".hero");
    await expect(hero.getByRole("heading")).toHaveText("MAY THE BESTMAN WIN");
    await expect(hero).not.toContainText("SEVEN FRIENDS");
    await expect(
      hero.getByText("The draft order isn’t given. It’s earned."),
    ).toBeVisible();
    await expect(hero.locator(".hero-stamp")).toContainText("PICKING FIRST");
    const dimensions = await hero.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      const headline = el.querySelector("h1")!.getBoundingClientRect();
      const stamp = el.querySelector(".hero-stamp")!.getBoundingClientRect();
      return {
        height: bounds.height,
        fits:
          headline.right <= stamp.left &&
          stamp.right <= bounds.right &&
          stamp.bottom <= bounds.bottom,
      };
    });
    const previousHeight = width <= 760 ? 205 : width >= 1500 ? 285 : 258;
    expect(dimensions.height / previousHeight).toBeGreaterThanOrEqual(0.6);
    expect(dimensions.height / previousHeight).toBeLessThanOrEqual(0.65);
    expect(dimensions.fits).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("all event cards retain navigation and show distinct local illustrations", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: fixture() }));
  await page.goto("/events");
  const cards = page.locator(".all-events .event-card");
  await expect(cards).toHaveCount(8);
  const subtitles = [
    "Fastest Time Wins",
    "Closest to Target Wins",
    "Fastest Time Wins",
    "Time trials & tournament bracket",
    "Fast Time Wins",
    "Most Flips Wins",
    "Longest Streak Wins",
    "Fantasy Finale",
  ];
  const sources = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute("href", `/events/event-${i + 1}`);
    await expect(card.locator("p")).toHaveText(subtitles[i]);
    await expect(card.locator(".weight")).toHaveText(
      `${fixture().events[i].weight}×`,
    );
    const image = card.locator("img.event-illustration");
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("alt", /.+/);
    await expect
      .poll(() =>
        image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBe(240);
    const source = await image.getAttribute("src");
    expect(source).toMatch(/^\/images\/events\/.+\.svg$/);
    sources.add(source!);
  }
  expect(sources.size).toBe(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cards.nth(4).click();
  await expect(
    page.getByRole("heading", { name: "Relay Race", exact: true }),
  ).toBeVisible();
});
