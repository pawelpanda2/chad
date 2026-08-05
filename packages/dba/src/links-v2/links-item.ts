/**
 * Links V2 — read/write/merge the `links` Text Item under a lead's cp_item
 * folder. This is the first Text Item in the codebase to use `js-yaml`
 * load/dump on both the read and write side for its body (the existing
 * `contacts` item uses a hand-rolled line parser instead — see
 * `leads.ts`'s `parseContactsYaml`; the Date/Daily Entry items are the
 * `js-yaml` precedent this follows).
 */

import yaml from "js-yaml";
import type { CpItem } from "../cp-model.js";
import { getChildrenOf, createOrGetChild, putItemBody } from "../item-ops.js";
import type { BeeperLinkEntry, GoogleContactsLinkEntry, LeadLinksData } from "./types.js";

export const LINKS_ITEM_NAME = "links";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBeeperEntries(raw: unknown): BeeperLinkEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((e) => ({
      chatId: typeof e.chatId === "string" ? e.chatId : "",
      type: typeof e.type === "string" ? e.type : "",
      method: e.method === "manual" ? ("manual" as const) : ("automatic" as const),
      matchedOn: e.matchedOn === "manual" ? ("manual" as const) : ("phone" as const),
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
    }))
    .filter((e) => e.chatId);
}

function parseGoogleContactsEntries(raw: unknown): GoogleContactsLinkEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((e) => ({
      resourceName: typeof e.resourceName === "string" ? e.resourceName : "",
      displayName: typeof e.displayName === "string" ? e.displayName : "",
      phone: typeof e.phone === "string" ? e.phone : "",
      method: e.method === "manual" ? ("manual" as const) : ("automatic" as const),
      matchedOn: e.matchedOn === "manual" ? ("manual" as const) : ("phone" as const),
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
    }))
    .filter((e) => e.resourceName);
}

/** Parses a `links` item body. Malformed/empty bodies parse as "no links" rather than throwing — a details page must never break because of a hand-edited links item. */
export function parseLeadLinksYaml(body: string): LeadLinksData {
  if (!body || !body.trim()) return { beeper: [], googleContacts: [] };
  let parsed: unknown;
  try {
    parsed = yaml.load(body);
  } catch {
    return { beeper: [], googleContacts: [] };
  }
  if (!isRecord(parsed)) return { beeper: [], googleContacts: [] };
  return {
    beeper: parseBeeperEntries(parsed.beeper),
    googleContacts: parseGoogleContactsEntries(parsed.googleContacts),
  };
}

/** Dumps `data` back to YAML — omits empty arrays/keys entirely so a lead with nothing linked yet gets an empty body, not `beeper: []`. */
export function dumpLeadLinksYaml(data: LeadLinksData): string {
  const out: Record<string, unknown> = {};
  if (data.beeper.length > 0) out.beeper = data.beeper;
  if (data.googleContacts.length > 0) out.googleContacts = data.googleContacts;
  if (Object.keys(out).length === 0) return "";
  return yaml.dump(out, { lineWidth: -1 });
}

export function mergeBeeperEntries(
  existing: BeeperLinkEntry[],
  additions: BeeperLinkEntry[]
): { merged: BeeperLinkEntry[]; addedCount: number } {
  const seen = new Set(existing.map((e) => e.chatId));
  const merged = [...existing];
  let addedCount = 0;
  for (const entry of additions) {
    if (seen.has(entry.chatId)) continue;
    seen.add(entry.chatId);
    merged.push(entry);
    addedCount++;
  }
  return { merged, addedCount };
}

export function mergeGoogleContactsEntries(
  existing: GoogleContactsLinkEntry[],
  additions: GoogleContactsLinkEntry[]
): { merged: GoogleContactsLinkEntry[]; addedCount: number } {
  const seen = new Set(existing.map((e) => e.resourceName));
  const merged = [...existing];
  let addedCount = 0;
  for (const entry of additions) {
    if (seen.has(entry.resourceName)) continue;
    seen.add(entry.resourceName);
    merged.push(entry);
    addedCount++;
  }
  return { merged, addedCount };
}

async function findLinksItem(leadItem: CpItem): Promise<CpItem | null> {
  const children = await getChildrenOf(leadItem.config.address);
  return children.find((c) => c.config.type === "Text" && c.config.name === LINKS_ITEM_NAME) ?? null;
}

/** Reads and parses a lead's `links` item — `{ beeper: [], googleContacts: [] }` if it doesn't exist yet. */
export async function readLeadLinks(leadItem: CpItem): Promise<LeadLinksData> {
  const item = await findLinksItem(leadItem);
  if (!item) return { beeper: [], googleContacts: [] };
  return parseLeadLinksYaml(item.body);
}

/** Writes `data` as the lead's `links` item body. Creates the item on first write, overwrites in place after. No-ops when the body is unchanged (avoids needless CP writes/history noise on every sync tick) and never creates an item just to hold an empty body. */
export async function writeLeadLinks(leadItem: CpItem, data: LeadLinksData): Promise<void> {
  const item = await findLinksItem(leadItem);
  const body = dumpLeadLinksYaml(data);
  if (item) {
    if (item.body === body) return;
    await putItemBody(item.config.address, body);
    return;
  }
  if (!body) return;
  await createOrGetChild(leadItem, LINKS_ITEM_NAME, "Text", body);
}
