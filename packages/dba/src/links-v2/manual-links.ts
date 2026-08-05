/**
 * Links V2 — manual link/unlink operations for the redesigned GUI (drag &
 * drop assign, REMOVE, unlink-X). Complements `sync.ts`'s automatic
 * phone-matching: these are direct, single-entry edits to a lead's own
 * `links` item, driven by an explicit user action rather than a match.
 */

import { getItemByAddress } from "../item-ops.js";
import { repoAndLocaToAddress, type CpItem } from "../cp-model.js";
import { getCurrentRepoGuid } from "../repo-context.js";
import { readLeadLinks, writeLeadLinks, mergeBeeperEntries, mergeGoogleContactsEntries } from "./links-item.js";
import type { BeeperLinkEntry, GoogleContactsLinkEntry } from "./types.js";

async function getLeadItemByLoca(loca: string): Promise<CpItem> {
  const repoGuid = getCurrentRepoGuid();
  const address = repoAndLocaToAddress(repoGuid, loca);
  const item = await getItemByAddress(address);
  if (!item) throw new Error(`Lead not found: ${loca}`);
  return item;
}

/** Assigns a Beeper conversation to a lead (idempotent — re-assigning the same chat to the same lead is a no-op via `mergeBeeperEntries`'s dedup). One-conversation-one-lead is a GUI-level contract, not enforced here: the caller reads the already-loaded page data to detect an existing owner and, if replacing, calls `unlinkBeeperConversationFromLead` for the old lead first. */
export async function linkBeeperConversationToLead(params: {
  leadLoca: string;
  chatId: string;
  network: string;
}): Promise<void> {
  const item = await getLeadItemByLoca(params.leadLoca);
  const existing = await readLeadLinks(item);
  const entry: BeeperLinkEntry = {
    chatId: params.chatId,
    type: params.network,
    method: "manual",
    matchedOn: "manual",
    updatedAt: new Date().toISOString(),
  };
  const { merged, addedCount } = mergeBeeperEntries(existing.beeper, [entry]);
  if (addedCount === 0) return;
  await writeLeadLinks(item, { beeper: merged, googleContacts: existing.googleContacts });
}

/** Removes a Beeper conversation link from a lead (REMOVE drop target / Conv-tab unlink-X confirm). No-ops if the chat wasn't linked to this lead. */
export async function unlinkBeeperConversationFromLead(params: {
  leadLoca: string;
  chatId: string;
}): Promise<void> {
  const item = await getLeadItemByLoca(params.leadLoca);
  const existing = await readLeadLinks(item);
  const beeper = existing.beeper.filter((e) => e.chatId !== params.chatId);
  if (beeper.length === existing.beeper.length) return;
  await writeLeadLinks(item, { beeper, googleContacts: existing.googleContacts });
}

/** Assigns a Google Contact to a lead. Denormalizes `displayName`/`phone` at assign time, same as the automatic provider (Story 104) — never the full contact. */
export async function linkGoogleContactToLead(params: {
  leadLoca: string;
  resourceName: string;
  displayName: string;
  phone: string;
}): Promise<void> {
  const item = await getLeadItemByLoca(params.leadLoca);
  const existing = await readLeadLinks(item);
  const entry: GoogleContactsLinkEntry = {
    resourceName: params.resourceName,
    displayName: params.displayName,
    phone: params.phone,
    method: "manual",
    matchedOn: "manual",
    updatedAt: new Date().toISOString(),
  };
  const { merged, addedCount } = mergeGoogleContactsEntries(existing.googleContacts, [entry]);
  if (addedCount === 0) return;
  await writeLeadLinks(item, { beeper: existing.beeper, googleContacts: merged });
}

/** Removes a Google Contact link from a lead (REMOVE drop target in the Google tab). No-ops if the contact wasn't linked to this lead. Never deletes the Google Contact itself. */
export async function unlinkGoogleContactFromLead(params: {
  leadLoca: string;
  resourceName: string;
}): Promise<void> {
  const item = await getLeadItemByLoca(params.leadLoca);
  const existing = await readLeadLinks(item);
  const googleContacts = existing.googleContacts.filter((e) => e.resourceName !== params.resourceName);
  if (googleContacts.length === existing.googleContacts.length) return;
  await writeLeadLinks(item, { beeper: existing.beeper, googleContacts });
}
