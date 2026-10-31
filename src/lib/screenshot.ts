import { z } from "zod";
import Decimal from "decimal.js";
import { normalizeTeam } from "./fantasy-entry";
export const ocrWord = z.object({
  text: z.string().min(1).max(200),
  confidence: z.number().min(0).max(100),
  bbox: z.object({
    x0: z.number().nonnegative(),
    y0: z.number().nonnegative(),
    x1: z.number().positive(),
    y1: z.number().positive(),
  }),
});
export const ocrSchema = z.object({
  width: z.number().int().min(200).max(6000),
  height: z.number().int().min(200).max(12000),
  words: z.array(ocrWord).min(1).max(4000),
});
export type Ocr = z.infer<typeof ocrSchema>;
type Word = z.infer<typeof ocrWord>;
export type MatchedScore = {
  participantId: string;
  teamName: string;
  matchedLabel?: string;
  score: string;
  confidence: number;
  column?: "Total Pts";
};
const cy = (w: Word) => (w.bbox.y0 + w.bbox.y1) / 2;
const cx = (w: Word) => (w.bbox.x0 + w.bbox.x1) / 2;
const height = (w: Word) => w.bbox.y1 - w.bbox.y0;
function linesOf(words: Word[]) {
  const lines: { words: Word[]; y: number; h: number }[] = [];
  for (const word of [...words].sort(
    (a, b) => cy(a) - cy(b) || a.bbox.x0 - b.bbox.x0,
  )) {
    const line = lines.find(
      (l) => Math.abs(l.y - cy(word)) <= Math.max(l.h, height(word)) * 0.45,
    );
    if (line) line.words.push(word);
    else lines.push({ words: [word], y: cy(word), h: height(word) });
  }
  return lines.map((l) => ({
    ...l,
    words: l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0),
  }));
}
const headerText = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
// Select the labeled Total Pts column. Rank, Score, Budget, owner sublines and ads
// are not fantasy totals. No fuzzy identity matching or partial imports.
export function matchScreenshot(
  input: Ocr,
  names: Record<string, string>,
  labels: Record<string, string> = {},
): MatchedScore[] {
  const data = ocrSchema.parse(input);
  const visible = Object.fromEntries(
    Object.entries(names).map(([id, name]) => [id, labels[id]?.trim() || name]),
  );
  if (
    Object.keys(names).length !== 7 ||
    new Set(Object.values(visible).map(normalizeTeam)).size !== 7
  )
    throw Error(
      "Save seven unique ESPN team names and screenshot labels first.",
    );
  if (
    data.words.some(
      (w) =>
        w.bbox.x1 <= w.bbox.x0 ||
        w.bbox.y1 <= w.bbox.y0 ||
        w.bbox.x1 > data.width ||
        w.bbox.y1 > data.height,
    )
  )
    throw Error("Screenshot text coordinates are invalid.");
  const headers: {
    words: Word[];
    total: Word[];
    team: Word;
    first: number;
    end: number;
  }[] = [];
  for (const line of linesOf(data.words)) {
    const team = line.words.find((w) => headerText(w.text) === "team");
    if (!team) continue;
    for (let i = 0; i < line.words.length; i++)
      for (let end = i + 1; end <= Math.min(line.words.length, i + 3); end++) {
        const span = line.words.slice(i, end);
        const text = headerText(span.map((w) => w.text).join(" "));
        if (
          ["totalpts", "totalpoints"].includes(text) &&
          span[0].bbox.x0 > team.bbox.x1
        )
          headers.push({ words: line.words, total: span, team, first: i, end });
      }
  }
  if (headers.length !== 1)
    throw Error(
      "Cannot identify one Total Pts column. Include the TEAM and TOTAL PTS headers in the ESPN screenshot.",
    );
  const header = headers[0],
    start = header.total[0].bbox.x0,
    end = header.total.at(-1)!.bbox.x1;
  if (
    Math.min(header.team.confidence, ...header.total.map((w) => w.confidence)) <
    75
  )
    throw Error(
      "The Team or Total Pts heading is unclear. Upload a sharper screenshot.",
    );
  const previous = header.words[header.first - 1],
    next = header.words[header.end];
  const left = previous
    ? (previous.bbox.x1 + start) / 2
    : start - data.width * 0.03;
  const right = next ? (end + next.bbox.x0) / 2 : end + data.width * 0.03;
  const teamRight =
    previous && previous !== header.team ? previous.bbox.x0 : start;
  const headerBottom = Math.max(
    ...header.total.map((w) => w.bbox.y1),
    header.team.bbox.y1,
  );
  const body = data.words.filter((w) => w.bbox.y0 > headerBottom);
  const teamLines = linesOf(
    body.filter(
      (w) =>
        cx(w) >= header.team.bbox.x0 - data.width * 0.02 && cx(w) < teamRight,
    ),
  );
  const anchors: {
    id: string;
    name: string;
    label: string;
    y: number;
    confidence: number;
  }[] = [];
  for (const line of teamLines) {
    const words = line.words;
    const matches: { id: string; label: string; start: number; end: number }[] =
      [];
    for (const [id, label] of Object.entries(visible))
      for (let i = 0; i < words.length; i++)
        for (let j = i + 1; j <= Math.min(words.length, i + 16); j++)
          if (
            normalizeTeam(
              words
                .slice(i, j)
                .map((w) => w.text)
                .join(" "),
            ) === normalizeTeam(label)
          )
            matches.push({ id, label, start: i, end: j });
    if (!matches.length) continue;
    if (matches.length !== 1)
      throw Error(
        "Duplicate or overlapping ESPN team matches. Configure distinct screenshot labels.",
      );
    const m = matches[0],
      nameWords = words.slice(m.start, m.end),
      nameHeight = Math.max(...nameWords.map(height));
    if (
      words.some(
        (w, i) =>
          (i < m.start || i >= m.end) &&
          /[\p{L}]/u.test(w.text) &&
          !(i < m.start && (height(w) > nameHeight * 1.6 || w.confidence < 50)),
      )
    )
      throw Error(
        `The row for “${names[m.id]}” contains extra name text. Team names must match exactly, or use an explicit shortened screenshot label.`,
      );
    if (anchors.some((a) => a.id === m.id))
      throw Error(
        `“${names[m.id]}” appears more than once. Duplicate matches are not accepted.`,
      );
    anchors.push({
      id: m.id,
      name: names[m.id],
      label: m.label,
      y: nameWords.reduce((n, w) => n + cy(w), 0) / nameWords.length,
      confidence: Math.min(...nameWords.map((w) => w.confidence)),
    });
  }
  const missing = Object.entries(names)
    .filter(([id]) => !anchors.some((a) => a.id === id))
    .map(([, name]) => name);
  if (missing.length)
    throw Error(
      `Screenshot rejected. All seven teams are required. Missing or unmatched: ${missing.join(", ")}.`,
    );
  anchors.sort((a, b) => a.y - b.y);
  const gap = (anchors.at(-1)!.y - anchors[0].y) / 6;
  if (gap <= 0)
    throw Error("Team rows cannot be separated reliably. Use manual entry.");
  const number = /^-?\d{1,8}(\.\d{1,4})?$/;
  return anchors.map((a, i) => {
    const top = i ? (anchors[i - 1].y + a.y) / 2 : headerBottom;
    const bottom = i < 6 ? (a.y + anchors[i + 1].y) / 2 : a.y + gap / 2;
    const candidates = body.filter(
      (w) => cx(w) > left && cx(w) < right && cy(w) > top && cy(w) < bottom,
    );
    // Any unrecognized mark in the target cell is ambiguous; never turn '--' into zero.
    if (candidates.length !== 1 || !number.test(candidates[0].text))
      throw Error(
        `Cannot read one unambiguous Total Pts value for “${a.name}”. Use a sharper screenshot or manual entry.`,
      );
    const score = candidates[0],
      confidence = Math.min(a.confidence, score.confidence);
    if (confidence < 75)
      throw Error(
        `Text is unclear for “${a.name}”. Upload a sharper image or enter the scores manually.`,
      );
    return {
      participantId: a.id,
      teamName: a.name,
      matchedLabel: a.label,
      score: new Decimal(score.text).toString(),
      confidence: Math.round(confidence),
      column: "Total Pts" as const,
    };
  });
}
