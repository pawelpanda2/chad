"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeeperPermissionsView } from "@/components/beeper/beeper-permissions-view";
import { BeeperConversationsView } from "@/components/beeper/beeper-conversations-view";
import { MsgWorkoutReviewView } from "@/components/beeper/msg-workout-review-view";
import { BeeperGroupsView } from "@/components/beeper/beeper-groups-view";
import { BeeperGroupFilter } from "@/components/beeper/beeper-group-filter";

type ViewTab = "conversations" | "permissions" | "msg-workout" | "groups";

const VIEW_OPTIONS: Array<{ value: ViewTab; label: string }> = [
	{ value: "conversations", label: "Conversations" },
	{ value: "permissions", label: "Permissions" },
	{ value: "msg-workout", label: "Msg workout" },
	{ value: "groups", label: "Groups" },
];

function isViewTab(value: string | null): value is ViewTab {
	return value === "conversations" || value === "permissions" || value === "msg-workout" || value === "groups";
}

/**
 * Reads/writes `?tab=&contact=&group=` so a hard refresh (or a copy-pasted
 * link) restores which tab, which open conversation, and which group
 * filter you were on.
 *
 * Query params, not a `/dashboard/beeper/[id]` path segment: that exact
 * dynamic route already exists for a different, older feature (the
 * full-page contact profile/merge editor, still linked from Msg Auto →
 * Links) — reusing it here would collide with that route's own meaning.
 *
 * `group` (Story 101): filters Conversations/Permissions/Msg workout's
 * contact lists to one contact group, or "All groups" to clear it. The
 * "Groups" tab itself (bulk assignment) intentionally ignores this filter
 * — it's a management view over every contact, not a filtered read.
 */
function BeeperContactsPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [groupsRefreshKey, setGroupsRefreshKey] = useState(0);

	const tabParam = searchParams.get("tab");
	const view: ViewTab = isViewTab(tabParam) ? tabParam : "conversations";
	const contactParam = searchParams.get("contact") ?? undefined;
	const groupParam = searchParams.get("group") ?? undefined;
	const isPermissions = view === "permissions";
	const isGroups = view === "groups";

	const updateUrl = useCallback(
		(nextView: ViewTab, nextContact?: string, nextGroup?: string) => {
			const params = new URLSearchParams();
			if (nextView !== "conversations") params.set("tab", nextView);
			if (nextContact) params.set("contact", nextContact);
			if (nextGroup) params.set("group", nextGroup);
			const qs = params.toString();
			router.replace(`/dashboard/beeper${qs ? `?${qs}` : ""}`, { scroll: false });
		},
		[router]
	);

	const handleTabChange = useCallback(
		(v: string) => {
			// Switching tabs clears the open conversation but keeps the group filter.
			updateUrl(v as ViewTab, undefined, groupParam);
		},
		[updateUrl, groupParam]
	);

	const handleSelectContact = useCallback(
		(id: string | null) => {
			updateUrl(view, id ?? undefined, groupParam);
		},
		[updateUrl, view, groupParam]
	);

	const handleGroupChange = useCallback(
		(groupId: string | undefined) => {
			// Changing the group filter drops the currently open conversation —
			// it may not even be in the new group.
			updateUrl(view, undefined, groupId);
		},
		[updateUrl, view]
	);

	return (
		<DashboardPageShell
			title="Beeper"
			upLevel={{ href: "/dashboard/msg-automation" }}
			scroll={isPermissions || isGroups}
		>
			<div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
				<Tabs value={view} onValueChange={handleTabChange}>
					<TabsList aria-label="Beeper view">
						{VIEW_OPTIONS.map((opt) => (
							<TabsTrigger key={opt.value} value={opt.value}>
								{opt.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{!isGroups && (
				// Groups tab has its own per-group toggle filters in its own second
				// row instead (beeper-groups-view.tsx) — this row is only for the
				// other three tabs, which all share the same "All groups" combobox.
				<div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
					<BeeperGroupFilter value={groupParam} onChange={handleGroupChange} refreshKey={groupsRefreshKey} />
				</div>
			)}

			{isPermissions ? (
				<BeeperPermissionsView groupFilter={groupParam} />
			) : isGroups ? (
				<BeeperGroupsView onGroupsChanged={() => setGroupsRefreshKey((k) => k + 1)} />
			) : (
				<div className="min-h-0 flex-1 overflow-hidden">
					{view === "conversations" ? (
						<BeeperConversationsView
							initialContactId={contactParam}
							onSelectContact={handleSelectContact}
							groupFilter={groupParam}
						/>
					) : (
						<MsgWorkoutReviewView
							initialContactId={contactParam}
							onSelectContact={handleSelectContact}
							groupFilter={groupParam}
						/>
					)}
				</div>
			)}
		</DashboardPageShell>
	);
}

export default function BeeperContactsPage() {
	return (
		<Suspense fallback={null}>
			<BeeperContactsPageInner />
		</Suspense>
	);
}
