"use client";
import "./fantasy-admin.css";
import { useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { Camera, Check, Upload, X } from "lucide-react";
import type { PublicState } from "@/lib/model";
import { screenshotTeamNames } from "@/lib/fantasy-entry";
import { matchScreenshot, type MatchedScore, type Ocr } from "@/lib/screenshot";
import { ErrorMessage } from "./tournament-app";

export function FantasyAdmin({
  state,
  env,
  act,
  refresh,
}: {
  state: PublicState;
  env: "production" | "practice";
  act: (a: unknown) => Promise<unknown>;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [review, setReview] = useState<{
      token: string;
      teams: MatchedScore[];
      revision: number;
    } | null>(null);
  const [attested, setAttested] = useState(false),
    [ended, setEnded] = useState(false);
  const [manual, setManual] = useState<{
    revision: number;
    rows: Record<string, string>;
  } | null>(null);
  const workerRef = useRef<Worker | null>(null),
    job = useRef(0),
    operation = useRef(0);
  const event = state.events.find((e) => !e.deleted && e.kind === "fantasy");
  let names: Record<string, string> = {};
  let mapped = true;
  try {
    names = screenshotTeamNames(state);
  } catch {
    mapped = false;
  }
  const canScore =
    state.participants.length === 7 &&
    state.events
      .filter((e) => !e.deleted && e.kind !== "fantasy")
      .every((e) => e.status === "finalized") &&
    event?.status !== "finalized";
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      job.current++;
      operation.current++;
      void workerRef.current?.terminate();
    },
    [],
  );
  async function run(fn: () => Promise<void>) {
    const currentOperation = ++operation.current;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (currentOperation === operation.current)
        setError(
          e instanceof Error ? e.message : "Could not save fantasy scores.",
        );
    } finally {
      if (currentOperation === operation.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function readImage() {
    if (!file) return;
    const current = ++job.current;
    setReview(null);
    setAttested(false);
    setProgress("Loading the screenshot reader…");
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width,
      height = bitmap.height;
    if (
      width * height > 18000000 ||
      width < 200 ||
      height < 200 ||
      width > 6000 ||
      height > 12000
    ) {
      bitmap.close();
      throw Error(
        "Choose a screenshot at least 200 × 200 pixels and under 18 megapixels.",
      );
    }
    const canvas = document.createElement("canvas");
    const scale = width < 1500 && width * height <= 4500000 ? 2 : 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw Error("Screenshot reader is unavailable. Use manual entry.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0,
      samples = 0;
    for (let i = 0; i < pixels.data.length; i += 64) {
      total += (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
      samples++;
    }
    const invert = total / samples < 128;
    for (let i = 0; i < pixels.data.length; i += 4) {
      let gray =
        0.2126 * pixels.data[i] +
        0.7152 * pixels.data[i + 1] +
        0.0722 * pixels.data[i + 2];
      if (invert) gray = 255 - gray;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    if (current !== job.current) return;
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      logger: (status) => {
        if (current === job.current)
          setProgress(
            status.status === "recognizing text"
              ? `Reading scores… ${Math.round(status.progress * 100)}%`
              : "Loading the screenshot reader…",
          );
      },
    });
    if (current !== job.current) {
      await worker.terminate();
      return;
    }
    workerRef.current = worker;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const { data } = await worker.recognize(
        canvas,
        {},
        { blocks: true, text: true },
      );
      if (current !== job.current) return;
      const words = (data.blocks ?? [])
        .flatMap((b) =>
          b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
        )
        .filter((w) => w.text.trim())
        .map((w) => ({
          text: w.text.trim(),
          confidence: w.confidence,
          bbox: {
            x0: Math.floor(w.bbox.x0 / scale),
            y0: Math.floor(w.bbox.y0 / scale),
            x1: Math.ceil(w.bbox.x1 / scale),
            y1: Math.ceil(w.bbox.y1 / scale),
          },
        }));
      const ocr: Ocr = { width, height, words };
      matchScreenshot(ocr, names);
      const form = new FormData();
      form.set("file", file);
      form.set("environment", env);
      form.set("ocr", JSON.stringify(ocr));
      const res = await fetch("/api/fantasy/screenshot", {
        method: "POST",
        body: form,
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error ?? "Screenshot rejected.");
      if (current === job.current) setReview(result);
    } finally {
      await worker.terminate();
      workerRef.current = null;
    }
  }
  const values =
    manual?.rows ??
    Object.fromEntries(
      state.participants.map((p) => [
        p.id,
        event?.results.find((r) => r.participantId === p.id)?.value ?? "",
      ]),
    );
  return (
    <section className="panel admin-content fantasy-entry">
      <h2>ESPN fantasy scores</h2>
      <p>
        Enter Sunday-only ESPN fantasy totals manually, or read a screenshot
        showing all seven teams. The site calculates placements and weighted
        tournament points.
      </p>
      <div className="inline-note">
        Include the TEAM and TOTAL PTS column headers and all seven team rows.
        The reader uses Total Pts and ignores Rank, Score and Budget. Use each
        competitor’s full name as the ESPN team name. The administrator must
        still verify that Thursday and Monday points are excluded.
      </div>
      <ErrorMessage message={error} />
      {message && (
        <p className="success" role="status">
          <Check size={14} />
          {message}
        </p>
      )}
      <div className="inline-note">
        ESPN teams must be named exactly Mark, Hong, Li, Arun, Erfan, Dabin, and
        Alex. Each name matches its competitor automatically; no team-name setup
        is needed.
      </div>
      {event?.status === "finalized" ? (
        <div className="inline-note">
          ESPN fantasy scores are finalized. Reopen the event to make a
          correction.
        </div>
      ) : (
        !canScore && (
          <p className="inline-note">
            Add all seven competitors and finalize every physical event before
            saving fantasy scores. Screenshot reading can be prepared
            beforehand.
          </p>
        )
      )}
      <div className="fantasy-input-columns">
        <div>
          <h3>
            <Camera size={18} /> 1. Read an ESPN screenshot
          </h3>
          <p className="muted">
            PNG, JPG or WebP, up to 3 MB. All seven team names and scores are
            required. Reading runs on your device; no AI API key is needed.
          </p>
          <label className="screenshot-upload">
            Choose screenshot
            <input
              aria-label="Choose ESPN scoreboard screenshot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!mapped || busy}
              onChange={(e) => {
                setError("");
                setReview(null);
                setAttested(false);
                const f = e.target.files?.[0] ?? null;
                if (
                  f &&
                  (f.size > 3 * 1024 * 1024 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(f.type))
                ) {
                  setFile(null);
                  setError("Choose a PNG, JPG or WebP screenshot under 3 MB.");
                  return;
                }
                setFile(f);
              }}
            />
          </label>
          {preview && (
            <img
              className="screenshot-preview"
              src={preview}
              alt="Screenshot selected for score reading"
            />
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!file || !mapped || busy}
              onClick={() => void run(readImage)}
            >
              <Upload size={15} />
              Read ESPN screenshot
            </button>
            {busy && progress && (
              <button
                className="button secondary"
                onClick={() => {
                  job.current++;
                  operation.current++;
                  void workerRef.current?.terminate();
                  workerRef.current = null;
                  setBusy(false);
                  setProgress("");
                }}
              >
                <X size={15} />
                Cancel reading
              </button>
            )}
          </div>
          {progress && (
            <p className="muted" role="status">
              {progress}
            </p>
          )}
          {review && (
            <section className="screenshot-review">
              <h3>2. Review all seven scores</h3>
              <p className="muted">
                Detected score column: <b>Total Pts</b>. Rank, Score and Budget
                are ignored.
              </p>
              <p className="muted">
                Nothing has changed yet. Compare each recognized value with the
                image. If any value is wrong, discard this review and use manual
                entry.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Matched team</th>
                    <th>Current</th>
                    <th>Read score</th>
                  </tr>
                </thead>
                <tbody>
                  {review.teams.map((t) => (
                    <tr key={t.participantId}>
                      <td>
                        <b>{t.teamName}</b>
                        {t.matchedLabel && t.matchedLabel !== t.teamName && (
                          <small>Visible: {t.matchedLabel}</small>
                        )}
                        <small>
                          {
                            state.participants.find(
                              (p) => p.id === t.participantId,
                            )?.name
                          }
                        </small>
                      </td>
                      <td>
                        {event?.results.find(
                          (r) => r.participantId === t.participantId,
                        )?.value ?? "—"}
                      </td>
                      <td>
                        <b>{t.score}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="attestation">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                />
                I checked every score against the screenshot and confirm these
                are Sunday-only totals.
              </label>
              {review.revision !== state.revision && (
                <p className="error">
                  Tournament data changed. Read the screenshot again before
                  applying it.
                </p>
              )}
              <button
                className="button primary"
                disabled={
                  !attested ||
                  busy ||
                  !canScore ||
                  review.revision !== state.revision
                }
                onClick={() =>
                  void run(async () => {
                    const res = await fetch("/api/fantasy/screenshot", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        token: review.token,
                        environment: env,
                        sundayOnly: true,
                        confirm: "APPLY SCREENSHOT",
                      }),
                    });
                    const result = await res.json();
                    if (!res.ok) throw Error(result.error);
                    setReview(null);
                    setManual(null);
                    setAttested(false);
                    await refresh();
                    setMessage(
                      "All seven screenshot scores saved. Provisional standings have updated.",
                    );
                  })
                }
              >
                Apply seven scores to provisional standings
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Discard review
              </button>
            </section>
          )}
        </div>
        <div>
          <h3>Or enter scores manually</h3>
          <p className="muted">
            Enter raw fantasy points. Do not enter the weighted tournament
            points. Negative scores and tied scores are supported.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(async () => {
                await act({
                  type: "fantasyScores",
                  expectedRevision: manual?.revision ?? state.revision,
                  sundayOnly: form.get("sundayOnly") === "on",
                  rows: state.participants.map((p) => ({
                    participantId: p.id,
                    score: values[p.id] ?? "",
                  })),
                });
                setManual(null);
                setReview(null);
                setMessage(
                  "Manual fantasy scores saved. Provisional standings have updated.",
                );
              });
            }}
          >
            {state.participants.map((p) => (
              <label className="fantasy-manual-row" key={p.id}>
                <span>
                  <b>{p.name}</b>
                  {p.team.trim().toLowerCase() !== p.name.toLowerCase() && (
                    <small>{p.team}</small>
                  )}
                </span>
                <input
                  aria-label={`${p.name} fantasy score`}
                  inputMode="decimal"
                  value={values[p.id] ?? ""}
                  required
                  pattern="-?[0-9]{1,8}(\.[0-9]{1,4})?"
                  onChange={(e) =>
                    setManual({
                      revision: manual?.revision ?? state.revision,
                      rows: { ...values, [p.id]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <label className="attestation">
              <input name="sundayOnly" type="checkbox" required />I verified
              these totals include only eligible Sunday performances.
            </label>
            {manual && manual.revision !== state.revision && (
              <p className="error">
                New tournament data arrived while you were editing.{" "}
                <button type="button" onClick={() => setManual(null)}>
                  Reload current scores
                </button>
              </p>
            )}
            <button
              className="button primary"
              disabled={
                busy ||
                !canScore ||
                (!!manual && manual.revision !== state.revision)
              }
            >
              Save manual provisional scores
            </button>
          </form>
        </div>
      </div>
      <div className="fantasy-update-status">
        <b>{state.fantasy.status}</b>
        <span>
          Last admin update:{" "}
          {state.fantasy.entry?.updatedAt
            ? new Date(state.fantasy.entry.updatedAt).toLocaleString()
            : "No scores saved"}
        </span>
      </div>
      {event?.status === "active" && (
        <div className="danger-zone">
          <h3>Finalize the fantasy event</h3>
          <p>
            Keep updating provisional scores while games are in progress.
            Finalize only after checking all eligible Sunday games and all seven
            totals.
          </p>
          <label className="attestation">
            <input
              type="checkbox"
              checked={ended}
              onChange={(e) => setEnded(e.target.checked)}
            />
            I verified all eligible Sunday games have ended and all seven scores
            are final.
          </label>
          <button
            className="button primary"
            disabled={!ended || busy}
            onClick={() => {
              if (
                window.confirm(
                  "Finalize all seven fantasy scores? This determines the official standings.",
                )
              )
                void run(async () => {
                  await act({
                    type: "fantasyFinalize",
                    gamesEnded: true,
                    confirm: "FINALIZE SUNDAY SCORES",
                  });
                  setEnded(false);
                  setMessage("ESPN fantasy scores finalized.");
                });
            }}
          >
            Finalize Sunday scores
          </button>
        </div>
      )}
      {event?.status === "finalized" && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Reopen fantasy scoring for an audited correction?",
              )
            )
              void run(async () => {
                await act({
                  type: "reopen",
                  eventId: event.id,
                  confirm: "REOPEN",
                });
              });
          }}
        >
          Reopen fantasy event for correction
        </button>
      )}
    </section>
  );
}
