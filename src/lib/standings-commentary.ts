import type { PublicState } from "./model";
import { placements } from "./scoring";

export type StandingComment = {
  text: string;
  detail: string;
  kind: "movement" | "form" | "banter";
};
const ordinal = (place: number) =>
  `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;

// All commentary is derived from recorded results; no AI service or score changes.
export function standingsCommentary(
  state: PublicState,
): Record<string, StandingComment[]> {
  const completed = state.events
    .filter((event) => !event.deleted && event.status === "finalized")
    .sort((a, b) => (a.finalizedAt ?? "").localeCompare(b.finalizedAt ?? ""));
  const finishes = completed.map((event) => placements(event));
  const checkpoints = state.snapshots
    .filter((snapshot) => !snapshot.id.startsWith("live-"))
    .sort((a, b) => a.at.localeCompare(b.at));
  const latest = checkpoints.at(-1),
    previous = checkpoints.at(-2);
  const gains = new Map(
    state.participants.map((player) => [
      player.id,
      previous && latest
        ? (previous.standings.find((row) => row.id === player.id)?.rank ?? 0) -
          (latest.standings.find((row) => row.id === player.id)?.rank ?? 0)
        : 0,
    ]),
  );
  const biggest = Math.max(0, ...gains.values());
  const leader = Math.max(
    0,
    ...state.standings.map((row) => Number(row.points)),
  );
  const lastRank = Math.max(0, ...state.standings.map((row) => row.rank));
  return Object.fromEntries(
    state.participants.map((player) => {
      const notes: StandingComment[] = [];
      const row = state.standings.find((row) => row.id === player.id);
      if (!completed.length || !row) return [player.id, notes];
      const gain = gains.get(player.id) ?? 0;
      if (biggest > 0 && gain === biggest)
        notes.push({
          text: `Biggest mover: +${gain}`,
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
        notes.push({
          text: `${ordinal(recent!.place!)} place streak ×${streak}!`,
          detail: `Finished in the same official place in ${streak} consecutive completed events; shared places count.`,
          kind: "form",
        });
      const deficit = leader - Number(row.points);
      if (
        completed.length >= 3 &&
        row.rank === lastRank &&
        row.rank > 1 &&
        deficit >= 30
      )
        notes.push({
          text: "You need a handicap, bro?",
          detail: `${deficit.toFixed(1)} points behind the leader. Plenty of comeback material.`,
          kind: "banter",
        });
      const wins = finishes.filter((event) =>
        event.some(
          (finish) =>
            finish.id === player.id && finish.place === 1 && finish.tie === 1,
        ),
      ).length;
      const podiums = finishes.filter((event) =>
        event.some(
          (finish) =>
            finish.id === player.id &&
            finish.place !== null &&
            finish.place <= 3,
        ),
      ).length;
      if (notes.length < 2 && wins >= 2)
        notes.push({
          text: `${wins} event wins. Save some for us.`,
          detail: `${wins} outright wins across completed events.`,
          kind: "form",
        });
      if (!notes.length && podiums >= 2)
        notes.push({
          text: `Podium regular: ${podiums} top-3 finishes`,
          detail:
            "Based on event placements, including shared top-three places.",
          kind: "form",
        });
      if (!notes.length && row.rank === 1)
        notes.push({
          text: "Front-runner. Keep that energy.",
          detail: "Currently tied for or holding first overall.",
          kind: "form",
        });
      if (!notes.length && completed.length >= 3 && wins === 0)
        notes.push({
          text: "Still hunting that first win",
          detail: "No outright first-place event finishes yet.",
          kind: "banter",
        });
      if (!notes.length)
        notes.push({
          text:
            deficit <= 15 ? "Right in the mix" : "The comeback arc is loading…",
          detail: `${deficit.toFixed(1)} points behind the leader.`,
          kind: "banter",
        });
      return [player.id, notes.slice(0, 2)];
    }),
  );
}
