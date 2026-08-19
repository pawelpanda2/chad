"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { HubGrid, HubTile } from "@/components/shared/hub-grid";

/**
 * Admin hub — same button-grid pattern as Msg Auto/Knowledge: a single
 * sidebar entry (under "Others"), this page is just the entry point to
 * Users/Payments/Licenses/Examples, which keep their own routes/pages.
 */
export default function AdminHubPage() {
	const router = useRouter();

	return (
		<DashboardPageShell title="Admin">
			<HubGrid>
				<HubTile label="USERS" onClick={() => router.push("/dashboard/admin/users")} />
				<HubTile label="PAYMENTS" onClick={() => router.push("/dashboard/admin/payments")} />
				<HubTile label="LICENSES" onClick={() => router.push("/dashboard/admin/licenses")} />
				<HubTile label="EXAMPLES" onClick={() => router.push("/dashboard/admin/examples")} />
			</HubGrid>
		</DashboardPageShell>
	);
}
