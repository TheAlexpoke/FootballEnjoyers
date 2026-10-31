import Decimal from "decimal.js";
import type { Event, Match } from "./model";
const absent = (e: Event, id: string) =>
  e.results.some((r) => r.participantId === id && r.absent);
export function seedKart(event: Event, order: string[], ids: string[]) {
  if (
    order.length !== 7 ||
    new Set(order).size !== 7 ||
    ids.some((id) => !order.includes(id))
  )
    throw Error("All seven competitors must be seeded.");
  let previous: string | undefined,
    seenAbsent = false;
  for (const id of order) {
    if (absent(event, id)) {
      seenAbsent = true;
      continue;
    }
    if (seenAbsent)
      throw Error("Absent competitors must follow all time-trial seeds.");
    if (!event.trials[id])
      throw Error("Enter all time trials or mark explicit absences first.");
    if (previous && new Decimal(event.trials[previous]).gt(event.trials[id]))
      throw Error(
        "Seeds must follow time-trial times. Explicitly order tied times.",
      );
    previous = id;
  }
  event.seeds = [...order];
  event.matches = [];
  rebuildBracket(event);
}
export function selectWinner(event: Event, matchId: string, winner: string) {
  const match = event.matches.find((m) => m.id === matchId);
  if (!match || ![match.a, match.b].includes(winner) || absent(event, winner))
    throw Error("Winner must belong to this matchup and be present.");
  match.winner = winner;
  if (matchId.startsWith("wc-"))
    event.matches = event.matches.filter((m) => m.id.startsWith("wc-"));
  if (matchId.startsWith("sf-"))
    event.matches = event.matches.filter(
      (m) => !["final", "third"].includes(m.id),
    );
  rebuildBracket(event);
}
export function rebuildBracket(event: Event) {
  if (event.seeds.length !== 7) return;
  const old = event.matches;
  const next: Match[] = [];
  const seeds = event.seeds;
  const make = (id: string, a: string, b: string) => {
    const previous = old.find((m) => m.id === id && m.a === a && m.b === b);
    const match: Match = { id, a, b };
    // Absent identities are empty bracket slots and never earn placements.
    if (absent(event, a) || absent(event, b))
      match.winner = absent(event, a) ? b : a;
    else if (previous?.winner && [a, b].includes(previous.winner))
      match.winner = previous.winner;
    next.push(match);
    return match;
  };
  const wc = [
    make("wc-1", seeds[1], seeds[6]),
    make("wc-2", seeds[2], seeds[5]),
    make("wc-3", seeds[3], seeds[4]),
  ];
  const loser = (m: Match) => (m.a === m.winner ? m.b : m.a);
  const absences = event.results.filter((r) => r.absent);
  event.results = [...absences];
  if (wc.every((m) => m.winner)) {
    const winners = wc
      .map((m) => m.winner!)
      .sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
    const sf = [
      make("sf-1", seeds[0], winners[2]),
      make("sf-2", winners[0], winners[1]),
    ];
    if (sf.every((m) => m.winner)) {
      const final = make("final", sf[0].winner!, sf[1].winner!),
        third = make("third", loser(sf[0]), loser(sf[1]));
      if (final.winner && third.winner) {
        const order = [
          final.winner,
          loser(final),
          third.winner,
          loser(third),
          ...wc.map(loser),
        ];
        event.results = [
          ...order
            .filter((id) => !absences.some((r) => r.participantId === id))
            .map((id) => ({
              participantId: id,
              value: String(Math.min(order.indexOf(id) + 1, 5)),
              absent: false,
            })),
          ...absences,
        ];
      }
    }
  }
  event.matches = next;
}
