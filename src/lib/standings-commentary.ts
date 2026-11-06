import type { PublicState } from "./model";
import { placements } from "./scoring";

export type StandingComment = {
  text: string;
  detail: string;
  kind: "movement" | "form" | "banter";
};
const LINES: Record<number, string[]> = {
  1: [
    "Everyone else must be playing for second.",
    "A generational talent.",
    "Built different. Actually.",
    "Making grown men question their existence.",
    "The tournament runs through him.",
    "Sources confirm he's HIM.",
    "A dynasty in the making.",
  ],
  2: [
    "First place in losing.",
    "Would be first if first didn't exist.",
    "The best loser in the building.",
    "One choke away from greatness.",
  ],
  3: [
    "Just happy to be on the podium.",
    "A contender in theory.",
    "Elite at being pretty good.",
    "Nobody remembers who finished third.",
    "A dark horse with no horsepower.",
    "Not a threat. Not a joke. Just there.",
    "Too good to roast. Too mid to praise.",
    "Currently enjoying the view from irrelevance.",
  ],
  4: [
    "mid.",
    "Aggressively average.",
    "Too good to be last. Too bad to matter.",
    "Nobody's worried about this guy.",
    "Contender in his own head.",
    "Somehow still mathematically alive.",
    "The human equivalent of room-temperature water.",
    "A perfectly balanced disappointment.",
    "The NPC of the tournament.",
  ],
  5: [
    "A generational underachievement.",
    "Peaked on Thursday.",
    "Sources say he's lost the locker room.",
    "His mom still believes in him.",
    "Currently exploring other hobbies.",
    "The analytics suggest retirement.",
    "All talk, no hardware.",
    "Draft stock in absolute free fall.",
    "Currently blaming the format.",
    "A cautionary tale about self-confidence.",
  ],
  6: [
    "Saved by someone else's incompetence.",
    "Making 7th place look competitive.",
    "Would be last in most other tournaments.",
    "Currently seeking a rule change.",
    "Not even the refs can save him.",
    "His highlight reel is 4 seconds long.",
    "The only thing worse than his performance is his confidence.",
    "A masterclass in doing absolutely nothing.",
    "One spot above rock bottom. Hang the banner.",
  ],
  7: [
    "Are you even trying?",
    "Pitiful...",
    "A historic display of incompetence.",
    "The reason participation trophies exist.",
    "Generational loser.",
    "Making a strong case for an eighth participant.",
    "His biggest contribution was paying for the Airbnb.",
    "The league is considering relegation.",
    "A statistical anomaly. In the worst way.",
    "A Make-A-Wish performance.",
    "The first overall pick of being terrible.",
  ],
};
const ordinal = (place: number) =>
  `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
const hash = (value: string) =>
  [...value].reduce(
    (seed, char) => (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0,
    0,
  );

// Comments depend only on completed-event results, never on a clock or an AI call.
export function standingsCommentary(
  state: PublicState,
): Record<string, StandingComment[]> {
  const completed = state.events
    .filter((event) => !event.deleted && event.status === "finalized")
    .sort((a, b) => (a.finalizedAt ?? "").localeCompare(b.finalizedAt ?? ""));
  const finishes = completed.map((event) => placements(event));
  const completedIds = new Set(completed.map((event) => event.id));
  const checkpoints = state.snapshots
    .filter(
      (snapshot) =>
        !snapshot.id.startsWith("live-") && completedIds.has(snapshot.eventId),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const latest = checkpoints.at(-1),
    previous = checkpoints.at(-2);
  const gains = new Map(
    state.participants.map((player) => {
      const before = previous?.standings.find((row) => row.id === player.id);
      const after = latest?.standings.find((row) => row.id === player.id);
      return [player.id, before && after ? before.rank - after.rank : 0];
    }),
  );
  const biggest = Math.max(0, ...gains.values());
  const sorted = [...(latest?.standings ?? state.standings)].sort(
    (a, b) => a.rank - b.rank,
  );
  const leaderPoints = Math.max(0, ...sorted.map((row) => Number(row.points)));
  const recentLeads = checkpoints.slice(-3).map((snapshot) => {
    const first = snapshot.standings.filter((row) => row.rank === 1);
    if (first.length !== 1) return null;
    const others = snapshot.standings.filter((row) => row.id !== first[0].id);
    return {
      id: first[0].id,
      gap:
        Number(first[0].points) -
        Math.max(...others.map((row) => Number(row.points))),
    };
  });
  const pullingAway =
    completed.length >= 3 &&
    recentLeads.length === 3 &&
    recentLeads.every(
      (lead) => lead && lead.id === recentLeads[0]?.id && lead.gap > 0,
    ) &&
    recentLeads[1]!.gap > recentLeads[0]!.gap &&
    recentLeads[2]!.gap > recentLeads[1]!.gap;
  const kartComplete = completed.some((event) => event.kind === "kart" || event.name === "Mario Kart");
  const round = Math.max(0, completed.length - 1);
  return Object.fromEntries(
    state.participants.map((player) => {
      const stats: StandingComment[] = [];
      const row = sorted.find((row) => row.id === player.id);
      if (!completed.length || !row) return [player.id, stats];
      const gain = gains.get(player.id) ?? 0;
      if (biggest > 0 && gain === biggest)
        stats.push({
          text: "Biggest mover",
          detail: `Gained ${gain} ${gain === 1 ? "place" : "places"} after the latest completed event.`,
          kind: "movement",
        });
      const recent = finishes.at(-1)?.find((finish) => finish.id === player.id);
      let streak = 0;
      if (recent?.place)
        for (let i = finishes.length - 1; i >= 0; i--) {
          if (
            finishes[i].find((finish) => finish.id === player.id)?.place !==
            recent.place
          )
            break;
          streak++;
        }
      if (streak >= 2)
        stats.push({
          text:
            recent!.place === 2
              ? `A silver medal enthusiast. ×${streak}`
              : recent!.place === 3
                ? `The bronze medal bandit. ×${streak}`
                : `${ordinal(recent!.place!)} place streak ×${streak}!`,
          detail: `Finished in the same official place in ${streak} consecutive completed events; shared places count.`,
          kind: "form",
        });
      const wins = finishes.filter((event) =>
        event.some(
          (finish) =>
            finish.id === player.id && finish.place === 1 && finish.tie === 1,
        ),
      ).length;
      if (!stats.length && wins >= 2)
        stats.push({
          text: `${wins} event wins. Save some for us.`,
          detail: `${wins} outright wins across completed events.`,
          kind: "form",
        });
      const pool = [...(LINES[row.rank] ?? LINES[7])];
      const deficit = leaderPoints - Number(row.points);
      const above = sorted.filter((other) => other.rank < row.rank).at(-1);
      if (row.rank === 7 && above) {
        const name = state.participants.find(
          (other) => other.id === above.id,
        )?.name;
        if (name) pool.push(`You're really letting ${name} beat you??`);
        if (completed.length >= 3 && deficit >= 30)
          pool.push("You need a handicap, bro?");
      }
      if (row.rank === 5 && kartComplete)
        pool.push("Somebody check his controller.");
      if (row.rank === 1 && pullingAway && recentLeads[0]?.id === player.id)
        pool.push("The gap is getting disrespectful.");
      let text = pool[(hash(`${player.id}:${row.rank}`) + round) % pool.length];
      // Prefer lines supported by a specific result over general rank banter.
      if (row.rank === 1 && pullingAway && recentLeads[0]?.id === player.id)
        text = "The gap is getting disrespectful.";
      else if (row.rank === 1 && recent?.place === 1 && streak >= 2)
        text = "A dynasty in the making.";
      else if (row.rank === 1 && recent?.place === 1)
        text = "Sources confirm he's HIM.";
      else if (row.rank === 2 && deficit <= 5)
        text = "Currently breathing down the king's neck.";
      else if (
        row.rank === 5 &&
        (completed.at(-1)?.kind === "kart" || completed.at(-1)?.name === "Mario Kart") &&
        (recent?.place ?? 0) >= 5
      )
        text = "Somebody check his controller.";
      else if (row.rank === 7 && above && round % 2 === 0) {
        const name = state.participants.find(
          (other) => other.id === above.id,
        )?.name;
        if (name) text = `You're really letting ${name} beat you??`;
      }
      const banter: StandingComment = {
        text,
        detail: `${ordinal(row.rank)} overall · ${deficit.toFixed(1)} points behind the leader. Tournament banter; finish streaks refer to individual events.`,
        kind: "banter",
      };
      return [player.id, stats.length ? [stats[0], banter] : [banter]];
    }),
  );
}
