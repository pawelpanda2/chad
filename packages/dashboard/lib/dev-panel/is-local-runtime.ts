/**
 * Server-only "are we running LOCAL" check (Story 126). Same condition
 * already inlined independently in `app/api/dev-settings/db-source/route.ts`,
 * `sync-local-postgres/route.ts`, and `app/api/dev-panel/payments-events/route.ts`
 * (`assertDevOnly`) — factored out here so the LOCAL-only history-debug
 * combobox gate (which must never show on TEST/PROD, even with its Dev Panel
 * toggle on) reads the exact same runtime signal instead of a 4th inline
 * copy. Reads server-only `process.env.CHAD_ENVIRONMENT` — never inlined at
 * build time (`NEXT_PUBLIC_*`), since this repo's Docker images are reused
 * across local/test/prod with the environment supplied at deploy time.
 */
export function isLocalRuntime(): boolean {
	const chadEnv = process.env.CHAD_ENVIRONMENT;
	return chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
}
