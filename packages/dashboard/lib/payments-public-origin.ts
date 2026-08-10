/**
 * Public origin used to build Stripe Checkout success/cancel URLs (§1.6 —
 * "bezpieczne success/cancel URLs zgodnie z aktualną konfiguracją origin
 * aplikacji"). Same precedence as googleContactsPublicOrigin: trust the
 * reverse-proxy-set forwarded headers over the raw request URL, since
 * behind Docker/nginx `request.url`'s host/port is the internal container
 * address (e.g. :3000), never what the browser actually sees.
 */
export function paymentsPublicOrigin(input: {
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  requestUrl: string;
}): string {
  if (input.forwardedProto && (input.forwardedHost || input.host)) {
    const proto = input.forwardedProto.split(",")[0].trim();
    const host = (input.forwardedHost || input.host || "").split(",")[0].trim();
    if (proto && host) {
      return `${proto}://${host}`;
    }
  }
  return new URL(input.requestUrl).origin;
}
