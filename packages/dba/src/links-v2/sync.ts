/**
 * Links V2 — orchestrates one full sync pass for the *current* repo
 * context: matches every lead against every provider, writes changed
 * `links` items, then creates Draft Leads for any Beeper contact still
 * unmatched after all leads are processed. Used by both the manual
 * "Synchronize" button (one repo) and the daily scheduler (looped over
 * every repo — see `scheduler.ts`).
 */

import { getAllLeadsWithContacts, getLeadDetails } from "../leads.js";
import { getItemByAddress } from "../item-ops.js";
import { repoAndLocaToAddress } from "../cp-model.js";
import { getCurrentRepoGuid } from "../repo-context.js";
import { readLeadLinks, writeLeadLinks, mergeBeeperEntries, mergeGoogleContactsEntries } from "./links-item.js";
import { beeperLinkProvider } from "./beeper-provider.js";
import { googleContactsLinkProvider } from "./google-contacts-provider.js";
import { createDraftLeadFromBeeperContact } from "./draft-leads.js";
import { normalizePhoneDigits } from "./phone-utils.js";
import type { LeadMatchContext } from "./types.js";

export interface LinksV2SyncReport {
  leadsScanned: number;
  newBeeperLinks: number;
  newGoogleContactsLinks: number;
  draftLeadsCreated: string[];
  googleContactsConnected: boolean;
  googleContactsError?: string;
  errors: { leadName: string; error: string }[];
}

function collectPhones(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Runs one sync pass for whatever repo context is currently active. Callers must already be inside `runWithRepoContext(...)`. */
export async function syncLinksV2ForCurrentRepo(): Promise<LinksV2SyncReport> {
  const report: LinksV2SyncReport = {
    leadsScanned: 0,
    newBeeperLinks: 0,
    newGoogleContactsLinks: 0,
    draftLeadsCreated: [],
    googleContactsConnected: false,
    errors: [],
  };

  const [beeperIndex, googleContactsIndex] = await Promise.all([
    beeperLinkProvider.buildIndex(),
    googleContactsLinkProvider.buildIndex(),
  ]);
  report.googleContactsConnected = googleContactsIndex.connected;
  if (googleContactsIndex.error) report.googleContactsError = googleContactsIndex.error;

  const repoGuid = getCurrentRepoGuid();
  const leads = await getAllLeadsWithContacts();
  const matchedBeeperChatIds = new Set<string>();

  for (const lead of leads) {
    report.leadsScanned++;
    try {
      const address = repoAndLocaToAddress(repoGuid, lead.loca);
      const leadItem = await getItemByAddress(address);
      if (!leadItem) continue;

      const existing = await readLeadLinks(leadItem);
      for (const entry of existing.beeper) matchedBeeperChatIds.add(entry.chatId);

      let phoneDigits: string[] = [];
      try {
        const details = await getLeadDetails(lead.leadName, lead.loca);
        const rawPhones = [
          ...collectPhones(details.contacts?.phone),
          ...collectPhones(details.contacts?.whatsapp),
        ];
        phoneDigits = rawPhones
          .map(normalizePhoneDigits)
          .filter((p): p is string => Boolean(p));
      } catch {
        phoneDigits = [];
      }

      const ctx: LeadMatchContext = {
        leadName: lead.leadName,
        leadLoca: lead.loca,
        phoneDigits,
        existing,
      };

      const newBeeper = beeperLinkProvider.findMatchesForLead(ctx, beeperIndex);
      const newGoogleContacts = googleContactsLinkProvider.findMatchesForLead(ctx, googleContactsIndex);
      for (const entry of newBeeper) matchedBeeperChatIds.add(entry.chatId);

      if (newBeeper.length === 0 && newGoogleContacts.length === 0) continue;

      const { merged: mergedBeeper, addedCount: addedBeeperCount } = mergeBeeperEntries(
        existing.beeper,
        newBeeper
      );
      const { merged: mergedGoogleContacts, addedCount: addedGoogleContactsCount } = mergeGoogleContactsEntries(
        existing.googleContacts,
        newGoogleContacts
      );

      if (addedBeeperCount === 0 && addedGoogleContactsCount === 0) continue;

      await writeLeadLinks(leadItem, { beeper: mergedBeeper, googleContacts: mergedGoogleContacts });

      // Counted from the merge's actual `addedCount` (not the provider's raw
      // output length) so the report stays accurate even if a provider ever
      // proposes a candidate the lead is already linked to — dedup is a
      // property of the merge, not something every provider must get right.
      report.newBeeperLinks += addedBeeperCount;
      report.newGoogleContactsLinks += addedGoogleContactsCount;
    } catch (error) {
      report.errors.push({
        leadName: lead.leadName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Draft Leads — any Beeper contact with a phone number that no lead
  // (existing or freshly-linked above) links to yet. `matchedBeeperChatIds`
  // is updated as each draft is created, so two contacts with the same
  // name in one run still get two distinct drafts, never a duplicate for
  // the same chatId.
  const usedNames = new Set(leads.map((l) => l.leadName));
  for (const candidate of beeperIndex) {
    if (matchedBeeperChatIds.has(candidate.chatId)) continue;
    try {
      const result = await createDraftLeadFromBeeperContact(candidate, usedNames);
      matchedBeeperChatIds.add(candidate.chatId);
      if (result.created) {
        report.draftLeadsCreated.push(result.leadName);
      } else {
        report.errors.push({ leadName: result.leadName, error: result.error ?? "draft lead creation failed" });
      }
    } catch (error) {
      report.errors.push({
        leadName: "(draft lead)",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
