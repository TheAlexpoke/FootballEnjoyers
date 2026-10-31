"use client";
import { useCallback, useEffect, useState, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  ChevronLeft,
  Flag,
  History,
  LayoutGrid,
  ListOrdered,
  Lock,
  Menu,
  Radio,
  Shield,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { initialState, NAMES, type PublicState, type Event } from "@/lib/model";
import { placements, phase, standings } from "@/lib/scoring";
import { Admin } from "./admin";
import { EventIllustration } from "./event-illustration";
import { eventPresentation } from "@/lib/event-presentation";
import { RankTrophy, PlacementRank } from "./placement-rank";
import { spreadHistoryMarkers } from "@/lib/history-markers";
type Player = PublicState["participants"][number];
let realtimeClient: ReturnType<typeof createClient> | undefined;
export async function request(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await res.json();
  if (!res.ok || value.error) throw Error(value.error ?? "Request failed.");
  return value;
}
const empty = initialState();
export const fallback: PublicState = {
  ...empty,
  participants: [],
  standings: standings(empty),
  phase: phase(empty),
  configured: false,
};
export function Avatar({
  player,
  small = false,
}: {
  player: { name: string; avatar?: string };
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${NAMES.indexOf(player.name as (typeof NAMES)[number])} ${small ? "small" : ""}`}
    >
      {player.avatar ? (
        <img src={player.avatar} alt="" />
      ) : (
        player.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
export function Badge({ event }: { event: Event }) {
  return (
    <span className={`badge ${event.status}`}>
      {event.status === "active" ? (
        <>
          <span className="dot" /> In progress
        </>
      ) : event.status === "finalized" ? (
        <>
          <Check size={11} /> Final
        </>
      ) : (
        "Upcoming"
      )}
    </span>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
export function TournamentProvider() {
  return null;
}
function PlayerLink({
  readOnly,
  href,
  className,
  children,
}: {
  readOnly: boolean;
  href: string;
  className: string;
  children: ReactNode;
}) {
  return readOnly ? (
    <div className={className}>{children}</div>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
export default function TournamentApp({
  publicOnly = false,
}: {
  publicOnly?: boolean;
}) {
  const pathname = usePathname();
  const [data, setData] = useState<PublicState | null>(null);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState("");
  const [menu, setMenu] = useState(false);
  const [env, setEnv] = useState<"production" | "practice">("production");
  const [layout, setLayout] = useState<"standings" | "events">("standings");
  const [manualLayout, setManualLayout] = useState(false);
  useEffect(() => {
    setEnv(
      !publicOnly &&
        new URLSearchParams(window.location.search).get("env") === "practice"
        ? "practice"
        : "production",
    );
    const saved = localStorage.getItem("fe_layout");
    if (saved === "standings" || saved === "events") {
      setLayout(saved);
      setManualLayout(true);
    }
  }, [publicOnly]);
  const refresh = useCallback(async () => {
    try {
      const state = await request(`/api/state?env=${env}`);
      setData(state);
      setError("");
      setLastFetch(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost.");
    }
  }, [env]);
  useEffect(() => {
    setData(null);
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    let cleanup = () => {};
    if (
      env === "production" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const client = (realtimeClient ??= createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      ));
      const channel = client
        .channel("tournament-revision")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tournament_pulse",
            filter: "id=eq.production",
          },
          () => void refresh(),
        )
        .subscribe();
      cleanup = () => {
        void client.removeChannel(channel);
      };
    }
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      cleanup();
    };
  }, [refresh, env]);
  useEffect(() => {
    if (data && !manualLayout) setLayout(data.config.layout);
  }, [data, manualLayout]);
  const link = (path: string) =>
    env === "practice" ? `${path}?env=practice` : path;
  const state = data ?? fallback;
  const sharedView = publicOnly || state.readOnly;
  const completed = state.events.filter(
    (e) => !e.deleted && e.status === "finalized",
  ).length;
  const total = state.events.filter((e) => !e.deleted).length;
  const changeLayout = () => {
    const next = layout === "standings" ? "events" : "standings";
    setLayout(next);
    setManualLayout(true);
    localStorage.setItem("fe_layout", next);
  };
  const segments = pathname.split("/").filter(Boolean);
  const page = segments[0] ?? "home";
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link
            className="brand"
            href={link("/")}
            aria-label="Football Enjoyers home"
          >
            <span className="brand-icon">
              FE<span>★</span>
            </span>
            <span>
              FOOTBALL
              <br />
              <b>ENJOYERS</b>
            </span>
          </Link>
          <nav
            className={menu ? "nav open" : "nav"}
            aria-label="Main navigation"
          >
            {(sharedView
              ? [
                  ["/", "Standings"],
                  ["/events", "Events"],
                  ["/history", "History"],
                ]
              : [
                  ["/", "Standings"],
                  ["/events", "Events"],
                  ["/history", "History"],
                  [
                    state.localMode || state.readOnly ? "/admin" : "/register",
                    state.localMode
                      ? "Control room"
                      : state.readOnly
                        ? "About this preview"
                        : "The lobby",
                  ],
                ]
            ).map(([path, label]) => (
              <Link
                className={
                  pathname === path || pathname.startsWith(`${path}/`)
                    ? "selected"
                    : ""
                }
                key={path}
                href={link(path)}
                onClick={() => setMenu(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="season">
            DRAFT ORDER TOURNAMENT <b>2026</b>
          </span>
          {!sharedView && (
            <Link
              className="admin-link"
              href={link("/admin")}
              aria-label="Administrator"
            >
              <Shield size={18} />
            </Link>
          )}
          <button
            className="menu-button icon-button"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {env === "practice" && (
        <div className="practice-banner">
          <Shield size={15} /> ADMIN PRACTICE SANDBOX · Isolated from the
          official tournament <a href="/admin">Return to production</a>
        </div>
      )}
      <main
        className={`container ${state.participants.length ? "has-players" : ""}`}
      >
        {error && (
          <div className="connection-error" role="alert">
            {data ? "Connection interrupted. Showing last saved data. " : ""}
            {error} <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        {!data && !error ? (
          <div className="loading">
            <span className="dot" /> Connecting to the tournament…
          </div>
        ) : (
          <>
            {!state.configured && (
              <div className="setup-notice">
                <Lock size={15} />
                <span>
                  {state.readOnly ? (
                    "Read-only preview · Run the site locally to manage competitors and scores. Local scores are not synchronized here."
                  ) : (
                    <>
                      Preseason preview · Database setup is required before
                      registration or scoring.{" "}
                      <Link href="/admin">
                        Setup details <ArrowUpRight size={12} />
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}
            {page === "home" && (
              <>
                <section className="hero">
                  <div>
                    <h1>
                      MAY THE BEST
                      <br />
                      <span>MAN WIN</span>
                    </h1>
                    <p>The draft order isn’t given. It’s earned.</p>
                  </div>
                  <div className="hero-field">
                    <span className="field-number n20" aria-hidden="true">
                      20
                    </span>
                    <span className="field-number n30" aria-hidden="true">
                      30
                    </span>
                    <div className="football" aria-hidden="true">
                      〈<span>╪</span>〉
                    </div>
                    <span className="hero-stamp">
                      THE ROAD TO
                      <br />
                      <b>PICKING FIRST</b>
                      <small>FOOTBALL ENJOYERS / 2026</small>
                    </span>
                  </div>
                </section>
                <section className="tournament-strip">
                  <span className="phase">
                    <span className="dot" />
                    {state.phase}
                  </span>
                  <div className="progress-label">
                    <b>
                      {completed}
                      <span> / {total}</span>
                    </b>
                    <small>EVENTS COMPLETE</small>
                  </div>
                  <div className="progress-track">
                    {state.events
                      .filter((e) => !e.deleted)
                      .map((e) => (
                        <span key={e.id} className={e.status} />
                      ))}
                  </div>
                  <div className="strip-stat">
                    <b>
                      {state.participants.length}
                      <span> / 7</span>
                    </b>
                    <small>COMPETITORS</small>
                  </div>
                  <div className="strip-stat">
                    <b>
                      {state.events
                        .filter((e) => !e.deleted)
                        .reduce((n, e) => n + Number(e.weight) * 15, 20)}
                    </b>
                    <small>POINTS AVAILABLE</small>
                  </div>
                </section>
                <div className="dashboard">
                  <div className="main-column">
                    <BonusNote />
                    {layout === "events" && (
                      <NextEvent state={state} link={link} />
                    )}
                    <section className="panel leaderboard">
                      <div className="section-heading">
                        <div>
                          <div className="eyebrow">
                            THE RACE FOR DRAFT POSITION
                          </div>
                          <h2>
                            <Trophy size={21} /> Tournament standings
                          </h2>
                        </div>
                        <button
                          className="icon-button"
                          title="Switch between standings-first and event-first"
                          aria-label="Switch homepage layout"
                          onClick={changeLayout}
                        >
                          {layout === "standings" ? (
                            <LayoutGrid size={18} />
                          ) : (
                            <ListOrdered size={18} />
                          )}
                        </button>
                      </div>
                      <div className="table-head">
                        <span>RANK</span>
                        <span>COMPETITOR</span>
                        <span>MOVEMENT</span>
                        <span>POINTS</span>
                      </div>
                      {state.participants.length ? (
                        <div>
                          {state.standings.map((r) => {
                            const p = state.participants.find(
                              (p) => p.id === r.id,
                            )!;
                            const change =
                              completed === 0 || r.previousRank === undefined
                                ? 0
                                : r.previousRank - r.rank;
                            return (
                              <PlayerLink
                                readOnly={Boolean(sharedView)}
                                href={link(`/players/${p.id}`)}
                                key={p.id}
                                className={`standing-row ${r.rank === 1 && r.points !== "0" ? "leader" : ""} ${state.me === p.id ? "is-me" : ""}`}
                              >
                                <span className="rank">
                                  {completed === 0 ? (
                                    "-"
                                  ) : r.rank <= 3 ? (
                                    <RankTrophy rank={r.rank} />
                                  ) : (
                                    r.rank
                                  )}
                                </span>
                                <span className="competitor">
                                  <Avatar player={p} />
                                  <span>
                                    <b>
                                      {p.team}
                                      {state.me === p.id && <em>YOU</em>}
                                    </b>
                                    {p.team.trim().toLowerCase() !==
                                      p.name.toLowerCase() && (
                                      <small>{p.name}</small>
                                    )}
                                    {r.consistencyBonus === "10" && (
                                      <span
                                        className="consistency-badge"
                                        title={`Included in total · average placement ${Number(r.averagePlacement).toFixed(2)}`}
                                      >
                                        +10 Consistency · avg{" "}
                                        {Number(r.averagePlacement).toFixed(2)}
                                      </span>
                                    )}
                                    {Number(r.lastPlaceBonus ?? 0) > 0 && (
                                      <span
                                        className="consistency-badge"
                                        title="Included in total · 10-point pool split equally among tied leaders"
                                      >
                                        +{Number(r.lastPlaceBonus).toFixed(1)}{" "}
                                        Most last places · {r.lastPlaceFinishes}
                                      </span>
                                    )}
                                  </span>
                                </span>
                                <span
                                  className={`movement ${change > 0 ? "up" : change < 0 ? "down" : ""}`}
                                  title={
                                    r.previousRank
                                      ? `Previous position: ${r.previousRank}`
                                      : "No previous finalized position"
                                  }
                                >
                                  {change > 0 ? (
                                    <ArrowUp size={13} />
                                  ) : change < 0 ? (
                                    <ArrowDown size={13} />
                                  ) : (
                                    <span className="dash">—</span>
                                  )}
                                  {change !== 0 && Math.abs(change)}
                                </span>
                                <span className="points">
                                  {Number(r.points).toLocaleString(undefined, {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}
                                  <small>PTS</small>
                                </span>
                              </PlayerLink>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-standings">
                          <div className="empty-icon">
                            <Trophy size={30} />
                          </div>
                          <h3>The field is wide open.</h3>
                          <p>
                            {state.localMode ? (
                              "Seven competitors. Eight events. Add your competitors in the control room."
                            ) : (
                              <>
                                Seven competitors. Eight events. Claim your
                                identity
                                <br className="desktop" /> and get ready to earn
                                your draft position.
                              </>
                            )}
                          </p>
                          <Link
                            className="button primary"
                            href={link(
                              sharedView
                                ? "/events"
                                : state.localMode
                                  ? "/admin"
                                  : "/register",
                            )}
                          >
                            {state.localMode
                              ? "Open control room"
                              : sharedView
                                ? "View events"
                                : "Enter the lobby"}{" "}
                            <ArrowUpRight size={16} />
                          </Link>
                          <div className="waiting-avatars">
                            {NAMES.map((name) => (
                              <Avatar key={name} player={{ name }} small />
                            ))}
                          </div>
                          <small>Waiting for the first competitor</small>
                        </div>
                      )}
                      <div className="table-footer">
                        <span>
                          <span className="dot" />{" "}
                          {state.events.some(
                            (e) =>
                              e.kind === "fantasy" && e.status === "active",
                          )
                            ? "Includes provisional fantasy points"
                            : "Official finalized event points"}
                        </span>
                        <Link href={link("/history")}>
                          Standings history <ChevronRight size={13} />
                        </Link>
                      </div>
                    </section>
                    {state.phase === "Complete" && (
                      <section className="panel final-order">
                        <div className="eyebrow">THE PICKS ARE EARNED</div>
                        <h2>Draft-position selection order</h2>
                        <p>
                          Choose your draft slots offline in this order. Shared
                          ranks remain tied until the administrator records a
                          resolution.
                        </p>
                        {[...state.standings]
                          .sort(
                            (a, b) =>
                              a.rank - b.rank ||
                              state.config.draftOrder.indexOf(a.id) -
                                state.config.draftOrder.indexOf(b.id),
                          )
                          .map((r, i) => (
                            <div className="order-row" key={r.id}>
                              <b>
                                <PlacementRank
                                  rank={
                                    state.config.draftOrder.length
                                      ? i + 1
                                      : r.rank
                                  }
                                  size="small"
                                  prefix=""
                                />
                              </b>
                              {
                                state.participants.find((p) => p.id === r.id)
                                  ?.team
                              }
                              <span>
                                {Number(r.points).toLocaleString(undefined, {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}{" "}
                                pts
                              </span>
                            </div>
                          ))}
                      </section>
                    )}
                    <div className="section-title">
                      <h2>Event center</h2>
                      <Link href={link("/events")}>
                        All events <ArrowUpRight size={14} />
                      </Link>
                    </div>
                    <div className="event-grid">
                      {state.events
                        .filter((e) => !e.deleted)
                        .slice(0, 3)
                        .map((e, i) => (
                          <EventCard
                            key={e.id}
                            event={e}
                            players={state.participants}
                            index={i}
                            link={link}
                          />
                        ))}
                    </div>
                  </div>
                  <aside>
                    {layout === "standings" && (
                      <NextEvent state={state} link={link} />
                    )}
                    <FinaleCard state={state} link={link} />
                    <ScoringCard events={state.events} />
                  </aside>
                </div>
              </>
            )}
            {page === "events" && !segments[1] && (
              <>
                <div className="events-page-header">
                  <div className="events-intro">
                    <PageHeading
                      label="THE COMPETITION"
                      title={
                        <>
                          EARN YOUR
                          <br />
                          <span className="poster-gold">FIRST PICK.</span>
                        </>
                      }
                      detail="From the first throw to Sunday Night Football. Follow every result here."
                    />
                    <BonusNote />
                  </div>
                  <ScoringCard events={state.events} />
                </div>
                <div className="all-events">
                  {state.events
                    .filter((e) => !e.deleted)
                    .map((e, i) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        players={state.participants}
                        index={i}
                        link={link}
                      />
                    ))}
                </div>
              </>
            )}
            {page === "events" && segments[1] && (
              <EventDetail state={state} eventId={segments[1]} link={link} />
            )}
            {page === "players" && (
              <PlayerDetail state={state} id={segments[1]} link={link} />
            )}
            {page === "history" && (
              <>
                <PageHeading
                  label="THE BIG PICTURE"
                  title="Every move matters."
                  detail="Finalized event progression, with provisional fantasy updates clearly labeled."
                />
                <HistoryChart state={state} />
              </>
            )}
            {(page === "register" || page === "manage") &&
              (state.localMode || state.readOnly) && (
                <section className="panel admin-content">
                  <PageHeading
                    label="COMPETITORS"
                    title="No sign-up needed."
                    detail="Competitors and profiles are managed by the tournament organizer on the local site."
                  />
                  <Link className="button primary" href={link("/admin")}>
                    {state.localMode
                      ? "Open control room"
                      : "About this preview"}
                  </Link>
                </section>
              )}
            {page === "register" && !state.localMode && !state.readOnly && (
              <Registration state={state} refresh={refresh} />
            )}
            {page === "manage" && !state.localMode && !state.readOnly && (
              <Manage
                token={segments[1] ?? ""}
                refresh={refresh}
                environment={env}
              />
            )}
            {page === "admin" && (
              <Admin state={state} refresh={refresh} env={env} />
            )}
            {![
              "home",
              "events",
              "players",
              "history",
              "register",
              "manage",
              "admin",
            ].includes(page) && (
              <PageHeading
                label="OUT OF BOUNDS"
                title="Page not found"
                detail="Use the navigation to return to the tournament."
              />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-mark">
          FE / <b>2026</b>
        </span>
        <p>Seven friends. Eight events. Bragging rights forever.</p>
        <span>
          {sharedView && state.sharedSnapshotAt
            ? `Published ${new Date(state.sharedSnapshotAt).toLocaleDateString()}`
            : lastFetch
              ? `Updated ${lastFetch}`
              : "Connecting"}{" "}
          ·{" "}
          {sharedView ? (
            "View-only tournament snapshot"
          ) : (
            <Link href={link("/admin")}>Commissioner access</Link>
          )}
        </span>
      </footer>
    </>
  );
}
export const displayPoints = (s: string) =>
  Number(s).toLocaleString(undefined, { maximumFractionDigits: 3 });
function ordinal(n: number) {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}
export function PageHeading({
  label,
  title,
  detail,
}: {
  label: string;
  title: ReactNode;
  detail?: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{label}</div>
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
    </div>
  );
}
function BonusNote() {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed)
    return (
      <button
        className="bonus-note-toggle"
        onClick={() => setCollapsed(false)}
        aria-label="Show bonus note"
      >
        <Trophy size={16} /> Bonus notes
      </button>
    );
  return (
    <section className="bonus-note" aria-label="Bonus awards explained">
      <button
        className="bonus-note-close"
        aria-label="Minimize bonus note"
        onClick={() => setCollapsed(true)}
      >
        <X size={15} />
      </button>
      <h3>The bonus points</h3>
      <p>
        <strong>+10 Consistency</strong>Best average finish. Each tied leader
        gets 10.
      </p>
      <p>
        <strong>10-point Last Place pool</strong>Most last-place finishes. Tied
        leaders split 10; shared last places count.
      </p>
      <small>Updates after completed events. Included in totals.</small>
    </section>
  );
}
function ScoringCard({ events }: { events: Event[] }) {
  const eventMaximum = events
    .filter((event) => !event.deleted)
    .reduce((sum, event) => sum + 15 * Number(event.weight), 0);
  return (
    <section className="panel scoring-card" aria-label="Scoring breakdown">
      <div className="eyebrow">KNOW THE SCORE</div>
      <h3>Placement × weight.</h3>
      <p>Every finish counts. Bigger events raise the stakes.</p>
      <div className="points-scale">
        {[15, 10, 6, 3, 2, 1, 0].map((n, i) => (
          <span key={n}>
            <small>
              {i < 3 ? (
                <RankTrophy rank={i + 1} size="inline" />
              ) : (
                <>
                  {i + 1}
                  {ordinal(i + 1)}
                </>
              )}
            </small>
            <b>{n}</b>
          </span>
        ))}
      </div>
      <div className="fine-print">
        Ties share the average of occupied places.
        <br />
        Mario Kart Wild Card losers: 1 base point each.
      </div>
      <div className="scoring-maximum">
        <strong>
          {displayPoints(String(eventMaximum + 20))} points available
        </strong>
        <span>
          {displayPoints(String(eventMaximum))} event maximum + 10 consistency +
          10 most last places. Awards have separate eligibility; a perfect sweep
          earns {displayPoints(String(eventMaximum + 10))} points.
        </span>
      </div>
    </section>
  );
}
function NextEvent({
  state,
  link,
}: {
  state: PublicState;
  link: (p: string) => string;
}) {
  const events = state.events.filter((e) => !e.deleted);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const automatic =
    events.find((e) => e.status === "active") ??
    events.find((e) => e.status === "scheduled");
  const event = events.find((e) => e.id === previewId) ?? automatic;
  const index = event
    ? events.findIndex((e) => e.id === event.id)
    : events.length;
  return (
    <section className="panel next-card">
      <div className="next-event-heading">
        <div className="eyebrow">
          <Flag size={13} />
          {event?.status === "active" ? "ON THE FIELD" : "UP NEXT"}
        </div>
        <div className="event-browse-controls">
          <button
            type="button"
            aria-label="Previous event"
            disabled={index === 0 || !events.length}
            onClick={() => setPreviewId(events[index - 1].id)}
          >
            <ChevronLeft size={17} />
          </button>
          <span aria-live="polite">
            {event ? `${index + 1} / ${events.length}` : "Complete"}
          </span>
          <button
            type="button"
            aria-label="Next event"
            disabled={index >= events.length - 1}
            onClick={() => setPreviewId(events[index + 1].id)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {event ? (
        <>
          <div className="event-art event-art--illustrated">
            <EventIllustration event={event} />
          </div>
          <div className="next-title">
            <h2>{event.name}</h2>
            <span className="weight">{event.weight}×</span>
          </div>
          <p>{event.description}</p>
          <EventWinnerNote event={event} players={state.participants} />
          <Link className="button secondary" href={link(`/events/${event.id}`)}>
            Event details & rules <ArrowUpRight size={15} />
          </Link>
        </>
      ) : (
        <>
          <h2>That’s the tournament.</h2>
          <p>
            The final standings determine the draft-position selection order.
          </p>
        </>
      )}
    </section>
  );
}
function FinaleCard({
  state,
  link,
}: {
  state: PublicState;
  link: (p: string) => string;
}) {
  const e = state.events.find((e) => e.kind === "fantasy");
  return (
    <section className="panel finale-card">
      <div className="eyebrow">
        <Zap size={13} /> THE FINALE
      </div>
      <span className="finale-multiplier">
        {e?.weight ?? 3}
        <small>×</small>
      </span>
      <h3>Sunday decides it.</h3>
      <p>Single Week Fantasy Score</p>
      <div className="date-label">
        NOV 08 <span>2026 · SUNDAY ONLY</span>
      </div>
      {e && (
        <Link href={link(`/events/${e.id}`)}>
          Explore the fantasy finale <ArrowUpRight size={14} />
        </Link>
      )}
    </section>
  );
}
function EventCard({
  event,
  players,
  index,
  link,
}: {
  event: Event;
  players: Player[];
  index: number;
  link: (p: string) => string;
}) {
  return (
    <Link
      className={`event-card panel ${event.status} ${event.kind === "fantasy" ? "event-card--finale" : ""}`}
      href={link(`/events/${event.id}`)}
    >
      <div className="event-card-top">
        <span className="event-number">
          EVENT {String(index + 1).padStart(2, "0")}
        </span>
        <span className="weight">{event.weight}×</span>
      </div>
      <h3>{event.name}</h3>
      <p>{eventPresentation(event).subtitle}</p>
      <div className="event-card-illustration">
        <EventIllustration event={event} />
        <EventWinnerNote event={event} players={players} />
      </div>
      <div className="event-card-bottom">
        <Badge event={event} />
        <ArrowUpRight size={17} />
      </div>
    </Link>
  );
}
function EventWinnerNote({
  event,
  players,
}: {
  event: Event;
  players: Player[];
}) {
  if (event.status !== "finalized") return null;
  const winners = placements(event)
    .filter((result) => result.place === 1 && !result.absent)
    .flatMap((result) => {
      const player = players.find((p) => p.id === result.id);
      return player ? [player] : [];
    });
  if (!winners.length) return null;
  const label = winners.length === 1 ? "EVENT WINNER" : "TIED WINNERS";
  return (
    <div
      className={`winner-note ${winners.length > 1 ? "winner-note--tied" : ""}`}
      role="group"
      aria-label={`${label}: ${winners.map((p) => p.name).join(", ")}`}
    >
      <span className="winner-note-tape" aria-hidden="true" />
      <div className="winner-note-photos">
        {winners.map((player) => (
          <Avatar key={player.id} player={player} />
        ))}
      </div>
      <span className="winner-note-label">{label}</span>
      <strong>{winners.map((p) => p.name).join(" · ")}</strong>
    </div>
  );
}
export function EventDetail({
  state,
  eventId,
  link,
}: {
  state: PublicState;
  eventId: string;
  link: (p: string) => string;
}) {
  const e = state.events.find((e) => e.id === eventId && !e.deleted);
  if (!e) return <PageHeading label="EVENT CENTER" title="Event not found" />;
  const scores = placements(e);
  const ids = e.order.length ? e.order : state.participants.map((p) => p.id);
  const sorted = [...ids].sort(
    (a, b) =>
      (scores.find((r) => r.id === a)?.place ?? 99) -
      (scores.find((r) => r.id === b)?.place ?? 99),
  );
  return (
    <>
      <Link className="back-link" href={link("/events")}>
        ← All events
      </Link>
      <PageHeading
        label={`EVENT ${state.events.filter((e) => !e.deleted).indexOf(e) + 1} / ${e.weight}× WEIGHT`}
        title={e.name}
        detail={e.description}
      />
      <div className="event-detail-banner">
        <Badge event={e} />
        <EventWinnerNote event={e} players={state.participants} />
      </div>
      <div className="detail-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Results</h2>
            <span className="muted">
              {e.status === "finalized" ? "Official" : "Provisional"}
            </span>
          </div>
          {e.status !== "finalized" && (
            <p className="inline-note">
              {e.kind === "fantasy"
                ? "Live fantasy points contribute to the overall standings."
                : "Physical event points count only after finalization."}
            </p>
          )}
          <div className="results-list">
            {sorted.map((id) => {
              const p = state.participants.find((p) => p.id === id);
              if (!p) return null;
              const r = e.results.find((r) => r.participantId === id),
                score = scores.find((r) => r.id === id);
              return (
                <PlayerLink
                  readOnly={Boolean(state.readOnly)}
                  className="result-row"
                  key={id}
                  href={link(`/players/${id}`)}
                >
                  <span className="rank">
                    <PlacementRank rank={score?.place} size="small" prefix="" />
                    {(score?.tie ?? 0) > 1 ? "=" : ""}
                  </span>
                  <Avatar player={p} small />
                  <span className="result-person">
                    <b>{p.team}</b>
                    {p.team.trim().toLowerCase() !== p.name.toLowerCase() && (
                      <small>{p.name}</small>
                    )}
                  </span>
                  <span className="raw">
                    {r?.absent
                      ? "Absent"
                      : r?.value
                        ? `${r.value} ${e.unit}`
                        : "Awaiting result"}
                    <small>
                      {score
                        ? `${displayPoints(score.points)} tournament pts`
                        : "Not scored"}
                    </small>
                  </span>
                </PlayerLink>
              );
            })}
            {!sorted.length && (
              <div className="empty-small">
                Results will appear when competitors register and the event
                begins.
              </div>
            )}
          </div>
          {e.order.length > 0 && (
            <div className="rules-block">
              <h3>Frozen participation order</h3>
              <p>
                {e.order
                  .map(
                    (id) => state.participants.find((p) => p.id === id)?.name,
                  )
                  .join(" → ")}
              </p>
            </div>
          )}
        </section>
        <section className="panel rules-block">
          <div className="eyebrow">THE RULEBOOK</div>
          <h2>How it works</h2>
          {e.rules.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
        </section>
      </div>
      {e.kind === "kart" && <Bracket event={e} players={state.participants} />}
      {e.kind === "fantasy" && <FantasyDetail state={state} />}
    </>
  );
}
export function Bracket({
  event,
  players,
  onWinner,
}: {
  event: Event;
  players: Player[];
  onWinner?: (matchId: string, winner: string) => void;
}) {
  const rounds = [
    ["Wild Card", "wc-1", "wc-2", "wc-3"],
    ["Semifinals", "sf-1", "sf-2"],
    ["Championship", "final", "third"],
  ];
  return (
    <section className="panel bracket-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MARIO KART · ROAD TO THE PODIUM</div>
          <h2>Tournament bracket</h2>
        </div>
        <span className="muted">Reseeded semifinals</span>
      </div>
      <div className="bracket">
        {rounds.map(([name, ...ids], round) => (
          <div className={`bracket-round round-${round}`} key={name}>
            <h3>{name}</h3>
            {round === 0 && event.seeds[0] && (
              <div className="bye">
                <span className="gold">Seed 1</span>{" "}
                {players.find((p) => p.id === event.seeds[0])?.name}{" "}
                <small>BYE TO SEMIFINAL</small>
              </div>
            )}
            {ids.map((id) => {
              const m = event.matches.find((m) => m.id === id);
              return (
                <div className="matchup" key={id}>
                  <small>
                    {id === "third"
                      ? "THIRD-PLACE RACE"
                      : id === "final"
                        ? "CHAMPIONSHIP"
                        : id.replace("-", " ").toUpperCase()}
                  </small>
                  {m ? (
                    [m.a, m.b].map((p) => {
                      const player = players.find((x) => x.id === p);
                      return (
                        <button
                          key={p}
                          disabled={
                            !onWinner ||
                            event.results.some(
                              (r) => r.participantId === p && r.absent,
                            )
                          }
                          className={`match-player ${m.winner === p ? "winner" : ""}`}
                          onClick={() => onWinner?.(id, p)}
                        >
                          <span className="seed">
                            {event.seeds.indexOf(p) + 1}
                          </span>
                          <span>
                            {player?.team ?? "Competitor"}
                            <small>
                              {player?.name}
                              {event.results.some(
                                (r) => r.participantId === p && r.absent,
                              )
                                ? " · ABSENT / BYE"
                                : ""}
                            </small>
                          </span>
                          {m.winner === p && <Check size={16} />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="bracket-pending">
                      Awaiting previous round
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="inline-note">
        Wild Card losers tie for 5th–7th: 1 base point × {event.weight} ={" "}
        {event.weight} tournament points each.
      </p>
    </section>
  );
}
function FantasyDetail({ state }: { state: PublicState }) {
  const event = state.events.find((e) => !e.deleted && e.kind === "fantasy");
  return (
    <section className="panel fantasy-detail">
      <div className="section-heading">
        <h2>
          <Radio size={20} />
          ESPN fantasy score updates
        </h2>
        <span className="badge">
          {event?.status === "finalized"
            ? "Finalized"
            : event?.status === "active"
              ? "Provisional · admin updated"
              : "Awaiting admin scores"}
        </span>
      </div>
      <p className="inline-note">
        Only Sunday, November 8 ESPN fantasy performances count, including
        Sunday Night Football. The administrator verifies Sunday-only totals and
        updates scores manually or from a reviewed screenshot. Standings update
        after each saved update.
      </p>
      <p className="muted">
        Last admin update:{" "}
        {state.fantasy.entry?.updatedAt
          ? new Date(state.fantasy.entry.updatedAt).toLocaleString()
          : "No scores saved yet"}
        {state.fantasy.entry?.source
          ? ` · ${state.fantasy.entry.source === "screenshot" ? "Reviewed screenshot" : "Manual entry"}`
          : ""}
      </p>
      {state.participants.map((p) => (
        <div className="order-row fantasy-public-row" key={p.id}>
          <span>
            {p.team}
            {p.team.trim().toLowerCase() !== p.name.toLowerCase()
              ? ` · ${p.name}`
              : ""}
          </span>
          <b>
            {event?.results.find((r) => r.participantId === p.id)?.value ?? "—"}{" "}
            fantasy pts
          </b>
        </div>
      ))}
    </section>
  );
}
function PlayerDetail({
  state,
  id,
  link,
}: {
  state: PublicState;
  id: string;
  link: (p: string) => string;
}) {
  const p = state.participants.find((p) => p.id === id);
  if (!p) return <PageHeading label="COMPETITOR" title="Profile not found" />;
  const r = state.standings.find((r) => r.id === id);
  const ranked = state.events.some(
    (event) => !event.deleted && event.status === "finalized",
  );
  return (
    <>
      <Link className="back-link" href={link("/")}>
        ← Tournament standings
      </Link>
      <section className="player-hero">
        <Avatar player={p} />
        <div>
          {p.team.trim().toLowerCase() !== p.name.toLowerCase() && (
            <div className="eyebrow">{p.name}</div>
          )}
          <h1>{p.team}</h1>
        </div>
        <div className="player-stats">
          <span>
            <b>
              {ranked && r ? (
                <PlacementRank rank={r.rank} size="profile" />
              ) : (
                "-"
              )}
            </b>
            OVERALL
          </span>
          <span>
            <b>{displayPoints(r?.points ?? "0")}</b>POINTS
          </span>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Event performance</h2>
          <span className="muted">{r?.finishes[0] ?? 0} outright wins</span>
        </div>
        {r?.averagePlacement && (
          <div className="performance-row consistency-summary">
            <span>
              <b>Consistency Award</b>
              <small>
                Average placement: {Number(r.averagePlacement).toFixed(2)} ·
                completed events only
              </small>
            </span>
            <b>
              {r.consistencyBonus === "10"
                ? "+10 pts included in total"
                : "No current bonus"}
            </b>
          </div>
        )}
        {r?.averagePlacement && (
          <div className="performance-row consistency-summary">
            <span>
              <b>Most Last Places Award</b>
              <small>
                {r.lastPlaceFinishes ?? 0} last-place finishes · tied leaders
                split 10 points
              </small>
            </span>
            <b>
              {Number(r.lastPlaceBonus ?? 0) > 0
                ? `+${Number(r.lastPlaceBonus).toFixed(1)} pts included in total`
                : "No current bonus"}
            </b>
          </div>
        )}
        {state.events
          .filter((e) => !e.deleted)
          .map((e) => {
            const raw = e.results.find((x) => x.participantId === id),
              score = placements(e).find((x) => x.id === id);
            return (
              <Link
                className="performance-row"
                key={e.id}
                href={link(`/events/${e.id}`)}
              >
                <span>
                  <b>{e.name}</b>
                  <small>
                    {raw?.absent
                      ? "Absent"
                      : raw?.value
                        ? `${raw.value} ${e.unit}`
                        : "No result recorded"}
                  </small>
                </span>
                <Badge event={e} />
                <span className="performance-place">
                  {score?.place ? (
                    <>
                      {score.place <= 3 ? (
                        <RankTrophy rank={score.place} />
                      ) : (
                        `#${score.place}`
                      )}
                      {score.tie > 1 && <small>(tie)</small>}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <b>{score ? `${displayPoints(score.points)} pts` : "—"}</b>
              </Link>
            );
          })}
      </section>
      <HistoryChart state={state} initial={[id]} />
    </>
  );
}
export function HistoryChart({
  state,
  initial,
}: {
  state: PublicState;
  initial?: string[];
}) {
  const selected = initial ?? state.participants.map((p) => p.id);
  const chartId = useId().replace(/:/g, "");
  const [metric, setMetric] = useState<"rank" | "points">("rank");
  const colors = [
    "#e9bd5a",
    "#5ab6dd",
    "#ac95ed",
    "#5ec6a1",
    "#ec8e87",
    "#e2a15c",
    "#9aa9bd",
  ];
  const all = state.snapshots;
  const snapshots = all
    .filter((x) => !x.id.startsWith("live-"))
    .sort((a, b) => a.at.localeCompare(b.at));
  const latestCompletedId = snapshots.at(-1)?.id;
  const latestLive = all.filter((x) => x.id.startsWith("live-")).at(-1);
  if (latestLive) snapshots.push(latestLive);
  const max = Math.max(
    15,
    ...snapshots.flatMap((s) => s.standings.map((r) => Number(r.points))),
  );
  const width = 850;
  const labelLength = Math.min(
    18,
    Math.max(8, Math.floor(630 / Math.max(snapshots.length - 1, 1) / 9)),
  );
  const eventLabels = snapshots.map((snapshot) =>
    (
      state.events.find((event) => event.id === snapshot.eventId)?.name ??
      snapshot.label
    )
      .split(" ")
      .reduce<string[]>((lines, word) => {
        const last = lines.length - 1;
        if (last >= 0 && lines[last].length + word.length < labelLength)
          lines[last] += " " + word;
        else lines.push(word);
        return lines;
      }, []),
  );
  const height = Math.max(
    510,
    465 + Math.max(0, ...eventLabels.map((lines) => lines.length)) * 20,
  );
  const x = (i: number) =>
    110 + (i / Math.max(snapshots.length - 1, 1)) * (width - 220);
  const y = (v: number) =>
    metric === "rank" ? 80 + ((v - 1) / 6) * 280 : 360 - (v / max) * 280;
  const chartPoints = snapshots.map((snapshot, j) =>
    spreadHistoryMarkers(
      state.participants
        .filter((p) => selected.includes(p.id))
        .flatMap((p) => {
          const standing = snapshot.standings.find((r) => r.id === p.id);
          if (!standing) return [];
          return [
            {
              id: p.id,
              player: p,
              standing,
              x: x(j),
              y: y(metric === "rank" ? standing.rank : Number(standing.points)),
              color:
                colors[
                  state.participants.findIndex((player) => player.id === p.id) %
                    7
                ],
              label: snapshot.label,
            },
          ];
        }),
    ),
  );
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>
          <History size={20} /> Standings progression
        </h2>
        <div className="segmented">
          <button
            className={metric === "rank" ? "selected" : ""}
            onClick={() => setMetric("rank")}
          >
            Rank
          </button>
          <button
            className={metric === "points" ? "selected" : ""}
            onClick={() => setMetric("points")}
          >
            Points
          </button>
        </div>
      </div>
      {snapshots.length ? (
        <>
          <div className="chart-scroll">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{ width: "100%", minWidth: 0, height: "auto" }}
              role="img"
              aria-label={`${metric} progression across finalized events and latest live fantasy update`}
            >
              <title>{metric} progression</title>
              {Array.from({ length: 7 }, (_, i) => (
                <g key={i}>
                  <line
                    x1="59"
                    x2={width - 35}
                    y1={80 + (i * 280) / 6}
                    y2={80 + (i * 280) / 6}
                    stroke="#273142"
                  />
                  {metric === "rank" ? (
                    <g
                      className="history-rank-label"
                      data-rank={i + 1}
                      transform={"translate(27 " + (80 + (i * 280) / 6) + ")"}
                    >
                      {i < 3 ? (
                        <g transform="translate(-18 -22)">
                          <RankTrophy rank={i + 1} size="chart" />
                        </g>
                      ) : (
                        <>
                          <path
                            d="M-13-20H12L20-12V12L12 20H-13L-20 12V-12Z"
                            fill="#172231"
                            stroke="#3b4c62"
                            strokeWidth="1.2"
                          />
                          <path
                            d="M-10-16H10"
                            stroke="#667b96"
                            strokeWidth="2"
                          />
                          <text
                            y="2"
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#b4c3d7"
                            fontSize="29"
                            fontFamily="Impact, Arial Narrow, sans-serif"
                            fontWeight="900"
                            fontStyle="italic"
                          >
                            {i + 1}
                          </text>
                        </>
                      )}
                    </g>
                  ) : (
                    <text
                      x="27"
                      y={85 + (i * 280) / 6}
                      textAnchor="middle"
                      fill="#a7b7cd"
                      fontSize="16"
                      fontWeight="700"
                    >
                      {Math.round(max * (1 - i / 6))}
                    </text>
                  )}
                </g>
              ))}
              {snapshots.map((s, i) => (
                <text
                  key={s.id}
                  data-history-event={s.eventId}
                  x={x(i)}
                  y="435"
                  textAnchor="middle"
                  fill="#d6bd86"
                  fontSize="17"
                  fontWeight="800"
                  fontFamily="Impact, Arial Narrow, sans-serif"
                  letterSpacing="0.8"
                >
                  {eventLabels[i].map((line, lineIndex) => (
                    <tspan key={lineIndex} x={x(i)} dy={lineIndex ? 20 : 0}>
                      {line}
                    </tspan>
                  ))}
                  {s.id.startsWith("live-") && (
                    <tspan x={x(i)} dy="20">
                      Live update
                    </tspan>
                  )}
                </text>
              ))}
              {state.participants
                .filter((p) => selected.includes(p.id))
                .map((p) => {
                  const coords = chartPoints.flatMap((points) =>
                    points.filter((point) => point.id === p.id),
                  );
                  return (
                    <polyline
                      key={p.id}
                      points={coords.map((c) => [c.x, c.y].join(",")).join(" ")}
                      fill="none"
                      stroke={
                        colors[
                          state.participants.findIndex(
                            (player) => player.id === p.id,
                          ) % 7
                        ]
                      }
                      strokeWidth="2"
                      opacity="0.8"
                    />
                  );
                })}
              {chartPoints.map((points, j) =>
                points.map((point) => {
                  const showPhoto = snapshots[j].id === latestCompletedId;
                  const tied =
                    points.filter((other) => Math.abs(other.y - point.y) < 0.01)
                      .length > 1;
                  const markerX = point.x + (tied ? 38 : 0);
                  const label =
                    point.player.name +
                    ": " +
                    point.label +
                    " · #" +
                    point.standing.rank +
                    " · " +
                    point.standing.points +
                    " points";
                  const clip = chartId + "-" + point.id + "-" + j;
                  return (
                    <g
                      key={point.id + "-" + j}
                      role="img"
                      aria-label={label}
                      data-history-marker={point.id}
                    >
                      <title>{label}</title>
                      {showPhoto ? (
                        <>
                          {(tied ||
                            Math.abs(point.markerY - point.y) > 0.1) && (
                            <>
                              <line
                                data-history-connector={point.id}
                                x1={point.x}
                                y1={point.y}
                                x2={markerX}
                                y2={point.markerY}
                                stroke={point.color}
                                strokeWidth="1.5"
                                opacity="0.8"
                              />
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r="3"
                                fill={point.color}
                              />
                            </>
                          )}
                          <defs>
                            <clipPath id={clip}>
                              <circle cx={markerX} cy={point.markerY} r="16" />
                            </clipPath>
                          </defs>
                          <circle
                            cx={markerX}
                            cy={point.markerY}
                            r="17"
                            fill="#172332"
                          />
                          <text
                            x={markerX}
                            y={point.markerY + 4}
                            textAnchor="middle"
                            fontSize="11"
                            fill={point.color}
                            fontWeight="700"
                          >
                            {point.player.name.slice(0, 2).toUpperCase()}
                          </text>
                          {point.player.avatar && (
                            <image
                              href={point.player.avatar}
                              x={markerX - 16}
                              y={point.markerY - 16}
                              width="32"
                              height="32"
                              preserveAspectRatio="xMidYMid slice"
                              clipPath={"url(#" + clip + ")"}
                            />
                          )}
                          <circle
                            cx={markerX}
                            cy={point.markerY}
                            r="17"
                            fill="none"
                            stroke={point.color}
                            strokeWidth="2.5"
                          />
                        </>
                      ) : (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          fill={point.color}
                        />
                      )}
                    </g>
                  );
                }),
              )}
            </svg>
          </div>
          <details className="history-table">
            <summary>View exact standings by event</summary>
            {snapshots.map((s) => (
              <div key={s.id}>
                <h3>{s.label}</h3>
                {s.standings
                  .filter((r) => selected.includes(r.id))
                  .map((r) => (
                    <div className="order-row" key={r.id}>
                      <span>
                        <PlacementRank rank={r.rank} />{" "}
                        {state.participants.find((p) => p.id === r.id)?.name}
                      </span>
                      <b>{displayPoints(r.points)} pts</b>
                    </div>
                  ))}
              </div>
            ))}
          </details>
        </>
      ) : (
        <div className="empty-small">
          <History size={32} />
          <h3>Your story starts at the first finish.</h3>
          <p>Standings history appears after an event is finalized.</p>
        </div>
      )}
    </section>
  );
}
type ProfileFields = { team: string; nickname: string; sleeper: string };
export function ProfileForm({
  initial,
  onSubmit,
  button = "Save profile",
  disabled = false,
}: {
  initial?: ProfileFields;
  onSubmit: (value: ProfileFields) => Promise<void>;
  button?: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await onSubmit({
            team: String(f.get("team")),
            nickname: initial?.nickname ?? "",
            sleeper: initial?.sleeper ?? "",
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Team name{" "}
        <input
          name="team"
          maxLength={40}
          required
          placeholder="Make a name for yourself"
          defaultValue={initial?.team}
        />
      </label>
      <ErrorMessage message={error} />
      <button className="button primary" disabled={disabled || busy}>
        {busy ? "Saving…" : button}
        <ArrowUpRight size={16} />
      </button>
    </form>
  );
}
function Registration({
  state,
  refresh,
}: {
  state: PublicState;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [privateLink, setPrivateLink] = useState("");
  if (privateLink)
    return (
      <section className="registration panel">
        <Check size={40} className="gold" />
        <PageHeading
          label="YOU’RE IN"
          title="Welcome to the field."
          detail="Save this private link. It is the key to editing your profile and uploading your photo."
        />
        <div className="private-link">
          <input
            readOnly
            value={privateLink}
            aria-label="Private profile management link"
            onFocus={(e) => e.target.select()}
          />
          <button
            className="button secondary"
            onClick={() => void navigator.clipboard.writeText(privateLink)}
          >
            Copy link
          </button>
        </div>
        <a href={privateLink} className="button primary">
          Add your photo & manage profile <ArrowUpRight size={16} />
        </a>
        <p className="muted">
          Keep this link private. Your device will highlight your leaderboard
          row automatically.
        </p>
      </section>
    );
  return (
    <>
      <PageHeading
        label="THE REGISTRATION LOBBY"
        title={
          state.participants.length === 7
            ? "The field is set."
            : "Claim your spot."
        }
        detail="Pick your real name. Rep your team. Seven competitors, one identity each."
      />
      <div className="registration-grid">
        <section className="panel registration">
          <div className="section-heading">
            <h2>
              <Users size={20} /> Who’s playing?
            </h2>
            <span className="muted">{state.participants.length}/7 claimed</span>
          </div>
          <div className="identity-grid">
            {NAMES.map((n) => {
              const p = state.participants.find((p) => p.name === n);
              return (
                <button
                  key={n}
                  aria-pressed={name === n}
                  className={`identity ${name === n ? "chosen" : ""} ${p ? "claimed" : ""}`}
                  disabled={!!p || !state.configured}
                  onClick={() => setName(n)}
                >
                  <Avatar player={p ?? { name: n }} />
                  <b>{n}</b>
                  <small>
                    {p ? (
                      <>
                        <Check size={11} /> Claimed
                      </>
                    ) : name === n ? (
                      "Selected"
                    ) : (
                      "Available"
                    )}
                  </small>
                </button>
              );
            })}
          </div>
          {state.participants.length < 7 && (
            <>
              <h3 className="form-title">
                {name
                  ? `${name}, make it official.`
                  : "Choose your identity to continue."}
              </h3>
              <ProfileForm
                disabled={!name || !state.configured}
                button="Join the tournament"
                onSubmit={async (profile) => {
                  const value = await request("/api/action", {
                    action: { type: "register", name, profile },
                  });
                  setPrivateLink(value.privateLink);
                  await refresh();
                }}
              />
            </>
          )}
          {state.participants.length === 7 && (
            <p>
              Registration is closed. Everyone can follow the standings without
              an account.
            </p>
          )}
        </section>
        <aside className="panel rules-block">
          <div className="eyebrow">YOUR ROAD TO FIRST PICK</div>
          <h2>
            A place in the league.
            <br />A point to prove.
          </h2>
          <p>
            Select your own real identity only. Registration is first come,
            first served.
          </p>
          <p>
            Your custom team name leads the leaderboard. Your private management
            link lets you update your profile and photo.
          </p>
          <p>
            Claimed incorrectly? Ask the commissioner to reopen your identity.
          </p>
          <div className="inline-note">
            Spectating? You’re already in. No account needed.
          </div>
        </aside>
      </div>
    </>
  );
}
function Manage({
  token,
  refresh,
  environment,
}: {
  token: string;
  refresh: () => Promise<void>;
  environment: "production" | "practice";
}) {
  const [p, setP] = useState<Player | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  useEffect(() => {
    request("/api/profile", { token, environment })
      .then((r) => setP(r.participant))
      .catch((e) => setError(e.message));
  }, [token, environment]);
  return (
    <section className="panel registration">
      <PageHeading
        label="PRIVATE PROFILE MANAGEMENT"
        title={p ? `${p.name}, this is your corner.` : "Your profile."}
      />
      <ErrorMessage message={error} />
      {p && (
        <>
          <Avatar player={p} />
          <ProfileForm
            initial={p}
            onSubmit={async (profile) => {
              await request("/api/action", {
                action: { type: "profile", participantId: p.id, profile },
                profileToken: token,
                environment,
              });
              setSaved("Profile saved.");
              await refresh();
            }}
          />
          <label className="photo-label">
            Profile photo · JPG, PNG or WebP, up to 2 MB
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                const form = new FormData();
                form.set("file", file);
                form.set("participantId", p.id);
                form.set("token", token);
                form.set("environment", environment);
                try {
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    body: form,
                  });
                  const v = await res.json();
                  if (!res.ok) throw Error(v.error);
                  const result = await request("/api/profile", {
                    token,
                    environment,
                  });
                  setP(result.participant);
                  setSaved("Photo saved.");
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Upload failed.");
                }
              }}
            />
          </label>
          <p role="status" className="success">
            {saved}
          </p>
          <p className="muted">
            Keep this URL private. The commissioner can revoke and regenerate
            it.
          </p>
        </>
      )}
    </section>
  );
}
