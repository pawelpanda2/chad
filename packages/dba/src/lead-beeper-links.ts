/**
 * Lead ↔ Beeper conversation links (Story 90) — Msg Auto → Links page.
 *
 * Storage: per-user Beeper Mongo `beeper_<repoGuid>` collection
 * `lead_conversation_links` (same isolation as Beeper CRM / Story 73).
 * Never accepts repoGuid from callers — always `getCurrentRepoGuid()`.
 */

import { randomUUID } from "node:crypto";
import { getBeeperMongoDb } from "./mongo.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { getAllLeadsWithContacts, getLeadDetails } from "./leads.js";

export const LEAD_CONVERSATION_LINKS_COLLECTION = "lead_conversation_links";

export type LeadBeeperLinkMethod = "automatic" | "manual" | "suggested";
export type LeadBeeperLinkSource = "contact" | "name" | "phone" | "manual";

export interface LeadBeeperLink {
  id: string;
  leadName: string;
  leadLoca?: string;
  conversationId: string;
  conversationName: string;
  channel?: string;
  method: LeadBeeperLinkMethod;
  source: LeadBeeperLinkSource;
  contactValue?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadLinkCandidate {
  leadName: string;
  leadLoca: string;
  phones: string[];
}

export interface ConversationLinkCandidate {
  conversationId: string;
  conversationName: string;
  channel?: string;
  phones: string[];
}

export interface LeadBeeperLinksPageData {
  leads: LeadLinkCandidate[];
  conversations: ConversationLinkCandidate[];
  links: LeadBeeperLink[];
}

export class LeadBeeperLinksError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "VALIDATION"
      | "DUPLICATE"
      | "INVALID_PAIR"
      | "SAME_SIDE"
  ) {
    super(message);
    this.name = "LeadBeeperLinksError";
  }
}

/** Digits-only phone key for matching. Returns null if too short for a match. */
export function normalizePhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits;
}

/** Display form for GUI: `number +48 ...` when possible. */
export function formatPhoneDisplay(value: string | undefined | null): string | null {
  if (!value || !String(value).trim()) return null;
  const trimmed = String(value).trim();
  if (/^number\s+/i.test(trimmed)) return trimmed;
  return `number ${trimmed}`;
}

function linkPairKey(leadName: string, conversationId: string): string {
  return `${leadName}::${conversationId}`;
}

function assertValidLinkPair(input: {
  leadName?: unknown;
  conversationId?: unknown;
}): void {
  if (typeof input.leadName !== "string" || !input.leadName.trim()) {
    throw new LeadBeeperLinksError("leadName is required", "VALIDATION");
  }
  if (typeof input.conversationId !== "string" || !input.conversationId.trim()) {
    throw new LeadBeeperLinksError("conversationId is required", "VALIDATION");
  }
}

/**
 * Pure merge: keep all manuals; add auto/suggested only when no existing
 * link for that lead↔conversation pair; never overwrite manuals.
 */
export function mergeAutoMatchLinks(
  existing: LeadBeeperLink[],
  proposals: LeadBeeperLink[],
  nowIso: string
): LeadBeeperLink[] {
  const byPair = new Map<string, LeadBeeperLink>();
  for (const link of existing) {
    byPair.set(linkPairKey(link.leadName, link.conversationId), link);
  }

  for (const proposal of proposals) {
    const key = linkPairKey(proposal.leadName, proposal.conversationId);
    const current = byPair.get(key);
    if (!current) {
      byPair.set(key, { ...proposal, updatedAt: nowIso });
      continue;
    }
    if (current.method === "manual") continue;
    // Prefer automatic over suggested when upgrading a non-manual link.
    if (current.method === "suggested" && proposal.method === "automatic") {
      byPair.set(key, {
        ...proposal,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: nowIso,
      });
    }
  }

  return [...byPair.values()];
}

/**
 * Build auto-match proposals from candidates (pure). Exact normalized phone
 * → automatic; last-9 match with different full strings → suggested.
 */
export function buildPhoneMatchProposals(
  leads: LeadLinkCandidate[],
  conversations: ConversationLinkCandidate[],
  nowIso: string
): LeadBeeperLink[] {
  const proposals: LeadBeeperLink[] = [];
  const seen = new Set<string>();

  for (const lead of leads) {
    const leadPhones = lead.phones
      .map(normalizePhoneDigits)
      .filter((p): p is string => Boolean(p));
    if (leadPhones.length === 0) continue;

    for (const conv of conversations) {
      const convPhones = conv.phones
        .map(normalizePhoneDigits)
        .filter((p): p is string => Boolean(p));
      if (convPhones.length === 0) continue;

      let best: { method: LeadBeeperLinkMethod; contactValue: string; confidence: number } | null =
        null;

      for (const lp of leadPhones) {
        for (const cp of convPhones) {
          if (lp === cp) {
            best = { method: "automatic", contactValue: cp, confidence: 1 };
            break;
          }
          const lp9 = lp.slice(-9);
          const cp9 = cp.slice(-9);
          if (lp9.length === 9 && lp9 === cp9) {
            if (!best || best.method !== "automatic") {
              best = { method: "suggested", contactValue: cp, confidence: 0.6 };
            }
          }
        }
        if (best?.method === "automatic") break;
      }

      if (!best) continue;
      const key = linkPairKey(lead.leadName, conv.conversationId);
      if (seen.has(key)) continue;
      seen.add(key);

      proposals.push({
        id: randomUUID(),
        leadName: lead.leadName,
        leadLoca: lead.leadLoca,
        conversationId: conv.conversationId,
        conversationName: conv.conversationName,
        channel: conv.channel,
        method: best.method,
        source: "phone",
        contactValue: best.contactValue,
        confidence: best.confidence,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  return proposals;
}

export function validateLinksForSave(links: LeadBeeperLink[]): LeadBeeperLink[] {
  if (!Array.isArray(links)) {
    throw new LeadBeeperLinksError("links must be an array", "VALIDATION");
  }

  const seen = new Set<string>();
  const cleaned: LeadBeeperLink[] = [];
  const now = new Date().toISOString();

  for (const raw of links) {
    assertValidLinkPair(raw);
    const leadName = raw.leadName.trim();
    const conversationId = raw.conversationId.trim();

    // Guard against accidental same-side payloads from a buggy client.
    if (leadName === conversationId) {
      throw new LeadBeeperLinksError("cannot link an item to itself", "SAME_SIDE");
    }

    const key = linkPairKey(leadName, conversationId);
    if (seen.has(key)) {
      throw new LeadBeeperLinksError(
        `duplicate link for ${leadName} ↔ ${conversationId}`,
        "DUPLICATE"
      );
    }
    seen.add(key);

    const method = raw.method;
    if (method !== "automatic" && method !== "manual" && method !== "suggested") {
      throw new LeadBeeperLinksError(`invalid method: ${String(method)}`, "VALIDATION");
    }
    const source = raw.source;
    if (source !== "contact" && source !== "name" && source !== "phone" && source !== "manual") {
      throw new LeadBeeperLinksError(`invalid source: ${String(source)}`, "VALIDATION");
    }

    cleaned.push({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : randomUUID(),
      leadName,
      leadLoca: typeof raw.leadLoca === "string" ? raw.leadLoca : undefined,
      conversationId,
      conversationName:
        typeof raw.conversationName === "string" && raw.conversationName.trim()
          ? raw.conversationName.trim()
          : conversationId,
      channel: typeof raw.channel === "string" ? raw.channel : undefined,
      method,
      source,
      contactValue: typeof raw.contactValue === "string" ? raw.contactValue : undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
      createdAt:
        typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : now,
      updatedAt: now,
    });
  }

  return cleaned;
}

async function linksCol() {
  const db = await getBeeperMongoDb(getCurrentRepoGuid());
  return db.collection<LeadBeeperLink>(LEAD_CONVERSATION_LINKS_COLLECTION);
}

function firstPhone(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)].filter(Boolean);
}

function conversationDisplayName(
  displayName: string,
  identities: { network?: string }[] | undefined
): { name: string; channel?: string } {
  const network = identities?.[0]?.network;
  if (network) {
    const pretty = network.charAt(0).toUpperCase() + network.slice(1);
    return { name: `${pretty} · ${displayName}`, channel: network };
  }
  return { name: displayName };
}

async function loadLeadCandidates(): Promise<LeadLinkCandidate[]> {
  const leads = await getAllLeadsWithContacts();
  const out: LeadLinkCandidate[] = [];
  for (const lead of leads) {
    let phones: string[] = [];
    if (lead.hasContacts) {
      try {
        const details = await getLeadDetails(lead.leadName, lead.loca);
        phones = [
          ...firstPhone(details.contacts?.phone),
          ...firstPhone(details.contacts?.whatsapp),
        ];
      } catch {
        phones = [];
      }
    }
    out.push({ leadName: lead.leadName, leadLoca: lead.loca, phones });
  }
  return out;
}

async function loadConversationCandidates(): Promise<ConversationLinkCandidate[]> {
  const db = await getBeeperMongoDb(getCurrentRepoGuid());
  const contacts = db.collection("contacts");
  const rows = await contacts
    .find({
      $and: [
        { $or: [{ tags: { $exists: false } }, { tags: { $nin: ["spam"] } }] },
        { $or: [{ mergedInto: { $exists: false } }, { mergedInto: null }] },
      ],
    })
    .sort({ updatedAt: -1 })
    .toArray();

  return rows.map((c) => {
    const displayName = typeof c.displayName === "string" ? c.displayName : "Unknown";
    const { name, channel } = conversationDisplayName(displayName, c.identities);
    const phones = Array.isArray(c.phones)
      ? c.phones
          .map((p: { number?: string }) => (typeof p?.number === "string" ? p.number : ""))
          .filter(Boolean)
      : [];
    // WhatsApp senderIDs sometimes encode phone-like ids.
    for (const id of c.identities ?? []) {
      if (typeof id?.senderID === "string" && /\d{9,}/.test(id.senderID)) {
        phones.push(id.senderID);
      }
    }
    return {
      conversationId: String(c._id),
      conversationName: name,
      channel,
      phones,
    };
  });
}

export async function listLeadBeeperLinks(): Promise<LeadBeeperLink[]> {
  const col = await linksCol();
  return col.find({}).sort({ updatedAt: -1 }).toArray();
}

export async function getLeadBeeperLinksPageData(): Promise<LeadBeeperLinksPageData> {
  const [leads, conversations, links] = await Promise.all([
    loadLeadCandidates(),
    loadConversationCandidates(),
    listLeadBeeperLinks(),
  ]);
  return { leads, conversations, links };
}

export async function saveLeadBeeperLinks(input: {
  links: LeadBeeperLink[];
}): Promise<LeadBeeperLink[]> {
  const cleaned = validateLinksForSave(input.links ?? []);
  const col = await linksCol();
  await col.deleteMany({});
  if (cleaned.length > 0) {
    await col.insertMany(cleaned);
  }
  return cleaned;
}

export async function autoMatchLeadBeeperLinks(): Promise<LeadBeeperLinksPageData> {
  const page = await getLeadBeeperLinksPageData();
  const now = new Date().toISOString();
  const proposals = buildPhoneMatchProposals(page.leads, page.conversations, now);
  const merged = mergeAutoMatchLinks(page.links, proposals, now);
  // Working-state only — persistence is Save (POST /links).
  return {
    leads: page.leads,
    conversations: page.conversations,
    links: merged,
  };
}

/** Ensure indexes for the links collection (called from ensureBeeperIndexes). */
export async function ensureLeadBeeperLinksIndexes(repoGuid: string): Promise<void> {
  const db = await getBeeperMongoDb(repoGuid);
  const col = db.collection(LEAD_CONVERSATION_LINKS_COLLECTION);
  await col.createIndex(
    { leadName: 1, conversationId: 1 },
    { unique: true, name: "lead_conversation_unique" }
  );
}
