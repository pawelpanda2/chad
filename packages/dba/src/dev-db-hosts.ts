/** Shared Tailscale / local host ports for Dev Panel + sync (Story 83/89). */

export const QNAP_TAILSCALE_HOST = "100.117.139.83";
/** chad-mongodb's diagnostic port — CHAD's own legacy Mongo (removed 2026-07-27); kept only so a historical connection/backup can still be described. */
export const QNAP_MONGO_PORT = "12040";
/** beeper-mongodb's diagnostic port — the ONLY active Mongo in CHAD's runtime. */
export const QNAP_BEEPER_MONGO_PORT = "12041";
export const QNAP_POSTGRES_PORT = "12042";
/** Host-published port of `chad-postgres-local-mac-docker`. */
export const LOCAL_POSTGRES_HOST_PORT = "5433";
