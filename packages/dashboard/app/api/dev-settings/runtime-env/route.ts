import { NextResponse } from "next/server";
import { isLocalRuntime } from "@/lib/dev-panel/is-local-runtime";

/**
 * GET /api/dev-settings/runtime-env — the LOCAL-only history debug
 * combobox's hard guard (Story 126). Unlike the other `dev-settings` routes,
 * this one never 403s: it's meant to answer "am I local" truthfully on
 * every environment (false on TEST/PROD), not gate an action.
 */
export async function GET() {
	return NextResponse.json({ isLocal: isLocalRuntime() });
}
