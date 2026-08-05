/** CHAD DTO — independent of Google People API library types. */
export interface GoogleContactDto {
  resourceName: string;
  displayName: string | null;
  phones: string[];
  emails: string[];
  photoUrl: string | null;
  organizations: string[];
}

export interface GoogleContactsListResult {
  contacts: GoogleContactDto[];
  /** Present when more pages remain (caller should continue). */
  nextPageToken: string | null;
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
