/**
 * Links V2 — Google Contacts Link Provider. Uses the per-user OAuth token
 * already stored by `google-contacts-tokens.ts` (Story 103) and the raw
 * People API client in the `google-contacts` package — never copies a
 * whole contact into CHAD, only `resourceName` plus the minimal
 * `displayName`/`phone` needed to render a link in Lead Details without a
 * live People API call on every page view (see Story 104 `02_plan.md`).
 */

import {
  GoogleContactsError,
  listAllGoogleContacts,
  refreshGoogleContactsAccessToken,
  requireGoogleContactsConfig,
} from "google-contacts";
import { getGoogleContactsRefreshToken } from "../google-contacts-tokens.js";
import { normalizePhoneDigits, phoneDigitsMatch } from "./phone-utils.js";
import type { GoogleContactsLinkEntry, LinkProvider } from "./types.js";

export interface GoogleContactsCandidate {
  resourceName: string;
  displayName: string;
  /** Original display value of the first matched-able phone (for the denormalized `phone` field, not for matching). */
  phone: string;
  phoneDigits: string[];
}

export interface GoogleContactsProviderIndex {
  /** Whether the current user has connected Google Contacts at all. */
  connected: boolean;
  candidates: GoogleContactsCandidate[];
  /** Set when connected but this pass still failed (e.g. token expired) — never thrown, always reported so the sync report can surface it. */
  error?: string;
}

/** Fetches the current repo's Google Contacts once (paginated inside `listAllGoogleContacts`) and indexes them by usable phone digits. Never throws — a disconnected or failing Google account degrades to "no Google Contacts matches this run", reported via `connected`/`error`. */
export async function buildGoogleContactsIndex(): Promise<GoogleContactsProviderIndex> {
  const refreshToken = await getGoogleContactsRefreshToken();
  if (!refreshToken) return { connected: false, candidates: [] };

  try {
    const config = requireGoogleContactsConfig();
    const { accessToken } = await refreshGoogleContactsAccessToken(config, refreshToken);
    const contacts = await listAllGoogleContacts(accessToken);

    const candidates: GoogleContactsCandidate[] = [];
    for (const contact of contacts) {
      const phoneDigits = contact.phones
        .map(normalizePhoneDigits)
        .filter((p): p is string => Boolean(p));
      if (phoneDigits.length === 0) continue;
      candidates.push({
        resourceName: contact.resourceName,
        displayName: contact.displayName ?? "",
        phone: contact.phones[0] ?? "",
        phoneDigits,
      });
    }
    return { connected: true, candidates };
  } catch (error) {
    const message =
      error instanceof GoogleContactsError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return { connected: true, candidates: [], error: message };
  }
}

export const googleContactsLinkProvider: LinkProvider<GoogleContactsProviderIndex, GoogleContactsLinkEntry> = {
  id: "google-contacts",
  buildIndex: buildGoogleContactsIndex,
  findMatchesForLead(lead, index) {
    if (!index.connected || index.error || lead.phoneDigits.length === 0) return [];
    const alreadyLinked = new Set(lead.existing.googleContacts.map((e) => e.resourceName));
    const now = new Date().toISOString();
    const matches: GoogleContactsLinkEntry[] = [];
    for (const candidate of index.candidates) {
      if (alreadyLinked.has(candidate.resourceName)) continue;
      const isMatch = lead.phoneDigits.some((lp) =>
        candidate.phoneDigits.some((cp) => phoneDigitsMatch(lp, cp))
      );
      if (!isMatch) continue;
      matches.push({
        resourceName: candidate.resourceName,
        displayName: candidate.displayName,
        phone: candidate.phone,
        method: "automatic",
        matchedOn: "phone",
        updatedAt: now,
      });
    }
    return matches;
  },
};
