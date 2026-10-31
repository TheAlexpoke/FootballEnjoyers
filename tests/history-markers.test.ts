import { describe, expect, it } from "vitest";
import { spreadHistoryMarkers } from "../src/lib/history-markers";

describe("history photo placement", () => {
  it.each([80, 360])(
    "keeps seven tied photos separate and inside the chart at y=%s",
    (y) => {
      const markers = spreadHistoryMarkers(
        Array.from({ length: 7 }, (_, i) => ({ id: String(i), y })),
      );
      expect(markers.every((marker) => marker.y === y)).toBe(true);
      expect(markers[0].markerY).toBeGreaterThanOrEqual(40);
      expect(markers.at(-1)!.markerY).toBeLessThanOrEqual(410);
      for (let i = 1; i < markers.length; i++)
        expect(
          markers[i].markerY - markers[i - 1].markerY,
        ).toBeGreaterThanOrEqual(40);
    },
  );
  it("leaves clear untied points in place and separates close point totals", () => {
    expect(
      spreadHistoryMarkers([
        { id: "Mark", y: 80 },
        { id: "Hong", y: 160 },
      ]).map((p) => p.markerY),
    ).toEqual([80, 160]);
    const close = spreadHistoryMarkers([
      { id: "Mark", y: 80 },
      { id: "Hong", y: 82 },
    ]);
    expect(close[1].markerY - close[0].markerY).toBe(40);
    expect(close.map((p) => p.y)).toEqual([80, 82]);
  });
});
