"use client";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  GripVertical,
  Lock,
  Play,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import type { PublicState, Event, Audit } from "@/lib/model";
import { NAMES } from "@/lib/model";
import { placements } from "@/lib/scoring";
import { FantasyAdmin } from "./fantasy-admin";
import {
  Avatar,
  Bracket,
  ErrorMessage,
  PageHeading,
  ProfileForm,
  request,
} from "./tournament-app";
export function Admin({
  state,
  refresh,
  env,
}: {
  state: PublicState;
  refresh: () => Promise<void>;
  env: "production" | "practice";
}) {
  const [admin, setAdmin] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("events"),
    [selected, setSelected] = useState(""),
    [audit, setAudit] = useState<Audit[]>([]),
    [backups, setBackups] = useState<{ id: string; created_at: string }[]>([]),
    [privateLink, setPrivateLink] = useState(""),
    [addName, setAddName] = useState("");
  useEffect(() => {
    request("/api/auth")
      .then((r) => setAdmin(r.admin))
      .finally(() => setChecking(false));
  }, []);
  const act = async (action: unknown) => {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await request("/api/action", { environment: env, action });
      if (result.privateLink) setPrivateLink(result.privateLink);
      await refresh();
      setMessage("Saved.");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const administrative = async (body: Record<string, unknown>) => {
    setError("");
    setBusy(true);
    try {
      const r = await request("/api/admin", { environment: env, ...body });
      await refresh();
      setMessage(
        r.skipped
          ? "The shared worker is already refreshing."
          : "Operation completed.",
      );
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const run = (fn: () => Promise<unknown>) => {
    void fn().catch(() => {});
  };
  const confirm = async (
    text: string,
    word: string,
    fn: () => Promise<unknown>,
  ) => {
    if (window.prompt(`${text}\n\nType ${word} to confirm.`) === word)
      await fn();
  };
  useEffect(() => {
    if (admin && tab === "audit")
      request(`/api/admin?env=${env}&mode=audit`)
        .then(setAudit)
        .catch((e) => setError(e.message));
    if (admin && tab === "recovery")
      request(`/api/admin?env=${env}&mode=backups`)
        .then(setBackups)
        .catch((e) => setError(e.message));
  }, [admin, tab, env, state.revision]);
  if (state.readOnly)
    return (
      <section className="panel admin-content">
        <PageHeading
          label="PUBLIC PREVIEW"
          title="Run the tournament locally."
          detail="This hosted copy is read-only. Open the site on your computer to add competitors, enter scores, and manage events. No accounts or participant links are needed."
        />
        <p>
          Local tournament data stays on your computer and is not synchronized
          to this preview.
        </p>
      </section>
    );
  if (checking)
    return <p className="loading">Checking administrator session…</p>;
  if (!admin)
    return (
      <section className="panel login-panel">
        <div className="login-icon">
          <Shield size={28} />
        </div>
        <PageHeading
          label="COMMISSIONER ACCESS"
          title="Run the tournament."
          detail="Secure administration for the Football Enjoyers league."
        />
        {!state.configured && (
          <div className="inline-note">
            Setup required: apply the Supabase migration, configure server
            environment variables, and generate ADMIN_PASSWORD_HASH. See
            README.md in the delivered source.
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/api/auth", {
                password: String(new FormData(e.currentTarget).get("password")),
              });
              setAdmin(true);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Login failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Administrator password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <ErrorMessage message={error} />
          <button
            className="button primary"
            disabled={busy || !state.configured}
          >
            <Lock size={15} />
            {busy ? "Signing in…" : "Sign in securely"}
          </button>
        </form>
        <p className="fine-print">
          12-hour server session · Password never stored in the browser
        </p>
      </section>
    );
  const event = state.events.find((e) => e.id === selected && !e.deleted);
  return (
    <>
      <div className="admin-heading">
        <PageHeading
          label="COMMISSIONER CONTROL ROOM"
          title="Make every result count."
        />
        {!state.localMode && (
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                await request("/api/auth", {}, "DELETE");
                setAdmin(false);
              })
            }
          >
            Log out
          </button>
        )}
      </div>
      <div className="admin-env">
        <Shield size={18} />
        <b>{env === "practice" ? "PRACTICE SANDBOX" : "OFFICIAL TOURNAMENT"}</b>
        <span>Changes save to {env} only.</span>
        {state.localMode && (
          <span>Saved on this computer · No login required</span>
        )}
        <a
          className="button secondary"
          href={env === "practice" ? "/admin" : "/admin?env=practice"}
        >
          {env === "practice"
            ? "Open official tournament"
            : "Open practice sandbox"}
        </a>
      </div>
      <div className="admin-tabs">
        {["events", "players", "settings", "fantasy", "recovery", "audit"].map(
          (t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      <ErrorMessage message={error} />
      {message && (
        <p className="success" role="status">
          <Check size={14} />
          {message}
        </p>
      )}
      {privateLink && (
        <div className="panel private-link">
          <div>
            <b>Private management link — copy and share privately</b>
            <input
              aria-label="Recovered private profile link"
              value={privateLink}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </div>
          <button
            className="button secondary"
            onClick={() => void navigator.clipboard.writeText(privateLink)}
          >
            Copy
          </button>
          <button
            className="button secondary"
            onClick={() => setPrivateLink("")}
          >
            Dismiss
          </button>
        </div>
      )}
      {tab === "events" && (
        <>
          {env === "practice" && !state.participants.length && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run(() => act({ type: "populate", confirm: "PRACTICE ONLY" }))
              }
            >
              Populate seven sample competitors
            </button>
          )}
          <div className="admin-event-select">
            {state.events
              .filter((e) => !e.deleted)
              .map((e, i) => (
                <button
                  className={selected === e.id ? "selected" : ""}
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <b>{e.name}</b>
                  <small>
                    {e.status} · {e.weight}×
                  </small>
                </button>
              ))}
          </div>
          {event ? (
            <EventEditor
              key={event.id}
              event={event}
              state={state}
              act={act}
              busy={busy}
            />
          ) : (
            <div className="panel empty-small">
              <Play size={30} />
              <h3>Select an event to run it.</h3>
              <p>
                Start each physical event individually. No global tournament
                start is required.
              </p>
            </div>
          )}
        </>
      )}
      {tab === "players" && (
        <section className="panel admin-content">
          <h2>
            {state.localMode
              ? "Competitors & profiles"
              : "Registrations & profiles"}
          </h2>
          {state.localMode && state.participants.length < 7 && (
            <div className="admin-add-player">
              <p>
                Add each of the seven competitors here. You manage their
                profiles and scores; nobody needs to sign up.
              </p>
              <label>
                Competitor name
                <select
                  aria-label="Competitor name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                >
                  <option value="">Choose a competitor</option>
                  {NAMES.filter(
                    (name) => !state.participants.some((p) => p.name === name),
                  ).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <ProfileForm
                key={addName}
                disabled={!addName || busy}
                button="Add competitor"
                onSubmit={async (profile) => {
                  await act({ type: "register", name: addName, profile });
                  setAddName("");
                }}
              />
            </div>
          )}
          {state.participants.map((p) => (
            <details key={p.id}>
              <summary>
                <Avatar player={p} small />
                {p.name}
                {p.team.trim().toLowerCase() !== p.name.toLowerCase()
                  ? ` · ${p.team}`
                  : ""}
              </summary>
              <ProfileForm
                initial={p}
                onSubmit={async (profile) => {
                  await act({ type: "profile", participantId: p.id, profile });
                }}
              />
              <label>
                Profile photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    run(async () => {
                      const form = new FormData();
                      form.set("file", file);
                      form.set("participantId", p.id);
                      form.set("environment", env);
                      const res = await fetch("/api/upload", {
                        method: "POST",
                        body: form,
                      });
                      const v = await res.json();
                      if (!res.ok) {
                        setError(v.error);
                        return;
                      }
                      await refresh();
                    });
                  }}
                />
              </label>
              <div className="button-row">
                {!state.localMode && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        confirm(
                          "Revoke the current private profile link and device association?",
                          "REGENERATE",
                          () =>
                            act({ type: "regenerate", participantId: p.id }),
                        ),
                      )
                    }
                  >
                    Regenerate private link
                  </button>
                )}
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      confirm(
                        "Remove this registration and its results? Mario Kart brackets will be cleared. The identity will reopen.",
                        "REMOVE",
                        () =>
                          act({
                            type: "remove",
                            participantId: p.id,
                            confirm: "REMOVE",
                          }),
                      ),
                    )
                  }
                >
                  <Trash2 size={15} /> Remove registration
                </button>
              </div>
            </details>
          ))}
          {!state.participants.length && (
            <p>
              {state.localMode
                ? "No competitors added yet."
                : "No registrations yet."}
            </p>
          )}
        </section>
      )}
      {tab === "settings" && (
        <div className="settings-grid">
          <section className="panel admin-content">
            <h2>Homepage layout</h2>
            <p>Visitors can override this default on their own devices.</p>
            <select
              aria-label="Default homepage layout"
              value={state.config.layout}
              onChange={(e) =>
                run(() => act({ type: "layout", layout: e.target.value }))
              }
            >
              <option value="standings">Standings first</option>
              <option value="events">Event first</option>
            </select>
            <h2>Event schedule</h2>
            {state.events
              .filter((e) => !e.deleted)
              .map((e, i, events) => (
                <div className="schedule-edit" key={e.id}>
                  <span>{i + 1}</span>
                  <b>{e.name}</b>
                  <button
                    className="icon-button"
                    aria-label={`Move ${e.name} up`}
                    disabled={busy || i === 0 || e.kind === "fantasy"}
                    onClick={() =>
                      run(() => {
                        const order = events.map((e) => e.id);
                        [order[i - 1], order[i]] = [order[i], order[i - 1]];
                        return act({ type: "reorder", order });
                      })
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${e.name} down`}
                    disabled={busy || i >= events.length - 2}
                    onClick={() =>
                      run(() => {
                        const order = events.map((e) => e.id);
                        [order[i], order[i + 1]] = [order[i + 1], order[i]];
                        return act({ type: "reorder", order });
                      })
                    }
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Delete ${e.name}`}
                    disabled={busy || e.kind === "fantasy"}
                    onClick={() =>
                      run(() =>
                        confirm(
                          "Archive this event and remove its points from standings? Results remain in audit history.",
                          "DELETE",
                          () =>
                            act({
                              type: "deleteEvent",
                              eventId: e.id,
                              confirm: "DELETE",
                            }),
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </section>
          <section className="panel admin-content">
            <h2>Add a custom event</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  act({
                    type: "addEvent",
                    name: f.get("name"),
                    kind: f.get("kind"),
                    weight: f.get("weight"),
                  }),
                );
              }}
            >
              <label>
                Name
                <input name="name" required maxLength={80} />
              </label>
              <label>
                Result type
                <select name="kind">
                  <option value="time">Time (lowest wins)</option>
                  <option value="distance">Distance (lowest wins)</option>
                  <option value="count">Count (highest wins)</option>
                </select>
              </label>
              <label>
                Weight
                <input
                  name="weight"
                  defaultValue="1"
                  inputMode="decimal"
                  required
                />
              </label>
              <button className="button primary" disabled={busy}>
                Add event
              </button>
            </form>
            <h2>Final offline ordering</h2>
            <p>
              After completion, order competitors within shared ranks. Scores
              and actual ranks remain unchanged.
            </p>
            <OrderPicker
              ids={state.standings.map((r) => r.id)}
              players={state.participants}
              onConfirm={(order) => act({ type: "draftOrder", order })}
              button="Record offline order"
              disabled={busy || state.phase !== "Complete"}
            />
          </section>
        </div>
      )}
      {tab === "fantasy" && (
        <FantasyAdmin state={state} env={env} act={act} refresh={refresh} />
      )}
      {tab === "recovery" && (
        <section className="panel admin-content">
          <h2>Exports, backups & recovery</h2>
          <p>
            {state.localMode ? (
              "Download JSON backups to keep a separate copy of your tournament. Scores and profiles are stored in data/tournament.sqlite on this computer. Profile photos are stored alongside it in data/avatars. Keep a copy of the whole data folder when moving to another computer."
            ) : (
              <>
                Exports omit authentication secrets and private management
                tokens. Restored profiles retain current credentials where
                identities match; otherwise regenerate their private links.
              </>
            )}
          </p>
          <div className="button-row">
            <a
              className="button secondary"
              href={`/api/admin?env=${env}&mode=json`}
            >
              <Download size={15} /> JSON backup
            </a>
            <a
              className="button secondary"
              href={`/api/admin?env=${env}&mode=csv`}
            >
              <Download size={15} /> CSV export
            </a>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => run(() => administrative({ type: "backup" }))}
            >
              <Save size={15} /> Save recovery point
            </button>
          </div>
          <h3>Stored recovery points</h3>
          {backups.map((b) => (
            <div className="order-row" key={b.id}>
              <span>{new Date(b.created_at).toLocaleString()}</span>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    confirm(
                      "Replace tournament state with this backup? A backup of the current state will be saved first.",
                      "RESTORE BACKUP",
                      () =>
                        administrative({
                          type: "restore",
                          confirm: "RESTORE BACKUP",
                          backupId: b.id,
                        }),
                    ),
                  )
                }
              >
                Restore
              </button>
            </div>
          ))}
          {!backups.length && (
            <p className="muted">No stored recovery points yet.</p>
          )}
          <h3>Restore a downloaded JSON backup</h3>
          <input
            aria-label="Choose JSON backup"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              run(async () => {
                if (f.size > 10 * 1024 * 1024)
                  throw Error("Backup exceeds 10 MB.");
                const value = JSON.parse(await f.text());
                await confirm(
                  "Validate and restore this backup? A recovery point will be saved first.",
                  "RESTORE BACKUP",
                  () =>
                    administrative({
                      type: "restore",
                      confirm: "RESTORE BACKUP",
                      backup: value,
                    }),
                );
              });
            }}
          />
          <div className="danger-zone">
            <h3>Reset {env} results</h3>
            <p>
              Preserves registrations, profiles and event configurations. Clears
              results, orders, bracket and scoring history. Creates a recovery
              point before clearing anything.
            </p>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                run(() =>
                  confirm(
                    `Reset all ${env} competition results?`,
                    "RESET RESULTS",
                    () => act({ type: "reset", confirm: "RESET RESULTS" }),
                  ),
                )
              }
            >
              Reset competition results
            </button>
          </div>
        </section>
      )}
      {tab === "audit" && (
        <section className="panel admin-content">
          <h2>Administrative audit history</h2>
          <p className="muted">
            Append-only history. Private credentials are excluded.
          </p>
          {audit.map((a) => (
            <details key={a.id}>
              <summary>
                <span>
                  {a.action} · {a.reference}
                </span>
                <small>{new Date(a.at).toLocaleString()}</small>
              </summary>
              <h4>Previous value</h4>
              <pre>{JSON.stringify(a.old, null, 2)}</pre>
              <h4>New value / action</h4>
              <pre>{JSON.stringify(a.value, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
export function OrderPicker({
  ids,
  players,
  onConfirm,
  button,
  disabled = false,
}: {
  ids: string[];
  players: PublicState["participants"];
  onConfirm: (order: string[]) => Promise<unknown>;
  button: string;
  disabled?: boolean;
}) {
  const [order, setOrder] = useState(ids),
    [dragged, setDragged] = useState<string | null>(null),
    [error, setError] = useState("");
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };
  return (
    <div className="order-picker">
      {order.map((id, i) => (
        <div
          className="order-item"
          key={id}
          draggable={!disabled}
          onDragStart={() => setDragged(id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragged) move(order.indexOf(dragged), i);
            setDragged(null);
          }}
        >
          <GripVertical size={15} />
          <b>{i + 1}</b>
          <span>{players.find((p) => p.id === id)?.name}</span>
          <button
            type="button"
            aria-label={`Move ${players.find((p) => p.id === id)?.name} up`}
            className="icon-button"
            disabled={disabled || i === 0}
            onClick={() => move(i, i - 1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            aria-label={`Move ${players.find((p) => p.id === id)?.name} down`}
            className="icon-button"
            disabled={disabled || i === order.length - 1}
            onClick={() => move(i, i + 1)}
          >
            <ArrowDown size={15} />
          </button>
        </div>
      ))}
      <ErrorMessage message={error} />
      <button
        className="button primary"
        disabled={disabled}
        onClick={() => {
          setError("");
          void onConfirm(order).catch((e) => setError(e.message));
        }}
      >
        {button}
      </button>
    </div>
  );
}
function EventEditor({
  event: e,
  state,
  act,
  busy,
}: {
  event: Event;
  state: PublicState;
  act: (a: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const [error, setError] = useState(""),
    [configurationSaved, setConfigurationSaved] = useState(false),
    [saving, setSaving] = useState<string[]>([]);
  const run = (fn: () => Promise<unknown>) => {
    setError("");
    void fn().catch((e) => setError(e.message));
  };
  const confirm = (word: string, text: string, fn: () => Promise<unknown>) => {
    if (window.confirm(text)) run(fn);
  };
  const sortedIds = [...e.order].sort(
    (a, b) =>
      Number(e.results.find((r) => r.participantId === a)?.absent ?? false) -
      Number(e.results.find((r) => r.participantId === b)?.absent ?? false),
  );
  const score = placements(e);
  const resultComplete =
    state.participants.length === 7 &&
    state.participants.every((p) =>
      e.results.some(
        (r) => r.participantId === p.id && (r.absent || r.value !== null),
      ),
    );
  const saveResult = (id: string, value: string) => {
    setSaving((prev) => [...prev, id]);
    run(async () => {
      try {
        await act({
          type: "result",
          eventId: e.id,
          participantId: id,
          value: value === "" ? null : value,
          absent: false,
        });
      } finally {
        setSaving((prev) => prev.filter((x) => x !== id));
      }
    });
  };
  return (
    <section className="panel admin-content">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            {e.status.toUpperCase()} · {e.weight}× WEIGHT
          </div>
          <h2>{e.name}</h2>
        </div>
        {e.status === "finalized" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              confirm("REOPEN", "Reopen this event? This is audited.", () =>
                act({ type: "reopen", eventId: e.id, confirm: "REOPEN" }),
              )
            }
          >
            Reopen event
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {e.status === "scheduled" && e.kind !== "fantasy" && (
        <>
          <p>
            Set the first event’s order using existing fantasy league standings.
            Later events follow current tournament ranks. Order any shared ranks
            explicitly. This order freezes when the event starts.
          </p>
          <OrderPicker
            ids={state.standings.map((r) => r.id)}
            players={state.participants}
            button="Start event & freeze order"
            disabled={busy || state.participants.length !== 7}
            onConfirm={(order) => act({ type: "start", eventId: e.id, order })}
          />
        </>
      )}
      {e.kind === "fantasy" && (
        <p className="inline-note">
          Enter Sunday-only scores manually or upload a screenshot in the
          Fantasy tab. Saving all seven scores starts provisional fantasy
          scoring. Finalize after verifying all eligible games have ended.
        </p>
      )}
      {e.kind !== "kart" &&
        e.kind !== "fantasy" &&
        e.status !== "scheduled" && (
          <>
            <p className="inline-note">
              Enter{" "}
              {e.kind === "time"
                ? "seconds to the nearest 0.01"
                : e.kind === "count"
                  ? "whole-number counts"
                  : `distance in ${e.unit}`}
              . Results save on leaving the field.{" "}
              {e.status === "finalized"
                ? "Corrections recalculate official standings immediately."
                : "Points remain provisional until finalization."}
            </p>
            <div className="score-entry-list">
              {sortedIds.map((id) => {
                const p = state.participants.find((p) => p.id === id);
                if (!p) return null;
                const r = e.results.find((r) => r.participantId === id),
                  place = score.find((r) => r.id === id);
                return (
                  <div className="score-entry" key={id}>
                    <span className="entry-order">
                      {e.order.indexOf(id) + 1}
                    </span>
                    <Avatar player={p} small />
                    <span className="entry-person">
                      <b>{p.name}</b>
                      {p.team.trim().toLowerCase() !== p.name.toLowerCase() && (
                        <small>{p.team}</small>
                      )}
                    </span>
                    <label className="raw-input">
                      <span className="sr-only">{p.name} result</span>
                      <input
                        key={`${id}-${r?.value ?? ""}`}
                        aria-label={`${p.name} result`}
                        inputMode={e.kind === "count" ? "numeric" : "decimal"}
                        placeholder="—"
                        defaultValue={r?.value ?? ""}
                        disabled={saving.includes(id)}
                        onBlur={(ev) => {
                          if (ev.target.value !== (r?.value ?? ""))
                            saveResult(id, ev.target.value);
                        }}
                      />
                      <small>
                        {saving.includes(id)
                          ? "Saving…"
                          : place
                            ? `#${place.place ?? "—"} · ${place.points} pts`
                            : e.unit}
                      </small>
                    </label>
                  </div>
                );
              })}
            </div>
          </>
        )}
      {e.kind === "kart" && e.status !== "scheduled" && (
        <>
          <h3>Time-trial seeding</h3>
          <p className="muted">
            Enter seconds. Changing a time clears the bracket; downstream
            winners are reset when earlier races change.
          </p>
          <div className="trials-grid">
            {e.order.map((id) => (
              <label key={id}>
                {state.participants.find((p) => p.id === id)?.name}
                <input
                  aria-label={`${state.participants.find((p) => p.id === id)?.name} time trial`}
                  key={`${id}-${e.trials[id] ?? ""}`}
                  inputMode="decimal"
                  defaultValue={e.trials[id] ?? ""}
                  onBlur={(ev) => {
                    if (ev.target.value && ev.target.value !== e.trials[id])
                      run(() =>
                        act({
                          type: "trial",
                          eventId: e.id,
                          participantId: id,
                          value: ev.target.value,
                        }),
                      );
                  }}
                />
              </label>
            ))}
          </div>
          {e.order.every(
            (id) =>
              e.trials[id] ||
              e.results.some((r) => r.participantId === id && r.absent),
          ) && (
            <details>
              <summary>Confirm seeds (resolve tied times explicitly)</summary>
              <OrderPicker
                key={JSON.stringify(e.trials)}
                ids={[...e.order].sort(
                  (a, b) =>
                    Number(
                      e.results.some((r) => r.participantId === a && r.absent),
                    ) -
                      Number(
                        e.results.some(
                          (r) => r.participantId === b && r.absent,
                        ),
                      ) || Number(e.trials[a] ?? 0) - Number(e.trials[b] ?? 0),
                )}
                players={state.participants}
                button="Confirm seeds & create bracket"
                disabled={busy}
                onConfirm={(order) =>
                  act({ type: "seed", eventId: e.id, order })
                }
              />
            </details>
          )}
          <Bracket
            event={e}
            players={state.participants}
            onWinner={(matchId, winner) => {
              if (
                e.status !== "finalized" ||
                window.confirm(
                  "Correct this finalized race result? This may clear downstream races and reopen the event.",
                )
              )
                run(() =>
                  act({ type: "winner", eventId: e.id, matchId, winner }),
                );
            }}
          />
        </>
      )}
      {e.status === "active" && e.kind !== "fantasy" && (
        <button
          className="button primary finalize-button"
          disabled={!resultComplete || busy || saving.length > 0}
          onClick={() =>
            confirm(
              "FINALIZE",
              "Finalize this event? These points will count toward official standings.",
              () =>
                act({ type: "finalize", eventId: e.id, confirm: "FINALIZE" }),
            )
          }
        >
          <Check size={17} />
          Finalize event ({e.results.length}/7 recorded)
        </button>
      )}
      <details>
        <summary>Edit event rules & configuration</summary>
        {e.status !== "scheduled" && e.kind !== "fantasy" && (
          <details>
            <summary>Correct the recorded participation order</summary>
            <p className="inline-note">
              The original start-order snapshot remains preserved. This
              correction and its reason are audited.
            </p>
            <OrderPicker
              key={e.order.join(",")}
              ids={e.order}
              players={state.participants}
              button="Record order correction"
              disabled={busy}
              onConfirm={async (order) => {
                const reason = window.prompt(
                  "Explain why the recorded order needs correcting (10+ characters):",
                );
                if (!reason) throw Error("A reason is required.");
                return act({
                  type: "correctOrder",
                  eventId: e.id,
                  order,
                  reason,
                });
              }}
            />
          </details>
        )}
        <form
          key={`${e.id}-config`}
          onChange={() => setConfigurationSaved(false)}
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            run(async () => {
              setConfigurationSaved(false);
              await act({
                type: "event",
                eventId: e.id,
                name: f.get("name"),
                weight: f.get("weight"),
                unit: f.get("unit"),
                direction: f.get("direction"),
                description: f.get("description"),
                rules: String(f.get("rules")).split("\n").filter(Boolean),
              });
              setConfigurationSaved(true);
            });
          }}
        >
          <div className="form-columns">
            <label>
              Event name
              <input
                name="name"
                defaultValue={e.name}
                required
                maxLength={80}
              />
            </label>
            <label>
              Weight
              <input
                name="weight"
                defaultValue={e.weight}
                inputMode="decimal"
                required
              />
            </label>
            <label>
              Unit
              <input
                name="unit"
                defaultValue={e.unit}
                maxLength={20}
                required
              />
            </label>
            <label>
              Ranking direction
              <select name="direction" defaultValue={e.direction}>
                <option value="asc">Lowest result wins</option>
                <option value="desc">Highest result wins</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={e.description}
              maxLength={500}
            />
          </label>
          <label>
            Rules · one paragraph per line
            <textarea
              name="rules"
              rows={8}
              defaultValue={e.rules.join("\n")}
              required
            />
          </label>
          <button className="button secondary" disabled={busy}>
            {busy ? "Saving…" : "Save event configuration"}
          </button>
          {configurationSaved && (
            <p className="success" role="status">
              <Check size={14} /> Event configuration saved.
            </p>
          )}
        </form>
      </details>
    </section>
  );
}
