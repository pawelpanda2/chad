"use client";

import { useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeeperPermissionsView } from "@/components/beeper/beeper-permissions-view";
import { BeeperConversationsView } from "@/components/beeper/beeper-conversations-view";

type ViewTab = "permissions" | "conversations";

const VIEW_OPTIONS: Array<{ value: ViewTab; label: string }> = [
	{ value: "permissions", label: "Permissions" },
	{ value: "conversations", label: "Conversations" },
];

export default function BeeperContactsPage() {
	const [view, setView] = useState<ViewTab>("permissions");
	const isPermissions = view === "permissions";

	return (
		<DashboardPageShell
			title="Beeper"
			upLevel={{ href: "/dashboard/msg-automation" }}
			scroll={isPermissions}
		>
			<div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
				<Tabs value={view} onValueChange={(v) => setView(v as ViewTab)}>
					<TabsList aria-label="Beeper view">
						{VIEW_OPTIONS.map((opt) => (
							<TabsTrigger key={opt.value} value={opt.value}>
								{opt.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{isPermissions ? (
				<BeeperPermissionsView />
			) : (
				<div className="min-h-0 flex-1 overflow-hidden">
					<BeeperConversationsView />
				</div>
			)}
		</DashboardPageShell>
	);
}
