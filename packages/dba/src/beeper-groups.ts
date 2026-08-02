/**
 * Beeper CRM contact groups (Story 101).
 *
 * A freeform, user-named, *singular* grouping per contact — distinct from
 * `tags` (beeper-crm.ts), which is a fixed enum
 * (business/romantic/friends/spam) and multi-value. Not to be confused
 * with Beeper/WhatsApp **group chats** (`channels.type === "group"`,
 * `groupChannel` on messages) — completely unrelated concepts that happen
 * to share the English word "group".
 *
 * Same isolation model as the rest of Beeper CRM: one `beeper_groups`
 * collection per user, inside that user's own `beeper_<repoGuid>`
 * database — never a caller-supplied repoGuid.
 */

import { ObjectId } from "mongodb";
import { getBeeperMongoDb } from "./mongo.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { assertBeeperWriteAllowed } from "./chad-data-mode.js";

export const BEEPER_GROUPS_COLLECTION = "beeper_groups";

export interface BeeperGroup {
  _id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

async function groupsCol() {
  return (await getBeeperMongoDb(getCurrentRepoGuid())).collection<any>(BEEPER_GROUPS_COLLECTION);
}

async function contactsCol() {
  return (await getBeeperMongoDb(getCurrentRepoGuid())).collection<any>("contacts");
}

function toObjectId(id: string): ObjectId {
  try {
    return new ObjectId(id);
  } catch {
    throw new Error(`Invalid ObjectId: "${id}"`);
  }
}

function toBeeperGroup(doc: any): BeeperGroup {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

/** Idempotent — safe to call on every process start, same convention as ensureBeeperIndexes. */
export async function ensureBeeperGroupsIndexes(repoGuid: string): Promise<void> {
  assertBeeperWriteAllowed();
  const db = await getBeeperMongoDb(repoGuid);
  await Promise.all([
    db.collection<any>(BEEPER_GROUPS_COLLECTION).createIndex(
      { name: 1 },
      { unique: true, collation: { locale: "en", strength: 2 }, name: "name_unique_ci" }
    ),
    db.collection<any>("contacts").createIndex({ groupId: 1 }),
  ]);
}

export async function listBeeperGroups(): Promise<BeeperGroup[]> {
  const col = await groupsCol();
  const rows = await col.find({}).sort({ name: 1 }).toArray();
  return rows.map(toBeeperGroup);
}

/**
 * Find-or-create by normalized (case-insensitive) name — idempotent, so a
 * duplicate "+ New group" submission (or two tabs open at once) never
 * produces two groups with the same name.
 */
export async function createBeeperGroup(name: string): Promise<BeeperGroup> {
  assertBeeperWriteAllowed();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Group name is required");
  }

  const col = await groupsCol();
  const existing = await col.findOne({ name: trimmed }, { collation: { locale: "en", strength: 2 } });
  if (existing) return toBeeperGroup(existing);

  const now = new Date();
  const doc = { name: trimmed, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return toBeeperGroup({ _id: result.insertedId, ...doc });
}

/** Single-contact assign/clear. `groupId: null` removes the contact from any group. */
export async function setBeeperContactGroup(contactId: string, groupId: string | null): Promise<void> {
  assertBeeperWriteAllowed();
  const contacts = await contactsCol();

  if (groupId === null) {
    await contacts.updateOne({ _id: toObjectId(contactId) }, { $set: { groupId: null } });
    return;
  }

  const groups = await groupsCol();
  const group = await groups.findOne({ _id: toObjectId(groupId) });
  if (!group) {
    throw new Error(`Group not found: "${groupId}"`);
  }
  await contacts.updateOne({ _id: toObjectId(contactId) }, { $set: { groupId: group._id } });
}

/** Bulk assign — every checked contact gets set to the same group. Never accepts `groupId: null` (bulk clear isn't a supported action here). */
export async function setBeeperContactsGroupBulk(
  contactIds: string[],
  groupId: string
): Promise<{ updated: number }> {
  assertBeeperWriteAllowed();
  if (contactIds.length === 0) {
    return { updated: 0 };
  }

  const groups = await groupsCol();
  const group = await groups.findOne({ _id: toObjectId(groupId) });
  if (!group) {
    throw new Error(`Group not found: "${groupId}"`);
  }

  const contacts = await contactsCol();
  const result = await contacts.updateMany(
    { _id: { $in: contactIds.map(toObjectId) } },
    { $set: { groupId: group._id } }
  );
  return { updated: result.modifiedCount };
}
