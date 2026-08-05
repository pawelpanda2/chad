/**
 * Public origin for OAuth callback redirects. Prefer GOOGLE_CONTACTS_REDIRECT_URI
 * so Docker/internal request.url (e.g. :3000) never leaks into browser Location.
 */
export function googleContactsPublicOrigin(input: {
  redirectUriEnv?: string | null;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  requestUrl: string;
}): string {
  const configured = input.redirectUriEnv?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  if (input.forwardedProto && (input.forwardedHost || input.host)) {
    const proto = input.forwardedProto.split(",")[0].trim();
    const host = (input.forwardedHost || input.host || "").split(",")[0].trim();
    if (proto && host) return `${proto}://${host}`;
  }
  return new URL(input.requestUrl).origin;
}
