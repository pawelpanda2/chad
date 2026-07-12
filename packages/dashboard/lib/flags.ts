/**
 * Compile-time feature flags.
 *
 * `NEXT_PUBLIC_*` env vars are inlined by Next.js at BUILD time. These flags
 * default OFF in production builds, so the Dev Panel and diagnostic error
 * details are never rendered, executed, or visible in the images shipped to
 * QNAP test/prod unless explicitly enabled at build time.
 *
 * Defaults:
 *   - local `next dev` (NODE_ENV !== "production"): ON, so you get the Dev Panel
 *     and diagnostic error details without extra config.
 *   - Docker/production build (NODE_ENV === "production"): OFF, unless the build
 *     explicitly sets the env var to "true" (see the ENABLE_DEV_PANEL /
 *     ENABLE_DIAGNOSTICS build args in packages/dashboard/Dockerfile — used for
 *     a one-off "test build with Dev Panel" when requested).
 *
 * To force a state regardless of environment, set the env var explicitly to
 * "true" or "false".
 */

const isDev = process.env.NODE_ENV !== "production";

function flag(value: string | undefined): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	// Unset → default depends on environment.
	return isDev;
}

/** Whether the floating Dev Panel (request/error inspector) is mounted. */
export const DEV_PANEL_ENABLED = flag(
	process.env.NEXT_PUBLIC_ENABLE_DEV_PANEL,
);

/**
 * Whether diagnostic error details (stack traces, debug payloads, raw JSON) are
 * shown inside the standardized {@link ErrorBox}. When off, ErrorBox still shows
 * the concise error message but never the expandable diagnostic details.
 */
export const DIAGNOSTICS_ENABLED = flag(
	process.env.NEXT_PUBLIC_ENABLE_DIAGNOSTICS,
);
