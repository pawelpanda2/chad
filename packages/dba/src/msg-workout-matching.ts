/**
 * Msg workout ↔ Beeper message matching engine (Story 99).
 *
 * Pure — no I/O, no Mongo/CP imports. Callers (msg-workout-analyze.ts)
 * fetch the workout item and the lead's conversation messages, then hand
 * both to `matchMsgWorkout`. See `ai-docs/msg-workout/matching-rules.md`
 * for the full, authoritative description of each stage; this file's own
 * comments only cover implementation detail, not the policy itself.
 *
 * Explicit-result-type rule (spec 3.3): every outcome is its own tagged
 * variant, never a shared `null` standing in for multiple meanings.
 */

import { levenshteinDistance } from "./lead-beeper-links.js";

export type MsgWorkoutDirection = "you" | "she";

export interface BeeperCandidateMessage {
  /** Stable Mongo `_id` (stringified ObjectId) — never the content-hash UI id. */
  messageId: string;
  /** ISO 8601 */
  timestamp: string;
  isSelf: boolean;
  text: string;
}

export interface MatchCandidate {
  messageId: string;
  timestamp: string;
  direction: MsgWorkoutDirection;
  confidence: number;
  reasons: string[];
  /** First 40 chars only — never the full message, per spec 1.6. */
  textSnippet: string;
}

export interface LinkReason {
  type: "exact-time" | "single-day" | "exact-text";
  summary: string;
}

export interface ProposalReason {
  type: "ambiguous-time" | "ambiguous-exact" | "fuzzy-only";
  summary: string;
}

export type MatchResult =
  | { type: "linked"; messageId: string; timestamp: string; reason: LinkReason }
  | { type: "proposal"; candidates: MatchCandidate[]; reason: ProposalReason }
  | { type: "undated"; reason: { summary: string } }
  | { type: "no-candidates"; reason: { summary: string } };

export interface MatchWorkoutInput {
  workoutName: string;
  workoutBody: string;
  /** Every message in the lead's linked conversation — the engine filters per stage. */
  candidates: BeeperCandidateMessage[];
}

const TOLERANCE_MS = 30 * 60 * 1000;
const SNIPPET_LEN = 40;

type ParsedWorkoutName =
  | { kind: "day-time"; year: number; month: number; day: number; hour: number; minute: number }
  | { kind: "day"; year: number; month: number; day: number }
  | { kind: "none" };

const DAY_TIME_PATTERN = /^(\d{2})-(\d{2})-(\d{2})__(\d{2})-(\d{2})Z$/;
const DAY_ONLY_PATTERN = /^(\d{2})-(\d{2})-(\d{2})[a-z]*$/;

/** Parses `YY-MM-DD__HH-MMZ` or `YY-MM-DD[suffix]` out of a workout's logical name. */
export function parseWorkoutName(name: string): ParsedWorkoutName {
  const dayTime = name.match(DAY_TIME_PATTERN);
  if (dayTime) {
    const [, yy, mm, dd, hh, min] = dayTime;
    return {
      kind: "day-time",
      year: Number(yy),
      month: Number(mm),
      day: Number(dd),
      hour: Number(hh),
      minute: Number(min),
    };
  }
  const dayOnly = name.match(DAY_ONLY_PATTERN);
  if (dayOnly) {
    const [, yy, mm, dd] = dayOnly;
    return { kind: "day", year: Number(yy), month: Number(mm), day: Number(dd) };
  }
  return { kind: "none" };
}

/** UTC instant for a parsed `day-time` name (`Z` in the name means UTC). */
export function dayTimeToUtcDate(parsed: Extract<ParsedWorkoutName, { kind: "day-time" }>): Date {
  return new Date(Date.UTC(2000 + parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0));
}

/**
 * Local-calendar-day key (`YY-MM-DD`) for a message timestamp, using the
 * exact same local-time getters `generateWorkoutName` (leads.ts) uses to
 * build a workout's own name — so a "day-only" workout name buckets
 * against messages the same way the name itself was generated. Timezone
 * correctness at midnight boundaries is explicitly not critical here (see
 * the prompt's own note); this only needs to match the project's existing
 * convention, not introduce a new one.
 */
export function localDayKey(date: Date): { year: number; month: number; day: number } {
  return { year: date.getFullYear() % 100, month: date.getMonth() + 1, day: date.getDate() };
}

function sameDayKey(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** CRLF/CR → LF, trim, collapse runs of spaces/tabs to one space per line — preserves text/meaning, only normalizes whitespace. */
export function normalizeForExactMatch(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export interface WorkoutDirectionParse {
  direction: MsgWorkoutDirection | null;
  /** Body text with the `p1_you;`/`p1_she;` prefix stripped, normalized. Full normalized body when no prefix found. */
  text: string;
}

const DIRECTION_PREFIX = /^p1_(you|she);\s*(.*)$/i;

/** Parses an optional `p1_you;`/`p1_she;` prefix from a workout body's first line. */
export function parseWorkoutDirectionAndText(body: string): WorkoutDirectionParse {
  const normalized = normalizeForExactMatch(body);
  const lines = normalized.split("\n");
  const match = lines[0]?.match(DIRECTION_PREFIX);
  if (!match) {
    return { direction: null, text: normalized };
  }
  const direction = match[1].toLowerCase() as MsgWorkoutDirection;
  const rest = [match[2], ...lines.slice(1)].join("\n").trim();
  return { direction, text: rest };
}

/** 0..1 similarity from normalized edit distance — 1 = identical, 0 = completely different. */
export function textSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

function snippet(text: string): string {
  const clean = text.trim();
  return clean.length > SNIPPET_LEN ? `${clean.slice(0, SNIPPET_LEN)}…` : clean;
}

function candidateDirection(isSelf: boolean): MsgWorkoutDirection {
  return isSelf ? "you" : "she";
}

function toMatchCandidate(c: BeeperCandidateMessage, confidence: number, reasons: string[]): MatchCandidate {
  return {
    messageId: c.messageId,
    timestamp: c.timestamp,
    direction: candidateDirection(c.isSelf),
    confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100,
    reasons,
    textSnippet: snippet(c.text),
  };
}

/**
 * Runs the full 4-stage pipeline for one workout against every candidate
 * message in its lead's linked conversation. See
 * `ai-docs/msg-workout/matching-rules.md` for the policy this implements.
 */
export function matchMsgWorkout(input: MatchWorkoutInput): MatchResult {
  const parsedName = parseWorkoutName(input.workoutName);

  if (parsedName.kind === "none") {
    return { type: "undated", reason: { summary: `Workout name "${input.workoutName}" has no parseable date.` } };
  }

  if (parsedName.kind === "day-time") {
    const target = dayTimeToUtcDate(parsedName).getTime();
    const within = input.candidates.filter(
      (c) => Math.abs(new Date(c.timestamp).getTime() - target) <= TOLERANCE_MS
    );
    if (within.length === 1) {
      const c = within[0];
      return {
        type: "linked",
        messageId: c.messageId,
        timestamp: c.timestamp,
        reason: { type: "exact-time", summary: `Exactly one message within ±30 min of the name's timestamp.` },
      };
    }
    if (within.length === 0) {
      return { type: "no-candidates", reason: { summary: "No Beeper message within ±30 min of the name's timestamp." } };
    }
    const sorted = [...within].sort(
      (a, b) => Math.abs(new Date(a.timestamp).getTime() - target) - Math.abs(new Date(b.timestamp).getTime() - target)
    );
    const candidates = sorted.map((c, i) => {
      const delta = Math.abs(new Date(c.timestamp).getTime() - target);
      const proximity = 1 - delta / TOLERANCE_MS;
      const reasons = ["within-30min"];
      if (i === 0) reasons.push("closest-timestamp");
      return toMatchCandidate(c, proximity, reasons);
    });
    return {
      type: "proposal",
      candidates,
      reason: { type: "ambiguous-time", summary: `${within.length} messages matched within ±30 min — cannot pick one automatically.` },
    };
  }

  // parsedName.kind === "day"
  const sameDay = input.candidates.filter((c) => sameDayKey(localDayKey(new Date(c.timestamp)), parsedName));
  if (sameDay.length === 0) {
    return { type: "no-candidates", reason: { summary: "No Beeper message on the name's day." } };
  }
  if (sameDay.length === 1) {
    const c = sameDay[0];
    return {
      type: "linked",
      messageId: c.messageId,
      timestamp: c.timestamp,
      reason: { type: "single-day", summary: "Exactly one message on the name's day." },
    };
  }

  // Stage 3 — exact normalized p1_you/p1_she, only meaningful with >=2 same-day candidates.
  const { direction, text: workoutText } = parseWorkoutDirectionAndText(input.workoutBody);
  if (direction) {
    const exact = sameDay.filter(
      (c) => c.isSelf === (direction === "you") && normalizeForExactMatch(c.text) === workoutText
    );
    if (exact.length === 1) {
      const c = exact[0];
      return {
        type: "linked",
        messageId: c.messageId,
        timestamp: c.timestamp,
        reason: { type: "exact-text", summary: `Exact normalized text + direction (${direction}) match, unique on the day.` },
      };
    }
    if (exact.length > 1) {
      const candidates = exact.map((c) => toMatchCandidate(c, 0.95, ["same-day", "direction-match", "exact-text-match"]));
      return {
        type: "proposal",
        candidates,
        reason: { type: "ambiguous-exact", summary: `${exact.length} messages exactly match the workout's text and direction on the same day.` },
      };
    }
  }

  // Stage 4 — fuzzy, never auto-links.
  const deltas = sameDay.map((c) => Math.abs(new Date(c.timestamp).getTime() - new Date(sameDay[0].timestamp).getTime()));
  const minDelta = Math.min(...deltas);
  const scored = sameDay.map((c, i) => {
    const reasons: string[] = ["same-day"];
    let confidence = 0.25; // sameDay component, fixed once this branch is reached

    if (direction) {
      const directionMatches = c.isSelf === (direction === "you");
      if (directionMatches) {
        confidence += 0.25;
        reasons.push("direction-match");
      }
    }

    const similarity = textSimilarity(normalizeForExactMatch(c.text), workoutText);
    if (similarity > 0) {
      confidence += similarity * 0.35;
      reasons.push(`text-similarity:${Math.round(similarity * 100) / 100}`);
    }

    if (deltas[i] === minDelta) {
      confidence += 0.15;
      reasons.push("closest-timestamp");
    }

    return toMatchCandidate(c, confidence, reasons);
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  return {
    type: "proposal",
    candidates: scored,
    reason: { type: "fuzzy-only", summary: "No exact text+direction match — fuzzy candidates only, review required." },
  };
}
