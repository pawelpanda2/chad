/**
 * Msg workout body — structured entry composer (v11 GUI expansion of the
 * Msg Workout editor, shared between Beeper → Msg workout and Msg Auto →
 * Msg Workout).
 *
 * Reuses the `//header` line convention already informally present in old
 * workout bodies (see message-creator.ts's `extractHistoricalYouSection`,
 * which reads a `//you` section the same way).
 *
 * `dash` accumulates as bullet lines inside one running `//you` section
 * (created at the end of the body if missing) — that's the only type the
 * prompt asked to merge into an existing section. `ver`/`advice` are
 * point-in-time additions (a full message version / a person's advice),
 * so each submission appends its own new header block instead.
 */
import { getMsgWorkoutForEdit, saveMsgWorkout } from "./leads.js";

const HEADER_RE = /^\/\/[a-z]/i;
const YOU_HEADER_RE = /^\/\/you\b/i;

export const DEFAULT_ADVICE_AUTHOR = "Kamil_S";

export type MsgWorkoutEntryInput =
  | { type: "dash"; text: string }
  | { type: "ver"; text: string }
  | { type: "advice"; author: string; text: string };

/**
 * Line index to splice a new `//you` bullet into: right after the section's
 * last non-blank line, before any trailing blank line(s) that separate it
 * from the next `//header` (or EOF). -1 if no `//you` header exists.
 */
function findYouInsertIndex(lines: string[]): number {
  const start = lines.findIndex((line) => YOU_HEADER_RE.test(line.trim()));
  if (start < 0) return -1;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  return end;
}

/** Pure: computes the new body text for one appended entry. No I/O. */
export function appendMsgWorkoutEntry(body: string, entry: MsgWorkoutEntryInput): string {
  const current = (body ?? "").replace(/\r\n/g, "\n");

  if (entry.type === "dash") {
    const text = entry.text.trim();
    if (!text) return current;
    const lines = current.length > 0 ? current.split("\n") : [];
    const insertAt = findYouInsertIndex(lines);
    if (insertAt < 0) {
      const prefix = current.trim().length > 0 ? `${current.replace(/\s+$/, "")}\n\n` : "";
      return `${prefix}//you\n- ${text}`;
    }
    lines.splice(insertAt, 0, `- ${text}`);
    return lines.join("\n");
  }

  const text = entry.text.replace(/^\n+|\n+$/g, "");
  if (!text.trim()) return current;
  const header = entry.type === "ver" ? "//ver" : `//advice ${entry.author.trim() || DEFAULT_ADVICE_AUTHOR}`;
  const prefix = current.trim().length > 0 ? `${current.replace(/\s+$/, "")}\n\n` : "";
  return `${prefix}${header}\n${text}`;
}

/** Loads the current body, appends one entry, saves, and returns the new body. */
export async function appendMsgWorkoutEntryAndSave(loca: string, entry: MsgWorkoutEntryInput): Promise<string> {
  const data = await getMsgWorkoutForEdit(loca);
  if (!data) {
    throw new Error(`Could not find msg workout at loca "${loca}" to append entry`);
  }
  const newBody = appendMsgWorkoutEntry(data.body, entry);
  await saveMsgWorkout(loca, newBody);
  return newBody;
}
