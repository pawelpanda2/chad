import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { getPluginSynchStatus } from "@/lib/beeper-plugin-synch";

/**
 * GET /api/beeper/plugin-synch/status
 *
 * Closed endpoint — no command/path/args. Session required.
 * Local Mac + helper only; otherwise `error no connection to plugin`.
 */
export async function GET() {
	const user = await getCurrentUserFromCookies();
	if (!user) {
		return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
	}

	const result = await getPluginSynchStatus();
	const http =
		result.status === "error no connection to plugin"
			? 503
			: result.status === "failed"
				? 200
				: 200;
	return NextResponse.json(result, { status: http });
}
