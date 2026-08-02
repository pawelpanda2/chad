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
  /** At most one group is ever the default at a time (new contacts / unassigned fallback — set via setDefaultBeeperGroup). */
  isDefault: boolean;
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
    isDefault: doc.isDefault === true,
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

/**
 * Rename an existing group. Rejects empty names and case-insensitive
 * collisions with a *different* group (same uniqueness rule as create).
 */
export async function renameBeeperGroup(groupId: string, name: string): Promise<BeeperGroup> {
  assertBeeperWriteAllowed();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Group name is required");
  }

  const col = await groupsCol();
  const id = toObjectId(groupId);
  const current = await col.findOne({ _id: id });
  if (!current) {
    throw new Error(`Group not found: "${groupId}"`);
  }

  const clash = await col.findOne(
    { name: trimmed, _id: { $ne: id } },
    { collation: { locale: "en", strength: 2 } }
  );
  if (clash) {
    throw new Error(`A group named "${trimmed}" already exists`);
  }

  const now = new Date();
  await col.updateOne({ _id: id }, { $set: { name: trimmed, updatedAt: now } });
  return toBeeperGroup({ ...current, name: trimmed, updatedAt: now });
}

/**
 * Deletes a group definition. Contacts currently assigned to it fall back
 * to "no group" (never left pointing at a dangling groupId) rather than
 * being touched otherwise — same "clear the reference, don't cascade-delete
 * the referencing side" shape as `setBeeperContactGroup(id, null)`.
 */
export async function deleteBeeperGroup(groupId: string): Promise<void> {
  assertBeeperWriteAllowed();
  const id = toObjectId(groupId);
  const col = await groupsCol();
  const existing = await col.findOne({ _id: id });
  if (!existing) {
    throw new Error(`Group not found: "${groupId}"`);
  }

  const contacts = await contactsCol();
  await contacts.updateMany({ groupId: id }, { $set: { groupId: null } });
  await col.deleteOne({ _id: id });
}

/** Reads whichever group (if any) is currently marked default. */
export async function getDefaultBeeperGroup(): Promise<BeeperGroup | null> {
  const col = await groupsCol();
  const doc = await col.findOne({ isDefault: true });
  return doc ? toBeeperGroup(doc) : null;
}

/**
 * Sets the default group — `groupId: null` clears it (no default). At most
 * one group is ever default: clears any previous holder first, in the same
 * write, so there's never a moment with two.
 */
export async function setDefaultBeeperGroup(groupId: string | null): Promise<void> {
  assertBeeperWriteAllowed();
  const col = await groupsCol();

  if (groupId === null) {
    await col.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    return;
  }

  const id = toObjectId(groupId);
  const target = await col.findOne({ _id: id });
  if (!target) {
    throw new Error(`Group not found: "${groupId}"`);
  }
  await col.updateMany({ isDefault: true, _id: { $ne: id } }, { $set: { isDefault: false } });
  await col.updateOne({ _id: id }, { $set: { isDefault: true } });
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

/** Bulk assign/clear — every checked contact gets set to the same group, or `groupId: null` clears them all to "— No group —". */
export async function setBeeperContactsGroupBulk(
  contactIds: string[],
  groupId: string | null
): Promise<{ updated: number }> {
  assertBeeperWriteAllowed();
  if (contactIds.length === 0) {
    return { updated: 0 };
  }

  let targetGroupId: ObjectId | null = null;
  if (groupId !== null) {
    const groups = await groupsCol();
    const group = await groups.findOne({ _id: toObjectId(groupId) });
    if (!group) {
      throw new Error(`Group not found: "${groupId}"`);
    }
    targetGroupId = group._id;
  }

  const contacts = await contactsCol();
  const result = await contacts.updateMany(
    { _id: { $in: contactIds.map(toObjectId) } },
    { $set: { groupId: targetGroupId } }
  );
  return { updated: result.modifiedCount };
}
