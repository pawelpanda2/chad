import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { startPluginSynch } from "@/lib/beeper-plugin-synch";

/**
 * POST /api/beeper/plugin-synch/start
 *
 * Closed endpoint — ignores body. Session required.
 * Runs one fixed operation via the local loopback helper (official restart.sh).
 * Never accepts shell commands, paths, or script names from the client.
 */
export async function POST() {
	const user = await getCurrentUserFromCookies();
	if (!user) {
		return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
	}

	const result = await startPluginSynch();
	const http =
		result.status === "error no connection to plugin"
			? 503
			: result.status === "failed"
				? 500
				: 200;
	return NextResponse.json(result, { status: http });
}
