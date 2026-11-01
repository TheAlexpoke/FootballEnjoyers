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
test("bonus note preference survives navigation and reloads and synchronizes browser tabs", async ({
  page,
  context,
}) => {
  await context.route("**/api/state*", (route) =>
    route.fulfill({ json: fixture() }),
  );
  const other = await context.newPage();
  await page.goto("/");
  await other.goto("/events");
  await expect(
    page.getByRole("region", { name: "Bonus awards explained" }),
  ).toBeVisible();
  await expect(
    other.getByRole("region", { name: "Bonus awards explained" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Minimize bonus note" }).click();
  await expect(
    other.getByRole("button", { name: "Show bonus note" }),
  ).toBeVisible();
  await page.goto("/history");
  await page.goto("/events");
  await expect(
    page.getByRole("button", { name: "Show bonus note" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show bonus note" }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Show bonus note" }).click();
  await expect(
    page.getByRole("region", { name: "Bonus awards explained" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Bonus awards explained" }),
  ).toBeVisible();
  await other.close();
});
test("public dashboard fits viewport and shows all competitors", async ({
  page,
}) => {
  await page.route("**/api/state*", (r) => r.fulfill({ json: fixture() }));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tournament standings" }),
  ).toBeVisible();
  await expect(page.locator(".standing-row")).toHaveCount(7);
  await expect(page.locator(".standing-form")).toHaveCount(7);
  await expect(page.locator(".standing-form").first()).toHaveText(
    "Sources confirm he's HIM.",
  );
  await expect(page.locator(".standing-comment").first()).toHaveAttribute(
    "title",
    /1st overall/,
  );
  await expect(
    page.locator(".tournament-strip").getByText("COMPETITORS", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".standing-row .rank-trophy")).toHaveCount(3);
  await expect(page.locator(".standing-row .rank").nth(3)).toHaveText("4");
  await expect(page.locator(".standing-row .points").first()).toHaveText(
    "25.0PTS",
  );
  await expect(
    page.locator(".consistency-badge").filter({ hasText: "Consistency" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".consistency-badge").filter({ hasText: "Consistency" }),
  ).toContainText("+10 Consistency");
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
  const s = fixture();
  s.snapshots = [
    {
      id: "final-event-1",
      eventId: "event-1",
      at: "2026-10-31T12:00:00.000Z",
      label: "Beer Pong",
      standings: s.standings,
    },
  ];
  await page.route("**/api/state*", (r) => r.fulfill({ json: s }));
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
  await expect(page.locator(".history-table")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Event Finishes" }),
  ).toBeVisible();
  await expect(page.locator(".profile-points-summary")).toContainText(
    "(Consistency Award +10.0)",
  );
  const comparison = page.getByRole("table", {
    name: "Beer Pong: all player results",
  });
  await expect(comparison.locator("thead th[data-player-id]")).toHaveCount(7);
  await expect(comparison.locator("tbody td.comparison-self")).toHaveCount(3);
  await expect(
    comparison.locator("tbody tr").nth(1).locator('[data-player-id="p0"]'),
  ).toHaveText("30");
  await expect(
    comparison.locator("tbody tr").nth(2).locator('[data-player-id="p0"]'),
  ).toHaveText("15.0");
  await expect(
    page.locator(".event-comparison .comparison-self .rank-trophy--1"),
  ).toHaveCount(1);
  await expect(page.locator(".consistency-summary").first()).toContainText(
    "+10 pts included in total",
  );
  await page.goto("/players/p1");
  await expect(
    page.locator(".event-comparison .comparison-self .rank-trophy--2"),
  ).toHaveCount(1);
  await page.goto("/players/p2");
  await expect(
    page.locator(".event-comparison .comparison-self .rank-trophy--3"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("exact history tables separate cumulative event points and current awards", async ({
  page,
}) => {
  const s = fixture();
  s.snapshots = [
    {
      id: "final-event-1",
      eventId: "event-1",
      at: "2026-10-31T12:00:00.000Z",
      label: "Beer Pong",
      standings: s.standings,
    },
  ];
  const next = initialState();
  next.participants = s.participants.map((player) => ({
    ...player,
    credentialHash: "",
    deviceHash: "",
  }));
  next.events = structuredClone(s.events);
  next.events[1].status = "finalized";
  next.events[1].results = next.participants.map((player, i) => ({
    participantId: player.id,
    value: String([4, 1, 2, 3, 5, 6, 7][i]),
    absent: false,
  }));
  s.snapshots.push({
    id: "final-event-2",
    eventId: "event-2",
    at: "2026-10-31T13:00:00.000Z",
    label: "Pigskin Accuracy Toss",
    standings: standings(next),
  });
  s.events = next.events;
  await page.route("**/api/state*", (route) => route.fulfill({ json: s }));
  await page.goto("/history");
  await page
    .getByRole("button", { name: "Points Progression", exact: true })
    .click();
  await page
    .getByText("View exact standings by event", { exact: true })
    .click();
  const table = page.getByRole("table", {
    name: "Cumulative standings after Beer Pong",
  });
  await expect(table.locator("thead th[data-player-id]")).toHaveCount(7);
  await expect(table.locator("tbody tr > th")).toHaveText([
    "Rank / change",
    "Event points",
    "Bonus points",
    "Total points",
  ]);
  await expect(
    table.locator("tbody tr").nth(1).locator('[data-player-id="p0"]'),
  ).toHaveText("15.0(+15.0)");
  await expect(
    table.locator("tbody tr").nth(2).locator('[data-player-id="p0"]'),
  ).toContainText("10.0");
  await expect(
    table.locator("tbody tr").nth(3).locator('[data-player-id="p0"]'),
  ).toHaveText("25.0");
  await expect(
    table.locator("tbody tr").nth(1).locator('[data-player-id="p6"]'),
  ).toHaveText("0.0(+0.0)");
  await expect(
    table.locator("tbody tr").nth(2).locator('[data-player-id="p6"]'),
  ).toContainText("Last place +10.0");
  const second = page.getByRole("table", {
    name: "Cumulative standings after Pigskin Accuracy Toss",
  });
  await expect(second.locator('[data-player-id="p0"] .rank-delta')).toHaveText(
    "(−1)",
  );
  await expect(
    second.locator("tbody tr").nth(1).locator('[data-player-id="p0"]'),
  ).toHaveText("18.0(+3.0)");
  await expect(
    second.locator("tbody tr").nth(2).locator('[data-player-id="p0"]'),
  ).toHaveText("0.0");
  await expect(
    second.locator("tbody tr").nth(3).locator('[data-player-id="p0"]'),
  ).toHaveText("18.0");
  await page
    .getByRole("button", { name: "Standings Progression", exact: true })
    .click();
  await expect(
    second
      .locator("tbody tr")
      .nth(0)
      .locator('[data-player-id="p0"] .rank-delta'),
  ).toHaveText("(−1)");
  await expect(
    second.locator("tbody tr").nth(1).locator('[data-player-id="p0"]'),
  ).toHaveText("18.0(+3.0)");
  await page
    .getByRole("button", { name: "Event Finishes", exact: true })
    .click();
  await expect(page.locator(".chart-scroll polyline")).toHaveCount(0);
  await expect(page.locator("[data-history-connector]")).toHaveCount(0);
  await expect(page.locator("[data-history-marker]")).toHaveCount(14);
  const finishes = page.getByRole("table", {
    name: "Event finishes for Beer Pong",
  });
  await expect(
    finishes.locator("thead th[data-player-id] > span:last-child"),
  ).toHaveText(["Mark", "Hong", "Li", "Arun", "Erfan", "Dabin", "Alex"]);
  await expect(
    finishes
      .getByRole("row", { name: /^Event points/ })
      .locator('[data-player-id="p6"]'),
  ).toHaveText("0.0");
  await expect(
    finishes
      .getByRole("row", { name: /^Bonus points/ })
      .locator('[data-player-id="p6"]'),
  ).toContainText("10.0");
});
test("player photos navigate from notes, comparison tables, and chart markers and retain sandbox", async ({
  page,
}) => {
  const state = fixture();
  state.snapshots = [
    {
      id: "final-event-1",
      eventId: "event-1",
      at: "2026-10-31T12:00:00.000Z",
      label: "Beer Pong",
      standings: state.standings,
    },
  ];
  await page.route("**/api/state*", (route) => route.fulfill({ json: state }));
  for (const [selector, id] of [
    [".winner-note .avatar", "p0"],
    [".last-place-note .avatar", "p6"],
  ]) {
    await page.goto("/events?env=practice");
    await page.locator(selector).first().click();
    await expect(page).toHaveURL(new RegExp(`/players/${id}\\?env=practice$`));
    await expect(
      page.getByRole("heading", { name: "Event performance" }),
    ).toBeVisible();
  }
  await page.goto("/history?env=practice");
  await page.locator('[data-history-marker="p2"]').click();
  await expect(page).toHaveURL(/\/players\/p2\?env=practice$/);
  await page
    .getByRole("table", { name: "Beer Pong: all player results" })
    .locator('thead [data-player-id="p3"] .avatar')
    .click();
  await expect(page).toHaveURL(/\/players\/p3\?env=practice$/);
  expect(await page.locator("a a").count()).toBe(0);
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
  const empty = initialState();
  await page.route("**/api/state*", (r) =>
    r.fulfill({
      json: {
        ...empty,
        configured: true,
        localMode: true,
        standings: [],
        phase: phase(empty),
      },
    }),
  );
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
  const empty = initialState();
  await page.route("**/api/state*", (r) =>
    r.fulfill({
      json: {
        ...empty,
        configured: true,
        localMode: true,
        standings: [],
        phase: phase(empty),
      },
    }),
  );
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
  await expect(
    page.getByRole("region", { name: "Scoring breakdown" }),
  ).toBeVisible();
  await expect(page.locator(".events-page-header .points-scale b")).toHaveText([
    "15",
    "10",
    "6",
    "3",
    "2",
    "1",
    "0",
  ]);
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

test("history selects everyone after loading and gives tied players separate photo markers", async ({
  page,
}) => {
  const s = fixture();
  s.participants = s.participants.map((p) => ({
    ...p,
    avatar: "/images/events/beer-pong.svg",
  }));
  s.snapshots = [
    {
      id: "event-1",
      eventId: "event-1",
      at: "2026-10-31T12:00:00.000Z",
      label: "Beer Pong",
      standings: s.participants.map((p) => ({
        id: p.id,
        rank: 1,
        points: "6",
        finishes: [],
      })),
    },
  ];
  s.snapshots.unshift({
    ...s.snapshots[0],
    id: "event-3",
    eventId: "event-3",
    at: "2026-10-31T13:00:00.000Z",
    label: "40M Dash",
  });
  s.snapshots.push({
    ...s.snapshots[0],
    id: "live-fantasy",
    eventId: "event-8",
    at: "2026-10-31T14:00:00.000Z",
    label: "Fantasy live",
  });
  await page.route("**/api/state*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ json: s });
  });
  await page.goto("/history");
  await page
    .getByRole("button", { name: "Standings Progression", exact: true })
    .click();
  await expect(page.locator(".chart-filters")).toHaveCount(0);
  await expect(page.locator(".history-rank-label")).toHaveCount(7);
  expect(
    await page
      .locator(".history-rank-label .rank-trophy")
      .evaluateAll((trophies) =>
        trophies.every((trophy) => trophy.getBoundingClientRect().width <= 44),
      ),
  ).toBe(true);
  await expect(page.locator("[data-history-marker] image")).toHaveCount(7);
  await expect(page.locator("[data-history-connector]")).toHaveCount(7);
  const photoXs = await page
    .locator("[data-history-marker] image")
    .evaluateAll((images) =>
      images.map((image) => Number(image.getAttribute("x"))),
    );
  expect(new Set(photoXs).size).toBe(2);
  const dataEnd = await page
    .locator(".chart-scroll polyline")
    .evaluateAll((lines) =>
      Math.max(
        ...lines.flatMap((line) =>
          (line.getAttribute("points") ?? "")
            .trim()
            .split(/\s+/)
            .map((pair) => Number(pair.split(",")[0])),
        ),
      ),
    );
  expect(Math.min(...photoXs)).toBeGreaterThan(dataEnd + 20);
  expect(
    await page
      .locator(".chart-scroll")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator("[data-history-event]")
      .evaluateAll((labels) =>
        labels.map((label) => label.getAttribute("data-history-event")),
      ),
  ).toEqual(["event-1", "event-3", "event-8"]);
  await expect(page.locator('[data-history-event="event-1"]')).toContainText(
    "Beer Pong",
  );
  await expect(page.locator('[data-history-event="event-3"]')).toContainText(
    "40M Dash",
  );
  await expect(
    page.locator("[data-history-marker] image").first().locator(".."),
  ).toContainText("40M Dash");
  const photos = await page
    .locator("[data-history-marker] image")
    .evaluateAll((images) =>
      images.map((image) => Number(image.getAttribute("y"))),
    );
  expect(new Set(photos).size).toBe(7);
  await page
    .getByRole("button", { name: "Points Progression", exact: true })
    .click();
  await expect(page.locator("[data-history-marker] image")).toHaveCount(7);
});

test("up-next browsing keeps events in order and duplicate player names stay hidden", async ({
  page,
}) => {
  const s = fixture();
  s.participants = s.participants.map((p) => ({
    ...p,
    team: p.name,
    nickname: "Old nickname",
  }));
  await page.route("**/api/state*", (r) => r.fulfill({ json: s }));
  await page.goto("/");
  const panel = page.locator(".next-card");
  await expect(
    panel.getByRole("heading", { name: "Pigskin Accuracy Toss", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".standing-row .competitor small")).toHaveCount(0);
  await expect(page.getByText("Old nickname", { exact: false })).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Previous event", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Beer Pong", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Previous event", exact: true }),
  ).toBeDisabled();
  for (let i = 1; i < 8; i++)
    await panel
      .getByRole("button", { name: "Next event", exact: true })
      .click();
  await expect(
    panel.getByRole("heading", {
      name: "Single Week Fantasy Score",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Next event", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("link", { name: "Event details & rules" }),
  ).toHaveAttribute("href", "/events/event-8");
});

test("completed event posters pin winner photos and include tied winners", async ({
  page,
}) => {
  const s = fixture();
  s.participants = s.participants.map((p) => ({
    ...p,
    avatar: "/images/events/beer-pong.svg",
  }));
  await page.route("**/api/state*", (r) => r.fulfill({ json: s }));
  await page.goto("/events");
  const first = page.locator(
    '.event-card:has(.event-card-link[href="/events/event-1"])',
  );
  await expect(
    first.getByRole("group", { name: "EVENT WINNER: Mark", exact: true }),
  ).toBeVisible();
  await expect(first.locator(".winner-note img")).toHaveCount(1);
  await expect(
    first.getByRole("group", { name: "LAST PLACE: Alex", exact: true }),
  ).toBeVisible();
  await expect(first.locator(".last-place-note img")).toHaveCount(1);
  await expect(
    page.locator(".event-card.scheduled .last-place-note"),
  ).toHaveCount(0);
  await expect(page.locator(".event-card.scheduled .winner-note")).toHaveCount(
    0,
  );
  s.events[0].results[1].value = s.events[0].results[0].value;
  s.events[0].results[5].value = s.events[0].results[6].value;
  s.events[3].status = "finalized";
  s.events[3].results = s.participants.map((p, i) => ({
    participantId: p.id,
    value: String(Math.min(i + 1, 5)),
    absent: false,
  }));
  await page.reload();
  await expect(
    first.getByRole("group", { name: "TIED WINNERS: Mark, Hong", exact: true }),
  ).toBeVisible();
  await expect(first.locator(".winner-note img")).toHaveCount(2);
  await expect(
    first.getByRole("group", {
      name: "TIED LAST PLACE: Dabin, Alex",
      exact: true,
    }),
  ).toBeVisible();
  await expect(first.locator(".last-place-note img")).toHaveCount(2);
  await expect(
    page.locator(
      '.event-card:has(.event-card-link[href="/events/event-4"]) .last-place-note img',
    ),
  ).toHaveCount(3);
  await first.locator(".event-card-link").click();
  await expect(
    page.locator(".event-detail-banner .winner-note img"),
  ).toHaveCount(2);
  s.events[0].status = "active";
  await page.goto("/events");
  await expect(first.locator(".winner-note")).toHaveCount(0);
  await expect(first.locator(".last-place-note")).toHaveCount(0);
});
