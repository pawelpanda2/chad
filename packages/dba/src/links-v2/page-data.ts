/**
 * Links V2 — GUI page data. Reads only the already-stored `links` items —
 * never triggers provider matching itself ("Nie wykonuj pełnego skanu przy
 * każdym wejściu do strony" — Story 104 spec §3). Matching only happens via
 * `syncLinksV2ForCurrentRepo()`, called from the Synchronize button or the
 * daily scheduler.
 */

import { getAllLeadsWithContacts } from "../leads.js";
import { getItemByAddress } from "../item-ops.js";
import { repoAndLocaToAddress } from "../cp-model.js";
import { getCurrentRepoGuid } from "../repo-context.js";
import { readLeadLinks } from "./links-item.js";
import type { LeadLinksData } from "./types.js";

export interface LinksV2LeadSummary {
  leadKey: string;
  leadName: string;
  loca: string;
  draft: boolean;
  links: LeadLinksData;
}

export async function getLinksV2PageLeads(): Promise<LinksV2LeadSummary[]> {
  const repoGuid = getCurrentRepoGuid();
  const leads = await getAllLeadsWithContacts();
  return Promise.all(
    leads.map(async (lead) => {
      const address = repoAndLocaToAddress(repoGuid, lead.loca);
      const leadItem = await getItemByAddress(address);
      const links = leadItem ? await readLeadLinks(leadItem) : { beeper: [], googleContacts: [] };
      return { leadKey: lead.leadKey, leadName: lead.leadName, loca: lead.loca, draft: lead.draft, links };
    })
  );
}

/** A single lead's already-stored Links V2 links, by `loca` — used by consumers outside the Links V2 page itself (e.g. Message Creator's conversation resolver) that need one lead's links without listing every lead. `{ beeper: [], googleContacts: [] }` when the lead has no `links` item yet. */
export async function getLeadLinksV2ByLoca(loca: string): Promise<LeadLinksData> {
  const repoGuid = getCurrentRepoGuid();
  const address = repoAndLocaToAddress(repoGuid, loca);
  const leadItem = await getItemByAddress(address);
  if (!leadItem) return { beeper: [], googleContacts: [] };
  return readLeadLinks(leadItem);
}
