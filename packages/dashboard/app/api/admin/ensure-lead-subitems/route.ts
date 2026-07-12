import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * POST /api/admin/ensure-lead-subitems
 *
 * Backfills the standard sub-items ("contacts" + "msg workout") for EVERY lead,
 * via the dba public function `ensureAllLeadsSubItems` (find-or-create,
 * idempotent). Thin adapter: auth → runWithRepoContext → dba → JSON. No raw
 * Content Provider access here.
 */
export async function POST() {
	const user = await getCurrentUserFromCookies();
	if (!user) {
		return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
	}

	try {
		const { ensureAllLeadsSubItems, runWithRepoContext } = await import("dba");
		const result = await runWithRepoContext(user, () =>
			ensureAllLeadsSubItems(),
		);
		return NextResponse.json({ success: true, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[/api/admin/ensure-lead-subitems] ERROR:", message);
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
