import type { Event } from "./model";

// Presentation only. Event rules, direction, weights and scoring stay in the tournament engine.
const artwork = {
  "event-1": {
    subtitle: "Fastest Time Wins",
    file: "beer-pong.svg",
    alt: "Red party cups arranged in a triangle with a white ping-pong ball",
  },
  "event-2": {
    subtitle: "Closest to Target Wins",
    file: "pigskin-accuracy-toss.svg",
    alt: "An American football flying toward a circular bullseye target",
  },
  "event-3": {
    subtitle: "Fastest Time Wins",
    file: "40m-dash.svg",
    alt: "A sprinter racing toward a checkered finish line",
  },
  "event-4": {
    subtitle: "Time trials & tournament bracket",
    file: "mario-kart-racing.svg",
    alt: "An original red cartoon go-kart beside a checkered racing flag",
  },
  "event-5": {
    subtitle: "Fast Time Wins",
    file: "paper-airplane.svg",
    alt: "A folded white and gold paper airplane with a curved flight trail",
  },
  "event-6": {
    subtitle: "Most Flips Wins",
    file: "bottle-flip-frenzy.svg",
    alt: "A water bottle flipping above a landing surface with curved motion arrows",
  },
  "event-7": {
    subtitle: "Longest Streak Wins",
    file: "higher-or-lower.svg",
    alt: "Playing cards with an upward gold arrow and a downward blue arrow",
  },
  "event-8": {
    subtitle: "Fantasy Finale",
    file: "single-week-fantasy.svg",
    alt: "A gold championship trophy beside an American football",
  },
} as const;

export function eventPresentation(
  event: Pick<Event, "id" | "direction"> & Partial<Pick<Event, "name">>,
) {
  if (event.name === "Choose Your Character")
    return {
      subtitle: "Last Man Standing Wins",
      file: "choose-your-character-1.svg",
      alt: "A gold circle divided by bold crossing lines, inspired by a fighting-game arena emblem",
    };
  return (
    (
      artwork as Partial<
        Record<string, { subtitle: string; file: string; alt: string }>
      >
    )[event.id] ?? {
      subtitle:
        event.direction === "asc"
          ? "Lowest result wins"
          : "Highest result wins",
      file: undefined,
      alt: "Custom tournament event flag",
    }
  );
}
