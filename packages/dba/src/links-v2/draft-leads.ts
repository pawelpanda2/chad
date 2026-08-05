/**
 * Links V2 — Draft Lead creation. A Draft Lead is an ordinary lead (created
 * via the existing `createLead()`, same as a human-created one) with
 * `draft: true` on its Folder's `config` — `config` is a free-form
 * pass-through field on both the read/write paths (confirmed by the
 * Folder `sorting` feature), so this needs no schema change. `draft` is a
 * bookkeeping flag, not link data, so storing it in config does not
 * violate the "never store link info in config" rule from the Story 104
 * spec — the actual Beeper/Google Contacts links still only ever live in
 * the lead's `links` Text Item.
 */

import yaml from "js-yaml";
import { createLead } from "../leads.js";
import { getItemByAddress, putItemConfig } from "../item-ops.js";
import { repoAndLocaToAddress } from "../cp-model.js";
import { getCurrentRepoGuid } from "../repo-context.js";
import { writeLeadLinks } from "./links-item.js";
import type { BeeperContactPhoneCandidate } from "./beeper-provider.js";

function slugifyNamePart(value: string): string {
  return value
    .replace(/[Łł]/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function todayDatePrefix(now: Date): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Builds a unique `YY-MM-DD_dl_<name-or-phone>` lead name for a Draft Lead
 * — `dl` marks it as a system-generated draft, following the same
 * `<date>_<code>_<person>` shape existing leads use. Collision-suffixed
 * against `usedNames` (mutated in place) so two contacts that slugify to
 * the same base in one sync run never collide.
 */
export function buildDraftLeadName(
  candidate: { displayName: string; phoneDigits: string[] },
  usedNames: Set<string>,
  now: Date = new Date()
): string {
  const base = slugifyNamePart(candidate.displayName) || candidate.phoneDigits[0] || "unknown";
  const prefix = `${todayDatePrefix(now)}_dl_${base}`;
  let name = prefix;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${prefix}_${suffix}`;
    suffix++;
  }
  usedNames.add(name);
  return name;
}

export interface DraftLeadCreationResult {
  created: boolean;
  leadName: string;
  error?: string;
}

/**
 * Creates one Draft Lead for a Beeper contact that no existing lead links
 * to, pre-filled with its name/phone, then immediately writes its own
 * `links` item pointing back at that chat. That immediate write is what
 * makes the no-duplicate-draft guarantee self-sustaining — the next sync
 * pass sees the chatId as already linked (to this new lead) and never
 * creates a second draft for it (see `sync.ts`).
 */
export async function createDraftLeadFromBeeperContact(
  candidate: BeeperContactPhoneCandidate,
  usedNames: Set<string>
): Promise<DraftLeadCreationResult> {
  const leadName = buildDraftLeadName(candidate, usedNames);

  const contactsObj: Record<string, string> = {};
  if (candidate.displayName) contactsObj.name = candidate.displayName;
  if (candidate.phoneDigits[0]) contactsObj.phone = candidate.phoneDigits[0];
  const contactsYaml = Object.keys(contactsObj).length > 0 ? yaml.dump(contactsObj) : "";

  const result = await createLead(leadName, contactsYaml);
  if (!result.success || !result.leadLoca) {
    return { created: false, leadName, error: result.error ?? "createLead failed" };
  }

  const address = repoAndLocaToAddress(getCurrentRepoGuid(), result.leadLoca);
  const leadItem = await getItemByAddress(address);
  if (!leadItem) {
    return { created: false, leadName, error: "lead created but not found immediately after" };
  }

  await putItemConfig({ ...leadItem, config: { ...leadItem.config, draft: true } });
  await writeLeadLinks(leadItem, {
    beeper: [
      {
        chatId: candidate.chatId,
        type: candidate.type,
        method: "automatic",
        matchedOn: "phone",
        updatedAt: new Date().toISOString(),
      },
    ],
    googleContacts: [],
  });

  return { created: true, leadName };
}
