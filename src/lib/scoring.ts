import Decimal from "decimal.js";
import type { Event, State, Standing } from "./model";
export const BASE = [15, 10, 6, 3, 2, 1, 0];
// All possible seven-person tie denominators divide 420. Integer ticks are exact.
const SCALE = 420;
export type Placement = {
  id: string;
  place: number | null;
  tie: number;
  baseTicks: number;
  points: string;
  absent: boolean;
};
export function placements(event: Event): Placement[] {
  const present = event.results
    .filter((r) => !r.absent && r.value !== null)
    .sort(
      (a, b) =>
        new Decimal(a.value!).cmp(b.value!) *
        (event.direction === "asc" ? 1 : -1),
    );
  const out: Placement[] = [];
  for (let i = 0; i < present.length;) {
    let j = i + 1;
    while (
      j < present.length &&
      new Decimal(present[j].value!).eq(present[i].value!)
    )
      j++;
    const count = j - i;
    let ticks = (BASE.slice(i, j).reduce((a, b) => a + b, 0) * SCALE) / count;
    if (event.kind === "kart" && i === 4 && count === 3) ticks = SCALE;
    for (let k = i; k < j; k++)
      out.push({
        id: present[k].participantId,
        place: i + 1,
        tie: count,
        baseTicks: ticks,
        points:
          new Decimal(ticks)
            .div(SCALE)
            .mul(event.weight)
            .toFixed(8)
            .replace(/\.?0+$/, "") || "0",
        absent: false,
      });
    i = j;
  }
  for (const r of event.results.filter((r) => r.absent))
    out.push({
      id: r.participantId,
      place: null,
      tie: 0,
      baseTicks: 0,
      points: "0",
      absent: true,
    });
  return out;
}
export function counts(event: Event) {
  return (
    !event.deleted &&
    (event.status === "finalized" ||
      (event.kind === "fantasy" && event.status === "active"))
  );
}
export function standings(state: State): Standing[] {
  const rows = state.participants.map((p) => ({
    id: p.id,
    ticks: new Decimal(0),
    finishes: Array<number>(7).fill(0),
  }));
  for (const event of state.events.filter(counts))
    for (const result of placements(event)) {
      const row = rows.find((r) => r.id === result.id);
      if (!row) continue;
      row.ticks = row.ticks.plus(
        new Decimal(result.baseTicks).mul(event.weight),
      );
      if (result.place !== null && !(result.place === 1 && result.tie > 1))
        row.finishes[result.place - 1]++;
    }
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.ticks.cmp(a.ticks) ||
    a.finishes.reduce((v, n, i) => v || b.finishes[i] - n, 0);
  rows.sort(compare);
  let rank = 1;
  return rows.map((r, i) => {
    if (i && compare(rows[i - 1], r) !== 0) rank = i + 1;
    return {
      id: r.id,
      rank,
      points:
        r.ticks
          .div(SCALE)
          .toFixed(8)
          .replace(/\.?0+$/, "") || "0",
      finishes: r.finishes,
    };
  });
}
export function phase(s: State) {
  const events = s.events.filter((e) => !e.deleted);
  if (events.length && events.every((e) => e.status === "finalized"))
    return "Complete";
  if (events.some((e) => e.kind === "fantasy" && e.status === "active"))
    return "Fantasy Finale";
  if (events.some((e) => e.status !== "scheduled")) return "In Progress";
  return s.participants.length === 7 ? "Ready" : "Registration Open";
}
export function rebuildHistory(s: State) {
  // Re-evaluate stored event sets after corrections, retaining actual frozen start orders.
  const done: string[] = [];
  const finalized = s.events
    .filter((e) => !e.deleted && e.status === "finalized")
    .sort((a, b) => (a.finalizedAt ?? "").localeCompare(b.finalizedAt ?? ""));
  const previous = s.snapshots;
  s.snapshots = [];
  for (const event of finalized) {
    done.push(event.id);
    const slice = {
      ...s,
      events: s.events.map((e) => ({
        ...e,
        status: done.includes(e.id)
          ? ("finalized" as const)
          : ("scheduled" as const),
      })),
    };
    s.snapshots.push({
      id: `final-${event.id}`,
      eventId: event.id,
      label: event.name,
      at: event.finalizedAt!,
      standings: standings(slice),
    });
  }
  // Retain raw fantasy observations so physical corrections recalculate live history.
  if (s.events.some((e) => e.kind === "fantasy" && e.status === "active"))
    s.snapshots.push(
      ...previous
        .filter((x) => x.id.startsWith("live-") && x.fantasyResults)
        .slice(-100)
        .map((snapshot) => ({
          ...snapshot,
          standings: standings({
            ...s,
            events: s.events.map((e) =>
              e.kind === "fantasy"
                ? { ...e, status: "active", results: snapshot.fantasyResults! }
                : e,
            ),
          }),
        })),
    );
}
export function movement(s: State) {
  const current = standings(s);
  const latest = s.snapshots.at(-1);
  const previous =
    latest &&
    JSON.stringify(latest.standings.map((x) => [x.id, x.rank, x.points])) ===
      JSON.stringify(current.map((x) => [x.id, x.rank, x.points]))
      ? s.snapshots.at(-2)
      : latest;
  return current.map((r) => ({
    ...r,
    previousRank: previous?.standings.find((p) => p.id === r.id)?.rank,
  }));
}
export function draftOrder(s: State) {
  const rows = standings(s);
  const positions = new Map(s.config.draftOrder.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) =>
      a.rank - b.rank ||
      (positions.get(a.id) ?? 99) - (positions.get(b.id) ?? 99),
  );
}
