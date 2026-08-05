import { mapPersonToContact, type GooglePersonLike } from "./map-person.js";
import { mapContactGroup, type GoogleContactGroupLike } from "./map-group.js";
import {
  GoogleContactsError,
  type GoogleContactDto,
  type GoogleContactGroupDto,
  type GoogleContactsBundle,
  type GoogleContactsListResult,
} from "./types.js";

const CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections";
const CONTACT_GROUPS_URL = "https://people.googleapis.com/v1/contactGroups";

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,photos,organizations,memberships";
const GROUP_FIELDS = "name,groupType,memberCount";

export interface ListConnectionsPageOptions {
  accessToken: string;
  pageToken?: string | null;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}

export interface ListContactGroupsPageOptions {
  accessToken: string;
  pageToken?: string | null;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}

async function readGoogleJson(
  res: Response,
  nonJsonMessage: string,
): Promise<{ json: Record<string, unknown>; ok: boolean; status: number }> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new GoogleContactsError("api_error", nonJsonMessage);
  }
  return { json, ok: res.ok, status: res.status };
}

function throwPeopleError(json: Record<string, unknown>, status: number): never {
  const err = json.error as { status?: string } | undefined;
  const apiStatus = err?.status || `HTTP_${status}`;
  if (status === 401 || apiStatus === "UNAUTHENTICATED") {
    throw new GoogleContactsError("auth_expired", "Google access token rejected.");
  }
  throw new GoogleContactsError("api_error", `People API error (${apiStatus}).`);
}

/**
 * One page of connections. Callers that need every contact must loop on
 * `nextPageToken` until null (see `listAllGoogleContacts`).
 */
export async function listGoogleContactsPage(
  options: ListConnectionsPageOptions,
): Promise<GoogleContactsListResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    personFields: PERSON_FIELDS,
    pageSize: String(Math.min(Math.max(options.pageSize ?? 100, 1), 1000)),
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const res = await fetchImpl(`${CONNECTIONS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const { json, ok, status } = await readGoogleJson(res, "People API returned non-JSON.");
  if (!ok) throwPeopleError(json, status);

  const contacts: GoogleContactDto[] = [];
  for (const person of (json.connections as GooglePersonLike[] | undefined) ?? []) {
    const mapped = mapPersonToContact(person);
    if (mapped) contacts.push(mapped);
  }

  const next = json.nextPageToken;
  return {
    contacts,
    nextPageToken: typeof next === "string" && next ? next : null,
  };
}

/** Fetches every connections page. Caps safety iterations to avoid infinite loops. */
export async function listAllGoogleContacts(
  accessToken: string,
  options?: { fetchImpl?: typeof fetch; maxPages?: number },
): Promise<GoogleContactDto[]> {
  const maxPages = options?.maxPages ?? 50;
  const all: GoogleContactDto[] = [];
  let pageToken: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await listGoogleContactsPage({
      accessToken,
      pageToken,
      fetchImpl: options?.fetchImpl,
    });
    all.push(...page.contacts);
    if (!page.nextPageToken) return all;
    pageToken = page.nextPageToken;
  }
  throw new GoogleContactsError("api_error", "People API pagination exceeded safety page limit.");
}

export async function listGoogleContactGroupsPage(
  options: ListContactGroupsPageOptions,
): Promise<{ groups: GoogleContactGroupDto[]; nextPageToken: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    groupFields: GROUP_FIELDS,
    pageSize: String(Math.min(Math.max(options.pageSize ?? 100, 1), 1000)),
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const res = await fetchImpl(`${CONTACT_GROUPS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const { json, ok, status } = await readGoogleJson(res, "People API contactGroups returned non-JSON.");
  if (!ok) throwPeopleError(json, status);

  const groups: GoogleContactGroupDto[] = [];
  for (const g of (json.contactGroups as GoogleContactGroupLike[] | undefined) ?? []) {
    const mapped = mapContactGroup(g);
    if (mapped) groups.push(mapped);
  }
  const next = json.nextPageToken;
  return {
    groups,
    nextPageToken: typeof next === "string" && next ? next : null,
  };
}

export async function listAllGoogleContactGroups(
  accessToken: string,
  options?: { fetchImpl?: typeof fetch; maxPages?: number },
): Promise<GoogleContactGroupDto[]> {
  const maxPages = options?.maxPages ?? 20;
  const all: GoogleContactGroupDto[] = [];
  let pageToken: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await listGoogleContactGroupsPage({
      accessToken,
      pageToken,
      fetchImpl: options?.fetchImpl,
    });
    all.push(...page.groups);
    if (!page.nextPageToken) return all;
    pageToken = page.nextPageToken;
  }
  throw new GoogleContactsError("api_error", "People API contactGroups pagination exceeded safety page limit.");
}

/** Contacts (with memberships) + contact groups in parallel. */
export async function listGoogleContactsBundle(
  accessToken: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<GoogleContactsBundle> {
  const [contacts, groups] = await Promise.all([
    listAllGoogleContacts(accessToken, { fetchImpl: options?.fetchImpl }),
    listAllGoogleContactGroups(accessToken, { fetchImpl: options?.fetchImpl }),
  ]);
  return { contacts, groups };
}
