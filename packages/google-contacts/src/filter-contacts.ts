import {
  GOOGLE_CONTACTS_NO_GROUP_ID,
  type GoogleContactDto,
} from "./types.js";

export interface GoogleContactsFilterOptions {
  /** Case-insensitive substring match against name, phones, emails. Empty = no search filter. */
  query?: string;
  /**
   * Selected group resource names and/or `GOOGLE_CONTACTS_NO_GROUP_ID`.
   * Empty / undefined = all contacts (search may still apply).
   * Multiple selections = OR (contact in any selected group, or no-group).
   */
  selectedGroupIds?: readonly string[];
  /**
   * Resource names shown as group pills (used for — no group — semantics).
   * A contact matches no-group when it has no membership in any of these.
   * Defaults to: empty memberships only, when omitted.
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

export function contactMatchesGroupFilter(
  contact: GoogleContactDto,
  selectedGroupIds: readonly string[] | undefined,
  pillGroupIds?: readonly string[],
): boolean {
  if (!selectedGroupIds || selectedGroupIds.length === 0) return true;
  const groups = contact.groupResourceNames ?? [];
  for (const id of selectedGroupIds) {
    if (id === GOOGLE_CONTACTS_NO_GROUP_ID) {
      if (contactMatchesNoGroup(contact, pillGroupIds)) return true;
      continue;
    }
    if (groups.includes(id)) return true;
  }
  return false;
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
