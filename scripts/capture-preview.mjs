import { chromium } from "@playwright/test";
import { initialState, NAMES } from "../src/lib/model.ts";
import { standings, phase } from "../src/lib/scoring.ts";
const s = initialState("practice");
s.participants = NAMES.map((name, i) => ({
  id: `sample-${i}`,
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
const values = [
  [35, 40, 46, 52, 55, 60, 65],
  [70, 44, 52, 31, 90, 80, 60],
  [6.5, 6.8, 6.7, 6.9, 7.1, 7.2, 7.4],
  [1, 2, 3, 4, 5, 5, 5],
  [90, 85, 110, 100, 120, 105, 95],
];
for (let i = 0; i < 5; i++) {
  s.events[i].status = "finalized";
  s.events[i].results = s.participants.map((p, j) => ({
    participantId: p.id,
    value: String(values[i][j]),
    absent: false,
  }));
}
s.events[5].status = "active";
const state = {
  ...s,
  configured: true,
  standings: standings(s).map((r, i) => ({
    ...r,
    previousRank: [2, 1, 4, 3, 6, 5, 7][i],
  })),
  phase: phase(s),
  me: "sample-1",
  audit: undefined,
};
const browser = await chromium.launch();
for (const [name, width, height] of [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.route("**/api/state*", (route) => route.fulfill({ json: state }));
  await page.goto("http://localhost:3001/?env=practice");
  await page.locator(".standing-row").first().waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `../preview-practice-${name}.png`,
    fullPage: true,
  });
  await page.close();
}
await browser.close();
