/**
 * Links V2 (Story 104) — Lead ↔ external-source links.
 *
 * Separate from, and independent of, the old Links module
 * (`lead-beeper-links.ts`, Story 90) — that module stores lead↔conversation
 * links in the Beeper Mongo database and is left untouched. Links V2 stores
 * its links as a `links` Text Item (YAML body) inside each lead's own
 * cp_item folder instead — never in item config, never in the Beeper
 * database.
 */

export interface BeeperLinkEntry {
  chatId: string;
  type: string;
  method: "automatic" | "manual";
  /** "manual" — GUI drag & drop assign (Story 104 GUI redesign); "phone" — automatic provider match. */
  matchedOn: "phone" | "manual";
  updatedAt: string;
}

export interface GoogleContactsLinkEntry {
  resourceName: string;
  displayName: string;
  phone: string;
  method: "automatic" | "manual";
  /** "manual" — GUI drag & drop assign (Story 104 GUI redesign); "phone" — automatic provider match. */
  matchedOn: "phone" | "manual";
  updatedAt: string;
}

export interface LeadLinksData {
  beeper: BeeperLinkEntry[];
  googleContacts: GoogleContactsLinkEntry[];
}

export const EMPTY_LEAD_LINKS: LeadLinksData = { beeper: [], googleContacts: [] };

/** One phone-matchable lead, as seen by a Link Provider. */
export interface LeadMatchContext {
  leadName: string;
  leadLoca: string;
  /** Digits-only phone numbers already extracted from the lead's `contacts` item. */
  phoneDigits: string[];
  /** Existing links for this lead — providers use these to skip already-linked candidates. */
  existing: LeadLinksData;
}

/**
 * A Link Provider matches leads against one external source (Beeper,
 * Google Contacts, ...) and reports back new entries to merge into a
 * lead's `links` item. `findMatchesForLead` must be pure with respect to
 * its own already-fetched-once `index` — no per-lead network/DB calls, so
 * a sync pass over N leads costs O(1) external calls per provider, not
 * O(N). Extending Links V2 with a new source means adding one more
 * provider here (`Lead → Link Provider → Beeper Provider → Google Contacts
 * Provider → future providers`, per the Story 104 spec).
 */
export interface LinkProvider<TIndex, TEntry> {
  id: string;
  /** Fetch this provider's candidate data once per sync pass (not per lead). */
  buildIndex(): Promise<TIndex>;
  /** Pure match against the already-built index — no I/O. */
  findMatchesForLead(lead: LeadMatchContext, index: TIndex): TEntry[];
}
