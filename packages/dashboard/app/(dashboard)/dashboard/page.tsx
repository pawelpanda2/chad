"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { HubGrid, HubTile } from "@/components/shared/hub-grid";

/**
 * Dashboards — the canonical landing view, first page after login (Story
 * 126). Sits above every other hub in the app hierarchy: `/dashboard` is the
 * root `←` resolves to (see `lib/dashboard-hierarchy.ts`), the sidebar
 * brand/username link's target, and the Views hub's first tile all point
 * here.
 *
 * Exactly one dashboard exists today — its tile leads to `/dashboard/forms`,
 * the app's existing logical entry point (previously what `/dashboard`
 * itself redirected to). Do not add more tiles here without a real second
 * dashboard to point at.
 */
export default function DashboardsPage() {
	const router = useRouter();

	return (
		<DashboardPageShell title="Dashboards">
			<HubGrid>
				<HubTile label="Main Dashboard" onClick={() => router.push("/dashboard/forms")} />
			</HubGrid>
		</DashboardPageShell>
	);
}
