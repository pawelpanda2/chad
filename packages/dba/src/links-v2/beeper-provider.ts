/**
 * Links V2 — Beeper Link Provider. Reads the same per-user Beeper Mongo
 * `contacts` collection the rest of the Beeper CRM uses, directly — does
 * NOT import from `lead-beeper-links.ts` (the old Links module, Story 90),
 * so Links V2 stays fully independent of it (see `types.ts`).
 */

import { getBeeperMongoDb } from "../mongo.js";
import { getCurrentRepoGuid } from "../repo-context.js";
import { normalizePhoneDigits, phoneDigitsMatch } from "./phone-utils.js";
import type { BeeperLinkEntry, LinkProvider } from "./types.js";

export interface BeeperContactPhoneCandidate {
  chatId: string;
  type: string;
  displayName: string;
  phoneDigits: string[];
}

export type BeeperProviderIndex = BeeperContactPhoneCandidate[];

interface RawBeeperContact {
  _id: unknown;
  displayName?: unknown;
  phones?: { number?: unknown }[];
  identities?: { network?: unknown; senderID?: unknown }[];
}

/** Every non-spam, non-merged Beeper contact with at least one usable phone number, for the current repo. Fetched once per sync pass — never per lead. */
export async function loadBeeperPhoneCandidates(): Promise<BeeperProviderIndex> {
  const db = await getBeeperMongoDb(getCurrentRepoGuid());
  const contacts = db.collection<RawBeeperContact>("contacts");
  const rows = await contacts
    .find({
      $and: [
        { $or: [{ tags: { $exists: false } }, { tags: { $nin: ["spam"] } }] },
        { $or: [{ mergedInto: { $exists: false } }, { mergedInto: null }] },
      ],
    })
    .toArray();

  const out: BeeperProviderIndex = [];
  for (const c of rows) {
    const phones: string[] = Array.isArray(c.phones)
      ? c.phones.map((p) => (typeof p?.number === "string" ? p.number : "")).filter(Boolean)
      : [];
    // WhatsApp senderIDs sometimes encode phone-like ids (same heuristic as the old Links module).
    for (const identity of c.identities ?? []) {
      if (typeof identity?.senderID === "string" && /\d{9,}/.test(identity.senderID)) {
        phones.push(identity.senderID);
      }
    }
    const phoneDigits = phones.map(normalizePhoneDigits).filter((p): p is string => Boolean(p));
    if (phoneDigits.length === 0) continue;

    const network = c.identities?.[0]?.network;
    out.push({
      chatId: String(c._id),
      type: typeof network === "string" ? network : "unknown",
      displayName: typeof c.displayName === "string" ? c.displayName : "",
      phoneDigits,
    });
  }
  return out;
}

export const beeperLinkProvider: LinkProvider<BeeperProviderIndex, BeeperLinkEntry> = {
  id: "beeper",
  buildIndex: loadBeeperPhoneCandidates,
  findMatchesForLead(lead, index) {
    if (lead.phoneDigits.length === 0) return [];
    const alreadyLinked = new Set(lead.existing.beeper.map((e) => e.chatId));
    const now = new Date().toISOString();
    const matches: BeeperLinkEntry[] = [];
    for (const candidate of index) {
      if (alreadyLinked.has(candidate.chatId)) continue;
      const isMatch = lead.phoneDigits.some((lp) =>
        candidate.phoneDigits.some((cp) => phoneDigitsMatch(lp, cp))
      );
      if (!isMatch) continue;
      matches.push({
        chatId: candidate.chatId,
        type: candidate.type,
        method: "automatic",
        matchedOn: "phone",
        updatedAt: now,
      });
    }
    return matches;
  },
};
