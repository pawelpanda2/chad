/**
 * Msg Creator (Story 125) — find-or-create the Msg Workout for a lead's
 * LAST Beeper message.
 *
 * Distinct from Story 99's `msg-workout-analyze.ts` (which only *matches*
 * already-existing, manually/dated-named workouts against messages, never
 * creates one) and from Story 90's old Links module — this Story reads the
 * lead's linked Beeper conversation via Links V2 only
 * (`links-v2/page-data.ts`'s `getLeadLinksV2ByLoca`, "first entry" — same
 * one-conversation-per-lead assumption `message-creator.ts`'s
 * `getLeadConversationForCreator` already makes for its own tiered
 * resolution), fetches that conversation's raw Beeper messages directly
 * (`beeper-crm.ts`'s `getBeeperContact`, already sorted ascending by
 * timestamp) so the stable Mongo `_id` is available without round-tripping
 * through the content-hash `ParsedWhatsAppMessage` pipeline, and either
 * reuses or creates exactly one Msg Workout item for that message.
 *
 * Identity contract (unchanged from `msg-workout-linking.ts`, Story 99):
 * `config.links.beeper.messageId` (stringified Mongo `_id`) is the ONLY
 * thing that determines "does this message already have a workout" — never
 * the workout's name, never message text. `config["msg-workout"]` (new in
 * this Story — no prior format existed in the codebase) is purely an
 * additive, human-facing identity field mirroring the workout's own
 * generated name; it is never used for dedup/lookup.
 *
 * Read vs write split mirrors this codebase's own established convention
 * (`message-creator.ts`'s "approach context"/"my proposals" — created only
 * on save, opening the view never writes anything, after a prior bug where
 * GET bootstrap side-effects created phantom items users never asked for):
 * `findMsgWorkoutForLastBeeperMessage` is read-only, safe for a GET
 * bootstrap; `findOrCreateMsgWorkoutForLastBeeperMessage` is the only
 * function that ever writes a new item, called lazily from a Save path.
 */

import type { CpItem } from "./cp-model.js";
import { addressToRepoAndLoca, repoAndLocaToAddress } from "./cp-model.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { getItemByAddress, getChildrenOf, createOrGetChild, putItemConfig } from "./item-ops.js";
import { getLeadLinksV2ByLoca } from "./links-v2/page-data.js";
import { getBeeperContact } from "./beeper-crm.js";
import { getMsgWorkoutBeeperLink, type MsgWorkoutBeeperLink } from "./msg-workout-linking.js";
import { appendMsgWorkoutEntryAndSave, type MsgWorkoutEntryInput } from "./msg-workout-entry.js";

const MSG_WORKOUT_FOLDER_NAME = "msg workout";
const NAME_SUFFIX_LETTERS = "bcdefghijklmnopqrstuvwxyz";

export interface MsgWorkoutForMessage {
  loca: string;
  name: string;
  body: string;
}

export interface LastBeeperMessageRef {
  chatId: string;
  messageId: string;
  timestamp: string;
}

type LastBeeperMessageResolution =
  | { status: "no-conversation" }
  | { status: "no-messages" }
  | { status: "ok"; message: LastBeeperMessageRef };

/** `YY-MM-DD; HH:mm:ss`, zero-padded, computed from the message's own UTC timestamp (the message's ISO timestamp is already UTC — see `beeper-linking.md`; matches the existing day+time workout-name convention's own "Z = UTC" choice, `matching-rules.md`). Example: `26-08-17; 23:04:33`. */
export function formatMsgWorkoutNameForMessageTimestamp(timestampIso: string): string {
  const d = new Date(timestampIso);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yy}-${mm}-${dd}; ${hh}:${mi}:${ss}`;
}

async function getLeadItemByLoca(leadLoca: string): Promise<CpItem> {
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), leadLoca);
  const lead = await getItemByAddress(address);
  if (!lead) {
    throw new Error(`Lead not found at loca "${leadLoca}"`);
  }
  return lead;
}

/** Links V2 only (per spec) — `links.beeper[0]`, same "first entry" precedent `message-creator.ts` already uses. */
async function resolveLastBeeperMessageForLead(leadLoca: string): Promise<LastBeeperMessageResolution> {
  const links = await getLeadLinksV2ByLoca(leadLoca);
  const chatId = links.beeper[0]?.chatId;
  if (!chatId) return { status: "no-conversation" };

  const contact = await getBeeperContact(chatId);
  const withTimestamp = (contact?.messages ?? []).filter(
    (m): m is typeof m & { timestamp: string } => Boolean(m.timestamp)
  );
  if (withTimestamp.length === 0) return { status: "no-messages" };

  // getBeeperContact already returns messages sorted ascending by timestamp.
  const last = withTimestamp[withTimestamp.length - 1];
  return { status: "ok", message: { chatId, messageId: last._id, timestamp: last.timestamp } };
}

async function findMsgWorkoutFolder(lead: CpItem): Promise<CpItem | null> {
  const children = await getChildrenOf(lead.config.address);
  return children.find((c) => c.config.type === "Folder" && c.config.name === MSG_WORKOUT_FOLDER_NAME) ?? null;
}

function toMsgWorkoutForMessage(item: CpItem): MsgWorkoutForMessage {
  return {
    loca: addressToRepoAndLoca(item.config.address).loca,
    name: item.config.name,
    body: typeof item.body === "string" ? item.body : "",
  };
}

/** Scans the lead's existing workouts for one already linked to `messageId` — the only dedup key, never the name. */
async function findWorkoutLinkedToMessage(lead: CpItem, messageId: string): Promise<CpItem | null> {
  const folder = await findMsgWorkoutFolder(lead);
  if (!folder) return null;
  const workouts = await getChildrenOf(folder.config.address);
  for (const w of workouts) {
    const link = getMsgWorkoutBeeperLink(w);
    if (link?.messageId === messageId) return w;
  }
  return null;
}

export type MsgWorkoutForMessageLookup =
  | { status: "no-conversation" }
  | { status: "no-messages" }
  | { status: "exists"; workout: MsgWorkoutForMessage }
  | { status: "missing"; plannedName: string };

/**
 * Read-only find — never creates anything. Safe to call from a GET
 * bootstrap (spec: opening a lead must never write a phantom workout).
 */
export async function findMsgWorkoutForLastBeeperMessage(leadLoca: string): Promise<MsgWorkoutForMessageLookup> {
  const resolution = await resolveLastBeeperMessageForLead(leadLoca);
  if (resolution.status !== "ok") return { status: resolution.status };

  const lead = await getLeadItemByLoca(leadLoca);
  const existing = await findWorkoutLinkedToMessage(lead, resolution.message.messageId);
  if (existing) return { status: "exists", workout: toMsgWorkoutForMessage(existing) };
  return { status: "missing", plannedName: formatMsgWorkoutNameForMessageTimestamp(resolution.message.timestamp) };
}

function writeMsgWorkoutForMessageLinkAndName(
  item: CpItem,
  name: string,
  link: Omit<MsgWorkoutBeeperLink, "linkedAt" | "method">
): Promise<CpItem> {
  const existingLinks = (item.config.links as Record<string, unknown> | undefined) ?? {};
  const nextConfig = {
    ...item.config,
    "msg-workout": name,
    links: {
      ...existingLinks,
      beeper: {
        messageId: link.messageId,
        timestamp: link.timestamp,
        linkedAt: new Date().toISOString(),
        method: "automatic",
      } satisfies MsgWorkoutBeeperLink,
    },
  };
  return putItemConfig({ ...item, config: nextConfig });
}

export type MsgWorkoutForMessageResult =
  | { status: "no-conversation" }
  | { status: "no-messages" }
  | { status: "ok"; workout: MsgWorkoutForMessage };

/**
 * Find-or-create — the only function that ever writes a new Msg Workout
 * item. Deterministic naming (derived from the message's own timestamp,
 * never `Date.now()`) means two concurrent calls for the SAME message
 * generate the SAME name, so `createOrGetChild`'s own find-or-create-by-name
 * semantics is what makes this safe under a race — no extra locking needed.
 * A genuine name collision with an UNRELATED workout (different message,
 * same-second name) falls through to a letter-suffix loop, same pattern
 * `leads.ts`'s `generateWorkoutName` already uses.
 */
export async function findOrCreateMsgWorkoutForLastBeeperMessage(
  leadLoca: string
): Promise<MsgWorkoutForMessageResult> {
  const resolution = await resolveLastBeeperMessageForLead(leadLoca);
  if (resolution.status !== "ok") return { status: resolution.status };
  const { messageId, timestamp } = resolution.message;

  const lead = await getLeadItemByLoca(leadLoca);
  const existing = await findWorkoutLinkedToMessage(lead, messageId);
  if (existing) return { status: "ok", workout: toMsgWorkoutForMessage(existing) };

  const folder = await createOrGetChild(lead, MSG_WORKOUT_FOLDER_NAME, "Folder");
  const baseName = formatMsgWorkoutNameForMessageTimestamp(timestamp);

  let name = baseName;
  let suffixIndex = 0;
  for (;;) {
    const item = await createOrGetChild(folder, name, "Folder");
    const link = getMsgWorkoutBeeperLink(item);
    if (!link) {
      const configured = await writeMsgWorkoutForMessageLinkAndName(item, name, { messageId, timestamp });
      return { status: "ok", workout: toMsgWorkoutForMessage(configured) };
    }
    if (link.messageId === messageId) {
      return { status: "ok", workout: toMsgWorkoutForMessage(item) };
    }
    // Name collision with an unrelated, already-linked workout — try the next suffix.
    if (suffixIndex < NAME_SUFFIX_LETTERS.length) {
      name = `${baseName}${NAME_SUFFIX_LETTERS[suffixIndex]}`;
      suffixIndex++;
    } else {
      name = `${baseName}_${Date.now()}`;
    }
  }
}

export interface SaveMsgCreatorEntryInput {
  who: "you" | "advice";
  mode: "dash" | "ver";
  text: string;
  /** Session username — server-resolved, never taken from the request body. */
  author: string;
}

/**
 * Save path for the Msg Creator composer: find-or-create the workout for
 * the lead's last Beeper message, then append one structured entry to its
 * body via the existing shared composer (`msg-workout-entry.ts` —
 * un-modified formatting contract, only the "ver" numbering was extended
 * there and the advice author here is always the session actor, never
 * client-supplied).
 */
export async function saveMsgCreatorEntry(
  leadLoca: string,
  input: SaveMsgCreatorEntryInput
): Promise<MsgWorkoutForMessageResult> {
  const found = await findOrCreateMsgWorkoutForLastBeeperMessage(leadLoca);
  if (found.status !== "ok") return found;

  const entry: MsgWorkoutEntryInput =
    input.who === "advice"
      ? { type: "advice", author: input.author, text: input.text }
      : { type: input.mode, text: input.text };

  const newBody = await appendMsgWorkoutEntryAndSave(found.workout.loca, entry);
  return { status: "ok", workout: { ...found.workout, body: newBody } };
}
