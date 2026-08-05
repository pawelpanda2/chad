import {
  GOOGLE_CONTACTS_NO_GROUP_ID,
  type GoogleContactDto,
} from "./types.js";

export interface GoogleContactsFilterOptions {
  /** Case-insensitive substring match against name, phones, emails. Empty = no search filter. */
  query?: string;
  /**
   * Enabled group resource names and/or `GOOGLE_CONTACTS_NO_GROUP_ID`.
   * Empty selection ⇒ no contacts.
   * A labeled contact is shown only when every one of its pill-group
   * memberships is still enabled (deselecting a label hides all contacts
   * that carry that label). Ungrouped contacts require `__no_group__`.
   */
  selectedGroupIds?: readonly string[];
  /**
   * Resource names shown as group pills (used for — no group — semantics).
   * A contact is ungrouped when it has no membership in any of these.
   */
  pillGroupIds?: readonly string[];
}

function normalizeQuery(query: string | undefined): string {
  return (query ?? "").trim().toLowerCase();
}

export function contactMatchesSearch(contact: GoogleContactDto, query: string | undefined): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  if ((contact.displayName ?? "").toLowerCase().includes(q)) return true;
  for (const phone of contact.phones) {
    if (phone.toLowerCase().includes(q)) return true;
  }
  for (const email of contact.emails) {
    if (email.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function contactMatchesNoGroup(
  contact: GoogleContactDto,
  pillGroupIds: readonly string[] | undefined,
): boolean {
  const groups = contact.groupResourceNames ?? [];
  if (!pillGroupIds || pillGroupIds.length === 0) {
    return groups.length === 0;
  }
  const pills = new Set(pillGroupIds);
  return !groups.some((g) => pills.has(g));
}

/**
 * Opt-out group filter: pills start enabled; disabling a pill hides every
 * contact that has that label. Empty `selectedGroupIds` ⇒ match nothing.
 */
export function contactMatchesGroupFilter(
  contact: GoogleContactDto,
  selectedGroupIds: readonly string[] | undefined,
  pillGroupIds?: readonly string[],
): boolean {
  if (!selectedGroupIds || selectedGroupIds.length === 0) return false;
  const selected = new Set(selectedGroupIds);
  const pills = new Set(pillGroupIds ?? []);

  if (contactMatchesNoGroup(contact, pillGroupIds)) {
    return selected.has(GOOGLE_CONTACTS_NO_GROUP_ID);
  }

  const contactPillGroups = (contact.groupResourceNames ?? []).filter((g) => pills.has(g));
  if (contactPillGroups.length === 0) {
    // No pill groups configured / memberships only outside pills.
    return selected.has(GOOGLE_CONTACTS_NO_GROUP_ID);
  }
  return contactPillGroups.every((g) => selected.has(g));
}

/** Local filter — no Google API calls. Search AND group filters combine. */
export function filterGoogleContacts(
  contacts: readonly GoogleContactDto[],
  options: GoogleContactsFilterOptions = {},
): GoogleContactDto[] {
  return contacts.filter(
    (c) =>
      contactMatchesSearch(c, options.query) &&
      contactMatchesGroupFilter(c, options.selectedGroupIds, options.pillGroupIds),
  );
}

/** Groups suitable as filter pills — exclude universal system buckets. */
export function isGoogleContactsPillGroup(resourceName: string): boolean {
  return resourceName !== "contactGroups/myContacts" && resourceName !== "contactGroups/all";
}
