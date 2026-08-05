import { mapPersonToContact, type GooglePersonLike } from "./map-person.js";
import { GoogleContactsError, type GoogleContactDto, type GoogleContactsListResult } from "./types.js";

const CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections";

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,photos,organizations";

export interface ListConnectionsPageOptions {
  accessToken: string;
  pageToken?: string | null;
  pageSize?: number;
  fetchImpl?: typeof fetch;
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

  const text = await res.text();
  let json: { connections?: GooglePersonLike[]; nextPageToken?: string; error?: { status?: string; message?: string } } =
    {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new GoogleContactsError("api_error", "People API returned non-JSON.");
  }

  if (!res.ok) {
    const status = json.error?.status || `HTTP_${res.status}`;
    if (res.status === 401 || status === "UNAUTHENTICATED") {
      throw new GoogleContactsError("auth_expired", "Google access token rejected.");
    }
    // Never echo full body (may contain PII).
    throw new GoogleContactsError("api_error", `People API error (${status}).`);
  }

  const contacts: GoogleContactDto[] = [];
  for (const person of json.connections ?? []) {
    const mapped = mapPersonToContact(person);
    if (mapped) contacts.push(mapped);
  }

  return {
    contacts,
    nextPageToken: typeof json.nextPageToken === "string" && json.nextPageToken ? json.nextPageToken : null,
  };
}

/** Fetches every page. Caps safety iterations to avoid infinite loops. */
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
