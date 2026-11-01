import { describe, expect, it } from "vitest";
import { initialState, type Event } from "../src/lib/model";
import { remainingEventPoints } from "../src/lib/scoring";

const schedule = (): Event[] =>
  [1, 1, 1, 1, 1, 1, 2, 2, 3].map((weight, index) => ({
    ...initialState().events[0],
    id: `test-${index}`,
    weight: String(weight),
  }));
describe("remaining event points", () => {
  it("tracks a perfect remaining run without adding moving bonuses", () => {
    const events = schedule();
    expect(remainingEventPoints(events)).toBe("195");
    events[0].status = "finalized";
    expect(remainingEventPoints(events)).toBe("180");
    events.slice(0, 7).forEach((event) => {
      event.status = "finalized";
    });
    expect(remainingEventPoints(events)).toBe("75");
    events[7].status = "finalized";
    expect(remainingEventPoints(events)).toBe("45");
    events[8].status = "active";
    expect(remainingEventPoints(events)).toBe("45");
    events[8].status = "finalized";
    expect(remainingEventPoints(events)).toBe("0");
    events[7].status = "scheduled";
    expect(remainingEventPoints(events)).toBe("30");
  });
  it("excludes deleted events and supports fractional multipliers exactly", () => {
    const events = schedule();
    events.forEach((event) => {
      event.deleted = true;
    });
    events[0].deleted = false;
    events[0].weight = "1.1";
    expect(remainingEventPoints(events)).toBe("16.5");
  });
});
