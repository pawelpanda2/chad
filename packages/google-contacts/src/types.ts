/** CHAD DTO — independent of Google People API library types. */
export interface GoogleContactDto {
  resourceName: string;
  displayName: string | null;
  phones: string[];
  emails: string[];
  photoUrl: string | null;
  organizations: string[];
  /** Google contact group resource names from memberships (e.g. contactGroups/…). */
  groupResourceNames: string[];
}

export interface GoogleContactGroupDto {
  resourceName: string;
  name: string;
  /** Google groupType when present (e.g. USER_CONTACT_GROUP, SYSTEM_CONTACT_GROUP). */
  groupType: string | null;
  memberCount: number | null;
}

export interface GoogleContactsListResult {
  contacts: GoogleContactDto[];
  /** Present when more pages remain (caller should continue). */
  nextPageToken: string | null;
}

export interface GoogleContactsBundle {
  contacts: GoogleContactDto[];
  groups: GoogleContactGroupDto[];
}

export interface GoogleOAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface GoogleContactsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const GOOGLE_CONTACTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";

/** Sentinel filter id for contacts with no group memberships. */
export const GOOGLE_CONTACTS_NO_GROUP_ID = "__no_group__";

export type GoogleContactsErrorCode =
  | "not_configured"
  | "not_connected"
  | "auth_expired"
  | "auth_denied"
  | "api_error"
  | "invalid_state";

export class GoogleContactsError extends Error {
  readonly code: GoogleContactsErrorCode;
  constructor(code: GoogleContactsErrorCode, message: string) {
    super(message);
    this.name = "GoogleContactsError";
    this.code = code;
  }
}
