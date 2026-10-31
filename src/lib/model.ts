export const NAMES = [
  "Mark",
  "Hong",
  "Li",
  "Arun",
  "Erfan",
  "Dabin",
  "Alex",
] as const;
export type Identity = (typeof NAMES)[number];
export type Status = "scheduled" | "active" | "finalized";
export type Kind = "time" | "distance" | "count" | "kart" | "fantasy";
export type Result = {
  participantId: string;
  value: string | null;
  absent: boolean;
  note?: string;
};
export type Participant = {
  id: string;
  name: Identity;
  team: string;
  nickname: string;
  sleeper: string;
  avatar: string;
  credentialHash: string;
  deviceHash: string;
};
export type Match = { id: string; a: string; b: string; winner?: string };
export type Event = {
  id: string;
  name: string;
  weight: string;
  kind: Kind;
  unit: string;
  direction: "asc" | "desc";
  description: string;
  rules: string[];
  status: Status;
  order: string[];
  originalOrder?: string[];
  results: Result[];
  seeds: string[];
  trials: Record<string, string>;
  matches: Match[];
  finalizedAt?: string;
  startedAt?: string;
  deleted?: boolean;
};
export type Standing = {
  id: string;
  rank: number;
  points: string;
  finishes: number[];
  previousRank?: number;
  averagePlacement?: string | null;
  consistencyBonus?: string;
};
export type Snapshot = {
  id: string;
  eventId: string;
  at: string;
  label: string;
  standings: Standing[];
  fantasyResults?: Result[];
};
export type Audit = {
  id: string;
  at: string;
  action: string;
  reference: string;
  old: unknown;
  value: unknown;
};
export type FantasyLine = {
  id: string;
  name: string;
  team: string;
  position: string;
  slot: string;
  score: string;
  eligible: boolean;
};
export type Game = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  status: "scheduled" | "live" | "final";
};
export type Fantasy = {
  entry?: {
    teamNames: Record<string, string>;
    labels?: Record<string, string>;
    updatedAt?: string;
    source?: "manual" | "screenshot";
  };
  leagueId: string;
  week: number;
  league: Record<string, unknown> | null;
  users: unknown[];
  rosters: unknown[];
  mappings: Record<string, number>;
  manualMappings: string[];
  players: Record<string, { name: string; team: string; position: string }>;
  playersAt?: string;
  lineups: Record<string, FantasyLine[]>;
  overrides: Record<string, { score: string; reason: string }>;
  games: Game[];
  lastSuccess?: string;
  lastAttempt?: string;
  status: string;
  warning: string;
  stableSince?: string;
  fingerprint?: string;
  sourceUpdatedAt?: string;
};
export type State = {
  version: 1;
  revision: number;
  environment: "production" | "practice";
  participants: Participant[];
  events: Event[];
  snapshots: Snapshot[];
  audit: Audit[];
  config: { layout: "standings" | "events"; draftOrder: string[] };
  fantasy: Fantasy;
};
export type PublicState = Omit<State, "participants" | "audit"> & {
  participants: Omit<Participant, "credentialHash" | "deviceHash">[];
  standings: Standing[];
  phase: string;
  configured: boolean;
  localMode?: boolean;
  readOnly?: boolean;
  sharedSnapshotAt?: string;
  me?: string;
};
export function initialState(
  environment: State["environment"] = "production",
): State {
  const specs: [string, string, Kind, string, string[]][] = [
    [
      "Beer Pong",
      "1",
      "time",
      "sec",
      [
        "Ten standard red Solo cups in a triangle. Throw or bounce balls into cups.",
        "Retrieve your own balls. One cup rearrangement allowed. Fastest completion wins.",
      ],
    ],
    [
      "Pigskin Accuracy Toss",
      "1",
      "distance",
      "cm",
      [
        "Three throws at a target marker. Only the closest throw counts.",
        "Use the same measurement unit for everyone. Smallest distance wins.",
      ],
    ],
    [
      "40M Dash",
      "1",
      "time",
      "sec",
      [
        "Run the same marked sprint course; it need not be exactly 40 meters.",
        "Use an external stopwatch. Fastest completion wins.",
      ],
    ],
    [
      "Mario Kart",
      "2",
      "kart",
      "place",
      [
        "Time trial on the same course; own kart and character allowed. Resolve tied seeds explicitly.",
        "Seed 1 gets a bye. Wild Card: 2 vs 7, 3 vs 6, 4 vs 5.",
        "Higher seed chooses the course. Own kart and character; no items.",
        "Reseed semifinals: seed 1 faces the highest numerical remaining seed.",
        "Championship and third-place races decide places 1–4. Wild Card losers tie for 5th and each receive 1 base point.",
      ],
    ],
    [
      "Relay Race",
      "2",
      "time",
      "sec",
      [
        "Individual five-station obstacle course. Unlimited attempts; one continuous external stopwatch, nearest 0.01 second.",
        "1 · Cup Roller — roll a ping pong ball across a table into a cup.",
        "2 · Dice Jackpot — roll two dice until their sum is 10 or higher.",
        "3 · Suit Hunt — reveal the first card of a preshuffled face-down deck. Find and stack all 13 cards of that suit, including that card. Flip, spread and rearrange freely.",
        "4 · Flip Cup Triple — three cups start upside down at the table edge. Flip each until upright.",
        "5 · Paper Plane Landing — build a plane while the clock runs, then throw until any part touches the target.",
      ],
    ],
    [
      "Bottle Flip Frenzy",
      "1",
      "count",
      "flips",
      [
        "60 seconds, using the same bottle for everyone.",
        "Count successful bottle flips. Most successful flips wins.",
      ],
    ],
    [
      "Higher or Lower",
      "1",
      "count",
      "streak",
      [
        "Freshly shuffled 52-card deck for each competitor; external 60-second timer.",
        "Reveal a reference card. Predict higher or lower. Correct guesses add to the current streak.",
        "Wrong or equal rank resets the streak to zero; the revealed card becomes the next reference. Continue immediately.",
        "Stop at 60 seconds or deck exhaustion. No stopping or banking. Only the longest consecutive correct streak counts.",
      ],
    ],
    [
      "Single Week Fantasy Score",
      "4",
      "fantasy",
      "pts",
      [
        "Sunday, November 8, 2026 only, including Sunday Night Football. Thursday and Monday performances are excluded.",
        "Use your actual ESPN league scoring settings and only eligible starters. The administrator verifies Sunday-only totals.",
        "The administrator enters all seven scores manually or uploads a screenshot matching all seven configured team names. Reviewed provisional fantasy points contribute to tournament totals. Finalization requires administrator confirmation.",
      ],
    ],
  ];
  return {
    version: 1,
    revision: 0,
    environment,
    participants: [],
    events: specs.map(([name, weight, kind, unit, rules], i) => ({
      id: `event-${i + 1}`,
      name,
      weight,
      kind,
      unit,
      direction: kind === "count" || kind === "fantasy" ? "desc" : "asc",
      description: rules[0],
      rules,
      status: "scheduled",
      order: [],
      results: [],
      seeds: [],
      trials: {},
      matches: [],
    })),
    snapshots: [],
    audit: [],
    config: { layout: "standings", draftOrder: [] },
    fantasy: {
      leagueId: "",
      week: 9,
      league: null,
      users: [],
      rosters: [],
      mappings: {},
      manualMappings: [],
      players: {},
      lineups: {},
      overrides: {},
      games: [],
      entry: { teamNames: {} },
      status: "Awaiting admin scores",
      warning: "",
    },
  };
}
