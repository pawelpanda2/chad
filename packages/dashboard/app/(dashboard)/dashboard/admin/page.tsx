"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/**
 * Admin hub — same button-grid pattern as Msg Auto/Knowledge: a single
 * sidebar entry (under "Others"), this page is just the entry point to
 * Users/Payments, which keep their own routes/pages.
 */
export default function AdminHubPage() {
	const router = useRouter();

	return (
		<DashboardPageShell title="Admin">
			<div className="grid grid-cols-4 gap-2">
				<button
					type="button"
					onClick={() => router.push("/dashboard/admin/users")}
					className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
				>
					<span className="font-semibold text-sm">USERS</span>
				</button>
				<button
					type="button"
					onClick={() => router.push("/dashboard/admin/payments")}
					className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
				>
					<span className="font-semibold text-sm">PAYMENTS</span>
				</button>
			</div>
		</DashboardPageShell>
	);
}
