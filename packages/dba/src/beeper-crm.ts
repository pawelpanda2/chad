/**
 * Beeper CRM data access layer.
 *
 * Ported from the standalone `contacts` monorepo (packages/dashboard's
 * SvelteKit routes + packages/beeper-sync/beeper-ws/beeper-oplog's shared
 * db.mjs). Business logic is preserved as-is from the source implementation
 * — only the transport (SvelteKit load()/+server.js -> plain async
 * functions consumed by Next.js API routes) and serialization (ObjectId ->
 * string, Date -> ISO string) changed.
 *
 * NOT to be confused with ./beeper.ts, which is a completely different,
 * older feature: matching Content-Provider-stored WhatsApp export text
 * against dating leads. This module is the live, MongoDB-backed Beeper
 * messenger CRM (contacts/channels/messages/timeline_events).
 *
 * See documentation/beeper/mongo-schema.md for the collection shapes.
 */

import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongo.js";

// ── Collections ────────────────────────────────────────────────────────────

// Untyped (Document = any-shaped) collections on purpose: the documents
// have many optional/legacy-shape fields (see documentation/beeper/mongo-schema.md)
// and this module already does its own narrow, explicit typing on the way
// out via the Beeper* view types below.
async function contactsCol() {
  return (await getMongoDb()).collection<any>("contacts");
}
async function channelsCol() {
  return (await getMongoDb()).collection<any>("channels");
}
async function messagesCol() {
  return (await getMongoDb()).collection<any>("messages");
}
async function timelineEventsCol() {
  return (await getMongoDb()).collection<any>("timeline_events");
}

/**
 * Idempotently ensures all indexes used by the Beeper CRM exist. Safe to
 * call on every process start (createIndex is a no-op if the index already
 * exists with the same spec). Mirrors the indexes created by beeper-sync,
 * beeper-ws and beeper-oplog's own db modules so the dashboard alone is
 * enough to bootstrap a fresh database.
 */
export async function ensureBeeperIndexes(): Promise<void> {
  const [contacts, channels, messages, timelineEvents] = await Promise.all([
    contactsCol(),
    channelsCol(),
    messagesCol(),
    timelineEventsCol(),
  ]);

  await Promise.all([
    contacts.createIndex(
      { "identities.senderID": 1 },
      {
        unique: true,
        partialFilterExpression: { "identities.senderID": { $type: "string" } },
        name: "identities_senderID_unique",
      }
    ),
    contacts.createIndex({ tags: 1 }),
    channels.createIndex({ beeperChatID: 1 }, { unique: true, sparse: true }),
    channels.createIndex({ participantIDs: 1 }),
    channels.createIndex({ lastMessageAt: -1 }),
    messages.createIndex(
      { beeperMessageID: 1, network: 1 },
      { unique: true, partialFilterExpression: { beeperMessageID: { $type: "string" } } }
    ),
    messages.createIndex({ channelID: 1, timestamp: -1 }),
    messages.createIndex({ contactID: 1, timestamp: -1 }),
    messages.createIndex({ channelID: 1, timestamp: 1, isSelf: 1 }),
    timelineEvents.createIndex({ contactID: 1, timestamp: 1 }),
  ]);
}

// ── Types ──────────────────────────────────────────────────────────────────

export type BeeperTag = "business" | "romantic" | "friends" | "spam";

export interface BeeperIdentity {
  network: string;
  senderID: string;
  senderName?: string;
  username?: string;
}

export interface BeeperContactListItem {
  _id: string;
  displayName: string;
  notes: string;
  tags: string[];
  identities: BeeperIdentity[];
  hasAvatar: boolean;
  channelCount: number;
  lastMessage: { text: string; timestamp: string | null; network: string } | null;
}

export interface BeeperContactDetail {
  _id: string;
  displayName: string;
  bio: string;
  notes: string;
  tags: string[];
  avatarURL: string;
  identities: BeeperIdentity[];
  mergedFrom: string[];
  socialLinks: string[];
  phones: { number: string; label: string }[];
  ratingStatus: string;
  ratingPriority: number | null;
  direction: string;
  nextStep: string;
  nextStepDate: string;
  attractiveness: number | null;
  interest: number | null;
  availability: number | null;
  haremPotential: number | null;
  redFlags: string[];
}

export interface BeeperMessageAttachment {
  type: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  mediaId: string | null;
  mediaSuffix: string;
  width: number | null;
  height: number | null;
  isVoiceNote: boolean;
  isGif: boolean;
}

export interface BeeperMessageView {
  _id: string;
  isSelf: boolean;
  text: string;
  network: string;
  type: string;
  timestamp: string | null;
  reactions: { senderID: string; emoji: string }[];
  groupChannel: { title: string | null; type: string } | null;
  attachments: BeeperMessageAttachment[];
}

export interface BeeperChannelView {
  _id: string;
  type: string;
  title: string | null;
  network: string;
}

export interface BeeperTimelineEventView {
  _id: string;
  type: string;
  timestamp: string | null;
  title: string;
  description: string;
  createdAt?: string | null;
}

export interface BeeperContactFullDetail {
  contact: BeeperContactDetail;
  channels: BeeperChannelView[];
  messages: BeeperMessageView[];
  timelineEvents: BeeperTimelineEventView[];
}

export interface BeeperContactProfilePatch {
  displayName?: string | null;
  bio?: string | null;
  notes?: string | null;
  avatarURL?: string | null;
  ratingStatus?: string | null;
  nextStep?: string | null;
  nextStepDate?: string | null;
  direction?: string | null;
  ratingPriority?: number | null;
  attractiveness?: number | null;
  interest?: number | null;
  availability?: number | null;
  haremPotential?: number | null;
  redFlags?: string[];
  socialLinks?: string[];
  phones?: { number: string; label?: string }[];
}

export interface BeeperInboxRow {
  id: string;
  contact: { _id: string; displayName: string; avatarURL: string | null };
  message: { text: string; timestamp: string | null; network: string; isSelf: boolean };
}

export interface BeeperMergeSuggestionCard {
  _id: string;
  displayName: string;
  avatarURL: string | null;
  networks: string[];
  senderIDs: { network: string; senderID: string }[];
  lastMessage: { text: string; network: string; timestamp: string | null } | null;
}

export interface BeeperMergeSuggestion {
  id: string;
  similarity: number;
  a: BeeperMergeSuggestionCard;
  b: BeeperMergeSuggestionCard;
}

export interface BeeperDashboardStats {
  totalContacts: number;
  totalMessages: number;
  totalChannels: number;
  messagesPerNetwork: { network: string; count: number }[];
  taggedContactsCount: { tag: string; count: number }[];
  messageHistory: { date: string; sent: number; received: number }[];
}

export interface BeeperContactSearchResult {
  _id: string;
  displayName: string;
  tags: string[];
  networks: string[];
}

const TYPE_LABELS: Record<string, string> = {
  IMAGE: "📷 Photo",
  VIDEO: "🎬 Video",
  FILE: "📎 File",
  STICKER: "🎨 Sticker",
  VOICE: "🎤 Voice",
  AUDIO: "🎵 Audio",
  LOCATION: "📍 Location",
};

function toIso(d: unknown): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d as string);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function toObjectId(id: string): ObjectId {
  try {
    return new ObjectId(id);
  } catch {
    throw new Error(`Invalid ObjectId: "${id}"`);
  }
}

// ── Contacts: list / detail ─────────────────────────────────────────────────

/**
 * Lists contacts (excludes spam + merged-away contacts by default). Pass a
 * tag to filter to a single tag (business / romantic / friends), matching
 * the source project's separate /business, /friends pages.
 */
export async function listBeeperContacts(opts?: {
  tag?: BeeperTag;
}): Promise<BeeperContactListItem[]> {
  const contacts = await contactsCol();
  const channels = await channelsCol();
  const messages = await messagesCol();

  const filter: Record<string, unknown> = opts?.tag
    ? { mergedInto: { $exists: false }, tags: opts.tag }
    : {
        $and: [
          { $or: [{ tags: { $exists: false } }, { tags: { $nin: ["spam"] } }] },
          { $or: [{ mergedInto: { $exists: false } }, { mergedInto: null }] },
        ],
      };

  const rows = await contacts.find(filter).sort({ updatedAt: -1 }).toArray();

  const enriched = await Promise.all(
    rows.map(async (c) => {
      const contactChannels = await channels
        .find({ participantIDs: c._id, type: { $ne: "group" } })
        .toArray();
      const channelIds = contactChannels.map((ch) => ch._id);

      const lastMsg = await messages.findOne(
        {
          $or: [{ channelID: { $in: channelIds } }, { contactID: c._id, channelID: null }],
        },
        { sort: { timestamp: -1 } }
      );

      const item: BeeperContactListItem = {
        _id: c._id.toString(),
        displayName: c.displayName,
        notes: c.notes ?? "",
        tags: c.tags ?? [],
        identities: c.identities ?? [],
        hasAvatar: !!c.avatarURL,
        channelCount: contactChannels.length,
        lastMessage: lastMsg
          ? {
              text: lastMsg.text,
              timestamp: toIso(lastMsg.timestamp),
              network: lastMsg.network,
            }
          : null,
      };
      return item;
    })
  );

  if (opts?.tag) return enriched;

  // Default (all-contacts) view hides contacts with no conversation and no
  // manual notes — same filter as the source project's /contacts page.
  return enriched.filter(
    (c) => c.channelCount > 0 || c.lastMessage !== null || (c.notes && c.notes.length > 0)
  );
}

/**
 * Full contact detail: profile fields, all channels (direct + any group
 * channels the contact posted in), the merged direct+group message
 * timeline, and manual timeline events.
 */
export async function getBeeperContact(id: string): Promise<BeeperContactFullDetail | null> {
  const contactId = toObjectId(id);
  const contacts = await contactsCol();
  const channels = await channelsCol();
  const messages = await messagesCol();
  const timelineEvents = await timelineEventsCol();

  const contact = await contacts.findOne({ _id: contactId });
  if (!contact) return null;
  if (contact.mergedInto) {
    throw new Error(`Contact was merged into ${contact.mergedInto.toString()}`);
  }

  const directChannels = await channels
    .find({ participantIDs: contactId, type: { $ne: "group" } })
    .toArray();
  const directChannelIds = directChannels.map((c) => c._id);

  const groupMessagesResult = await messages
    .find({
      contactID: contactId,
      isSelf: false,
      deletedAt: null,
      $or: [{ text: { $ne: "" } }, { attachments: { $exists: true, $not: { $size: 0 } } }],
    })
    .sort({ timestamp: 1 })
    .toArray();

  const groupChannelIds = [
    ...new Set(groupMessagesResult.map((m) => m.channelID?.toString()).filter(Boolean)),
  ];
  const groupChannels = groupChannelIds.length
    ? await channels.find({ _id: { $in: groupChannelIds.map((gid) => new ObjectId(gid)) } }).toArray()
    : [];
  const groupChannelMap = Object.fromEntries(groupChannels.map((c) => [c._id.toString(), c]));

  // groupChannelIds comes from any contactID-matching message, which also
  // catches messages posted in the contact's own direct channel — dedupe by
  // _id so a direct channel doesn't appear twice (once via directChannels,
  // once via groupChannels).
  const directChannelIdSet = new Set(directChannelIds.map((cid) => cid.toString()));
  const channelsAll = [
    ...directChannels,
    ...groupChannels.filter((c) => !directChannelIdSet.has(c._id.toString())),
  ];

  const directMessagesResult = await messages
    .find({
      $and: [
        { $or: [{ channelID: { $in: directChannelIds } }, { contactID: contactId, channelID: null }] },
        {
          deletedAt: null,
          $or: [{ text: { $ne: "" } }, { attachments: { $exists: true, $not: { $size: 0 } } }],
        },
      ],
    })
    .sort({ timestamp: 1 })
    .toArray();

  const seen = new Set<string>();
  const allMessages = [];
  for (const m of [...directMessagesResult, ...groupMessagesResult]) {
    const key = m._id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      allMessages.push(m);
    }
  }
  allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const events = await timelineEvents.find({ contactID: contactId }).sort({ timestamp: 1 }).toArray();

  const mxcPrefix = "mxc://local.beeper.com/";

  return {
    contact: {
      _id: contact._id.toString(),
      displayName: contact.displayName,
      bio: contact.bio ?? "",
      notes: contact.notes ?? "",
      tags: contact.tags ?? [],
      avatarURL: contact.avatarURL ?? "",
      identities: contact.identities ?? [],
      mergedFrom: (contact.mergedFrom ?? []).map((mid: ObjectId) => mid.toString()),
      socialLinks: Array.isArray(contact.socialLinks)
        ? contact.socialLinks
        : Object.values(contact.socialLinks ?? {}).filter(Boolean),
      phones: contact.phones ?? [],
      ratingStatus: contact.ratingStatus ?? "",
      ratingPriority: contact.ratingPriority ?? null,
      direction: contact.direction ?? "",
      nextStep: contact.nextStep ?? "",
      nextStepDate: contact.nextStepDate ?? "",
      attractiveness: contact.attractiveness ?? null,
      interest: contact.interest ?? null,
      availability: contact.availability ?? null,
      haremPotential: contact.haremPotential ?? null,
      redFlags: contact.redFlags ?? [],
    },
    channels: channelsAll.map((c) => ({
      _id: c._id.toString(),
      type: c.type,
      title: c.title ?? null,
      network: c.network,
    })),
    messages: allMessages.map((m) => {
      const chId = m.channelID?.toString();
      const groupCh = chId ? groupChannelMap[chId] : null;
      return {
        _id: m._id.toString(),
        isSelf: m.isSelf,
        text: m.text,
        network: m.network,
        type: m.type,
        timestamp: toIso(m.timestamp),
        reactions: (m.reactions ?? []).filter((r: { emoji: string }) => r.emoji),
        groupChannel: groupCh ? { title: groupCh.title ?? null, type: groupCh.type } : null,
        attachments: (m.attachments ?? []).map((a: Record<string, any>) => {
          const raw = a.srcURL || a.id || "";
          const withoutPrefix = raw.startsWith(mxcPrefix) ? raw.slice(mxcPrefix.length) : raw;
          const qIdx = withoutPrefix.indexOf("?");
          const mediaId = qIdx >= 0 ? withoutPrefix.slice(0, qIdx) : withoutPrefix;
          const qs = qIdx >= 0 ? withoutPrefix.slice(qIdx) : "";
          return {
            type: a.type,
            mimeType: a.mimeType,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mediaId: mediaId || null,
            mediaSuffix: qs,
            width: a.size?.width ?? null,
            height: a.size?.height ?? null,
            isVoiceNote: a.type === "voice" || (a.mimeType ?? "").includes("ogg"),
            isGif: a.isGif ?? false,
          };
        }),
      };
    }),
    timelineEvents: events.map((e) => ({
      _id: e._id.toString(),
      type: e.type,
      timestamp: toIso(e.timestamp),
      title: e.title ?? "",
      description: e.description ?? "",
    })),
  };
}

/** Fetches just the avatar (kept out of list/detail responses — can be a large base64 data URI). */
export async function getBeeperContactAvatar(id: string): Promise<string | null> {
  const contacts = await contactsCol();
  const contact = await contacts.findOne(
    { _id: toObjectId(id) },
    { projection: { avatarURL: 1 } }
  );
  return contact?.avatarURL ?? null;
}

// ── Profile / tags / events mutations ───────────────────────────────────────

const ALLOWED_STRING_FIELDS = new Set([
  "displayName",
  "bio",
  "notes",
  "avatarURL",
  "ratingStatus",
  "nextStep",
  "nextStepDate",
  "direction",
]);
const ALLOWED_NUMBER_FIELDS = new Set([
  "ratingPriority",
  "attractiveness",
  "interest",
  "availability",
  "haremPotential",
]);

export async function updateBeeperContactProfile(
  id: string,
  patch: BeeperContactProfilePatch
): Promise<{ updated: string[] }> {
  const contacts = await contactsCol();
  const _id = toObjectId(id);

  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (ALLOWED_STRING_FIELDS.has(k)) {
      upd[k] = v === null || v === undefined ? null : String(v).trim();
    } else if (ALLOWED_NUMBER_FIELDS.has(k)) {
      upd[k] = v === undefined ? null : v;
    }
  }
  if (Array.isArray(patch.redFlags)) {
    upd.redFlags = patch.redFlags.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim());
  }
  if (Array.isArray(patch.socialLinks)) {
    upd.socialLinks = patch.socialLinks.filter((u) => typeof u === "string" && u.trim()).map((u) => u.trim());
  }
  if (Array.isArray(patch.phones)) {
    upd.phones = patch.phones
      .filter((p) => p && typeof p.number === "string" && p.number.trim())
      .map((p) => ({ number: p.number.trim(), label: (p.label || "mobile").trim() }));
  }

  if (Object.keys(upd).length === 0) {
    throw new Error("No valid fields to update");
  }
  upd.updatedAt = new Date();

  const result = await contacts.updateOne({ _id }, { $set: upd });
  if (result.matchedCount === 0) throw new Error("Contact not found");

  return { updated: Object.keys(upd) };
}

const ALLOWED_TAGS = new Set<BeeperTag>(["business", "romantic", "friends", "spam"]);

export async function addBeeperContactTag(id: string, tag: BeeperTag): Promise<void> {
  if (!ALLOWED_TAGS.has(tag)) throw new Error(`Invalid tag: ${tag}`);
  const contacts = await contactsCol();
  const _id = toObjectId(id);
  const result = await contacts.updateOne(
    { _id },
    { $addToSet: { tags: tag }, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw new Error("Contact not found");
}

export async function removeBeeperContactTag(id: string, tag: BeeperTag): Promise<void> {
  if (!ALLOWED_TAGS.has(tag)) throw new Error(`Invalid tag: ${tag}`);
  const contacts = await contactsCol();
  const _id = toObjectId(id);
  const result = await contacts.updateOne(
    { _id },
    { $pull: { tags: tag } as any, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw new Error("Contact not found");
}

const ALLOWED_EVENT_TYPES = new Set(["meeting", "note", "milestone", "call"]);

export async function listBeeperContactEvents(id: string): Promise<BeeperTimelineEventView[]> {
  const timelineEvents = await timelineEventsCol();
  const contactID = toObjectId(id);
  const events = await timelineEvents.find({ contactID }).sort({ timestamp: 1 }).toArray();
  return events.map((e) => ({
    _id: e._id.toString(),
    type: e.type,
    timestamp: toIso(e.timestamp),
    title: e.title ?? "",
    description: e.description ?? "",
    createdAt: toIso(e.createdAt),
  }));
}

export async function addBeeperContactEvent(
  id: string,
  input: { type?: string; timestamp?: string; title: string; description?: string }
): Promise<BeeperTimelineEventView> {
  const contacts = await contactsCol();
  const timelineEvents = await timelineEventsCol();
  const contactID = toObjectId(id);

  const contact = await contacts.findOne({ _id: contactID });
  if (!contact) throw new Error("Contact not found");

  const type = input.type ?? "note";
  if (!ALLOWED_EVENT_TYPES.has(type)) throw new Error(`Invalid type: ${type}`);
  if (!input.title?.trim()) throw new Error("title is required");

  const ts = input.timestamp ? new Date(input.timestamp) : new Date();
  if (Number.isNaN(ts.getTime())) throw new Error("Invalid timestamp");

  const now = new Date();
  const doc = {
    contactID,
    type,
    timestamp: ts,
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  const result = await timelineEvents.insertOne(doc);

  return {
    _id: result.insertedId.toString(),
    type: doc.type,
    timestamp: toIso(doc.timestamp),
    title: doc.title,
    description: doc.description,
    createdAt: toIso(doc.createdAt),
  };
}

export async function deleteBeeperContactEvent(id: string, eventId: string): Promise<void> {
  const timelineEvents = await timelineEventsCol();
  const result = await timelineEvents.deleteOne({
    _id: toObjectId(eventId),
    contactID: toObjectId(id),
  });
  if (result.deletedCount === 0) throw new Error("Event not found");
}

// ── Merge ────────────────────────────────────────────────────────────────

export async function mergeBeeperContacts(
  primaryIdStr: string,
  secondaryIdStr: string
): Promise<{ mergedIdentities: number; message: string }> {
  const contacts = await contactsCol();
  const channels = await channelsCol();
  const messages = await messagesCol();
  const timelineEvents = await timelineEventsCol();

  const primaryId = toObjectId(primaryIdStr);
  const secondaryId = toObjectId(secondaryIdStr);
  if (primaryId.equals(secondaryId)) throw new Error("Cannot merge contact with itself");

  const [primary, secondary] = await Promise.all([
    contacts.findOne({ _id: primaryId }),
    contacts.findOne({ _id: secondaryId }),
  ]);
  if (!primary) throw new Error("Primary contact not found");
  if (!secondary) throw new Error("Secondary contact not found");
  if (secondary.mergedInto) throw new Error("Secondary contact is already merged into another");

  const existingSenderIDs = new Set((primary.identities ?? []).map((i: BeeperIdentity) => i.senderID).filter(Boolean));
  const identitiesToMove = (secondary.identities ?? []).filter(
    (i: BeeperIdentity) => i.senderID && !existingSenderIDs.has(i.senderID)
  );

  const mergedTags = [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])];
  const mergedNotes = [primary.notes, secondary.notes]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("\n\n---\n\n");
  const mergedBio = primary.bio || secondary.bio || "";
  const mergedAvatar = primary.avatarURL || secondary.avatarURL || null;

  const existingNums = new Set((primary.phones ?? []).map((p: { number: string }) => p.number));
  const newPhones = (secondary.phones ?? []).filter((p: { number: string }) => !existingNums.has(p.number));

  const existingLinks = new Set(primary.socialLinks ?? []);
  const newLinks = (secondary.socialLinks ?? []).filter((u: string) => !existingLinks.has(u));

  // Order matters: the unique index on identities.senderID means secondary's
  // identities must be cleared BEFORE they're added to primary.
  await contacts.updateOne(
    { _id: secondaryId },
    {
      $set: {
        identities: [],
        mergedInto: primaryId,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  const primaryUpdate: Record<string, unknown> = {
    $set: {
      tags: mergedTags,
      notes: mergedNotes.trim(),
      bio: mergedBio,
      avatarURL: mergedAvatar,
      updatedAt: new Date(),
    },
    $addToSet: { mergedFrom: secondaryId },
  };
  const push: Record<string, unknown> = {};
  if (identitiesToMove.length) push.identities = { $each: identitiesToMove };
  if (newPhones.length) push.phones = { $each: newPhones };
  if (newLinks.length) push.socialLinks = { $each: newLinks };
  if (Object.keys(push).length) primaryUpdate.$push = push;

  await contacts.updateOne({ _id: primaryId }, primaryUpdate);

  const secondaryChannels = await channels.find({ participantIDs: secondaryId }).toArray();
  for (const ch of secondaryChannels) {
    await channels.updateOne({ _id: ch._id }, { $addToSet: { participantIDs: primaryId } });
    await channels.updateOne({ _id: ch._id }, { $pull: { participantIDs: secondaryId } as any });
  }

  await messages.updateMany({ contactID: secondaryId }, { $set: { contactID: primaryId } });
  await timelineEvents.updateMany({ contactID: secondaryId }, { $set: { contactID: primaryId } });

  return {
    mergedIdentities: identitiesToMove.length,
    message: `${secondary.displayName} was merged into ${primary.displayName}`,
  };
}

// ── Search ──────────────────────────────────────────────────────────────

export async function searchBeeperContacts(
  q: string,
  excludeId?: string
): Promise<BeeperContactSearchResult[]> {
  if (q.trim().length < 2) return [];
  const contacts = await contactsCol();

  const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const and: Record<string, unknown>[] = [
    { $or: [{ mergedInto: { $exists: false } }, { mergedInto: null }] },
    {
      $or: [
        { displayName: regex },
        { "identities.senderName": regex },
        { "identities.senderID": regex },
      ],
    },
  ];
  if (excludeId) {
    and.push({ _id: { $ne: toObjectId(excludeId) } });
  }

  const rows = await contacts
    .find({ $and: and }, { projection: { displayName: 1, identities: 1, tags: 1 } })
    .limit(10)
    .toArray();

  return rows.map((c) => ({
    _id: c._id.toString(),
    displayName: c.displayName,
    tags: c.tags ?? [],
    networks: [...new Set((c.identities ?? []).map((i: BeeperIdentity) => i.network))] as string[],
  }));
}

// ── Inbox ──────────────────────────────────────────────────────────────

export async function getBeeperInbox(): Promise<BeeperInboxRow[]> {
  const channels = await channelsCol();
  const messages = await messagesCol();
  const contacts = await contactsCol();

  const directChannels = await channels.find({ type: { $ne: "group" } }).toArray();
  const directChannelIds = directChannels.map((c) => c._id);
  const channelMap = new Map(directChannels.map((c) => [c._id.toString(), c]));

  const recentGroups = await messages
    .aggregate([
      { $match: { channelID: { $in: directChannelIds } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: "$channelID", lastMessage: { $first: "$$ROOT" } } },
      { $sort: { "lastMessage.timestamp": -1 } },
      { $limit: 100 },
    ])
    .toArray();

  const rows: BeeperInboxRow[] = [];
  for (const group of recentGroups) {
    const channelIdStr = group._id.toString();
    const channel = channelMap.get(channelIdStr);
    if (!channel) continue;

    const participantIds: ObjectId[] = channel.participantIDs || [];
    if (participantIds.length === 0) continue;

    const participants = await contacts
      .find({ _id: { $in: participantIds } }, { projection: { displayName: 1, avatarURL: 1, mergedInto: 1 } })
      .toArray();

    let target = participants.find((c) => !c.mergedInto) || participants[0];
    if (target?.mergedInto) {
      const parent = await contacts.findOne(
        { _id: target.mergedInto },
        { projection: { displayName: 1, avatarURL: 1, mergedInto: 1 } }
      );
      if (parent) target = parent;
    }
    if (!target) continue;

    rows.push({
      id: channelIdStr,
      contact: {
        _id: target._id.toString(),
        displayName: target.displayName || "Unknown Contact",
        avatarURL: target.avatarURL || null,
      },
      message: {
        text: group.lastMessage.text || TYPE_LABELS[group.lastMessage.type] || `[${group.lastMessage.type}]`,
        timestamp: toIso(group.lastMessage.timestamp),
        network: group.lastMessage.network || channel.network,
        isSelf: Boolean(group.lastMessage.isSelf),
      },
    });
  }

  return rows;
}

// ── Merge suggestions (fuzzy pairwise, direct-DM contacts only) ───────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Suggests pairs of contacts that are likely the same person, based on
 * fuzzy name matching. Deliberately scoped to contacts with direct-DM
 * history only (per README note: group-chat-only contacts produce noisy
 * false positives), and returns individual pair suggestions rather than an
 * auto-merge-everything list — the user picks per pair.
 */
export async function getBeeperMergeSuggestions(): Promise<BeeperMergeSuggestion[]> {
  const channels = await channelsCol();
  const contacts = await contactsCol();
  const messages = await messagesCol();

  const directChannels = await channels
    .find({ type: { $ne: "group" } }, { projection: { participantIDs: 1 } })
    .toArray();
  const directContactIds = new Set(
    directChannels.flatMap((c) => (c.participantIDs ?? []).map((cid: ObjectId) => cid.toString()))
  );

  const allContacts = await contacts
    .find(
      { mergedInto: { $exists: false }, displayName: { $type: "string", $ne: "" } },
      { projection: { displayName: 1, avatarURL: 1, identities: 1 } }
    )
    .toArray();
  const candidates = allContacts.filter((c) => directContactIds.has(c._id.toString()));

  const raw: { a: any; b: any; similarity: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const na = normalizeName(a.displayName);
      const nb = normalizeName(b.displayName);
      if (na === nb) {
        raw.push({ a, b, similarity: 1.0 });
        continue;
      }
      const tokensA = na.split(" ");
      const tokensB = nb.split(" ");
      const hasSharedWord = tokensA.some((t) => t.length >= 3 && tokensB.includes(t));
      const hasSubstring = (na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb));

      const dist = levenshtein(na, nb);
      const maxLen = Math.max(na.length, nb.length);
      let similarity = maxLen === 0 ? 0 : 1 - dist / maxLen;
      if (hasSharedWord || hasSubstring) similarity = Math.max(similarity, 0.85);

      if (similarity >= 0.55) raw.push({ a, b, similarity });
    }
  }
  raw.sort((x, y) => y.similarity - x.similarity);

  const toCard = async (c: any): Promise<BeeperMergeSuggestionCard> => {
    const lastMsg = await messages.findOne(
      { contactID: c._id },
      { sort: { timestamp: -1 }, projection: { text: 1, type: 1, timestamp: 1, network: 1 } }
    );
    return {
      _id: c._id.toString(),
      displayName: c.displayName,
      avatarURL: c.avatarURL || null,
      networks: c.identities ? [...new Set(c.identities.map((i: BeeperIdentity) => i.network))] as string[] : [],
      senderIDs: (c.identities ?? [])
        .filter((i: BeeperIdentity) => i.senderID)
        .map((i: BeeperIdentity) => ({ network: i.network, senderID: i.senderID })),
      lastMessage: lastMsg
        ? {
            text: lastMsg.text || TYPE_LABELS[lastMsg.type] || `[${lastMsg.type}]`,
            network: lastMsg.network,
            timestamp: toIso(lastMsg.timestamp),
          }
        : null,
    };
  };

  return Promise.all(
    raw.slice(0, 50).map(async ({ a, b, similarity }) => ({
      id: `${a._id}-${b._id}`,
      similarity: Math.round(similarity * 100),
      a: await toCard(a),
      b: await toCard(b),
    }))
  );
}

// ── Dashboard stats ────────────────────────────────────────────────────

export async function getBeeperDashboardStats(): Promise<BeeperDashboardStats> {
  const contacts = await contactsCol();
  const channels = await channelsCol();
  const messages = await messagesCol();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalContacts, totalMessages, totalChannels, messagesPerNetwork, taggedContactsCount, messageHistory] =
    await Promise.all([
      contacts.countDocuments(),
      messages.countDocuments(),
      channels.countDocuments(),
      messages
        .aggregate([{ $group: { _id: "$network", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
        .toArray(),
      contacts
        .aggregate([
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      messages
        .aggregate([
          { $match: { timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              sent: { $sum: { $cond: [{ $eq: ["$isSelf", true] }, 1, 0] } },
              received: { $sum: { $cond: [{ $eq: ["$isSelf", true] }, 0, 1] } },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

  return {
    totalContacts,
    totalMessages,
    totalChannels,
    messagesPerNetwork: messagesPerNetwork.map((n) => ({ network: n._id || "Unknown", count: n.count })),
    taggedContactsCount: taggedContactsCount.map((t) => ({
      tag: typeof t._id === "string" ? t._id : "unknown",
      count: t.count,
    })),
    messageHistory: messageHistory.map((day) => ({ date: day._id, sent: day.sent, received: day.received })),
  };
}

// ── Export for AI ──────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = { meeting: "📅", note: "📝", milestone: "🏆", call: "📞" };

/** Renders a contact's full profile + communication history as Markdown, for pasting into an LLM chat. */
export async function exportBeeperContactForAI(id: string): Promise<string> {
  const detail = await getBeeperContact(id);
  if (!detail) throw new Error("Contact not found");
  const { contact, messages, timelineEvents } = detail;

  type TimelineItem = { kind: "msg" | "event"; ts: string | null; data: any };
  const timeline: TimelineItem[] = [
    ...messages.filter((m) => m.type !== "REACTION").map((m) => ({ kind: "msg" as const, ts: m.timestamp, data: m })),
    ...timelineEvents.map((e) => ({ kind: "event" as const, ts: e.timestamp, data: e })),
  ].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime());

  const name = contact.displayName ?? "Unknown";
  const networks = [...new Set(contact.identities.map((i) => i.network))].join(", ");
  const tags = contact.tags.join(", ") || "none";
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "";
  const dateKey = (d: string | null) => (d ? new Date(d).toDateString() : "");

  let historyStr = "";
  let lastKey: string | null = null;
  for (const item of timeline) {
    const dk = dateKey(item.ts);
    if (dk !== lastKey) {
      historyStr += `\n**${fmtDate(item.ts)}**\n\n`;
      lastKey = dk;
    }
    if (item.kind === "msg") {
      const m = item.data as BeeperMessageView;
      if (!m.text && !m.attachments.length) continue;
      const who = m.isSelf ? "Me" : name.split(" ")[0];
      const txt = m.text || `[${m.type}]`;
      historyStr += `${who}: ${txt}\n`;
      if (m.reactions.length) {
        historyStr += `> _(reactions: ${m.reactions.map((r) => r.emoji).join(" ")})_\n`;
      }
    } else {
      const e = item.data as BeeperTimelineEventView;
      historyStr += `\n${EVENT_ICONS[e.type] ?? "📌"} **${e.title ?? ""}**\n`;
      if (e.description) historyStr += `> ${e.description}\n`;
      historyStr += "\n";
    }
  }

  return `# ${name}

**Networks:** ${networks}
**Tags:** ${tags}
**Bio:** ${contact.bio || "—"}
**Notes:** ${contact.notes || "—"}${contact.socialLinks.length ? `\n**Links:** ${contact.socialLinks.join(", ")}` : ""}

---

## Communication history
${historyStr}`;
}

// ── Live updates (SSE) ───────────────────────────────────────────────────

/**
 * Subscribes to live changes on the Beeper CRM database. Prefers MongoDB
 * change streams (db.watch()), which require a replica set — NOT yet
 * deployed on QNAP (see documentation/beeper/architecture.md). Falls back
 * to a 5s polling ping so the SSE endpoint keeps working (client just
 * refetches on every ping) until the replica set migration lands.
 *
 * Returns an unsubscribe function.
 */
export async function subscribeToBeeperChanges(onChange: () => void): Promise<() => void> {
  const db = await getMongoDb();
  try {
    const stream = db.watch([], { fullDocument: "updateLookup" });
    stream.on("change", () => onChange());
    stream.on("error", (err) => {
      console.error("[beeper-crm] change stream error:", err.message);
    });
    return () => {
      stream.close().catch(() => {});
    };
  } catch (err) {
    console.warn(
      "[beeper-crm] db.watch() unavailable (standalone MongoDB, not a replica set) — falling back to polling.",
      err instanceof Error ? err.message : err
    );
    const interval = setInterval(onChange, 5000);
    return () => clearInterval(interval);
  }
}
