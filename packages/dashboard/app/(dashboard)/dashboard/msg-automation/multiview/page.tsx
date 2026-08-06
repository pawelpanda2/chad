"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	BeeperPermissionsView,
	PERM_FILTER_OPTIONS,
	type PermissionFilter,
} from "@/components/beeper/beeper-permissions-view";
import { BeeperConversationsView } from "@/components/beeper/beeper-conversations-view";
import { MsgWorkoutReviewView } from "@/components/beeper/msg-workout-review-view";
import { BeeperGroupsView, type GroupsSubTab } from "@/components/beeper/beeper-groups-view";
import { BeeperGroupFilter } from "@/components/beeper/beeper-group-filter";

type ViewTab = "conversations" | "permissions" | "groups" | "msg-workout";

const VIEW_OPTIONS: Array<{ value: ViewTab; label: string }> = [
	{ value: "conversations", label: "Conversations" },
	{ value: "permissions", label: "Permissions" },
	{ value: "groups", label: "Groups" },
	{ value: "msg-workout", label: "Msg workout" },
];

function isViewTab(value: string | null): value is ViewTab {
	return value === "conversations" || value === "permissions" || value === "msg-workout" || value === "groups";
}

/**
 * Reads/writes `?tab=&contact=&group=` so a hard refresh (or a copy-pasted
 * link) restores which tab, which open conversation, and which group
 * filter you were on.
 *
 * Hosted under Msg Auto → MultiView (Story 105). Dedicated Beeper page is
 * `/dashboard/beeper` (Conv + Settings only). Legacy `/dashboard/beeper?tab=`
 * for permissions/groups/msg-workout redirects here.
 *
 * Layout: the Beeper frame always fits the available viewport height —
 * `scroll={false}` on DashboardPageShell, no main/page vertical scrollbar.
 * Height for the chat panes is recovered by collapsing the in-frame
 * tabs/filters (`toolbarLeading` chevron → `isViewToolbarCollapsed`), not
 * by scrolling them away. Conversations / Msg workout use `flex-1 min-h-0`
 * and keep their own panel scrollbars (list / conversation / workout).
 * Permissions / Groups scroll inside their own `flex-1` pane when the
 * table is tall. Do not reintroduce the old `h-full shrink-0` "oversized
 * split-view" trick that forced a shell scrollbar.
 *
 * `group` (Story 101): filters Conversations/Permissions/Msg workout to one
 * contact group, or "All groups"/"— no group —" for everyone/ungrouped.
 * The Groups tab has its own, finer-grained per-group toggle pills instead
 * (see beeper-groups-view.tsx). On first load with no `?group=` in the URL,
 * the user's default group (Groups → Manage) is applied — see the one-time
 * effect below.
 *
 * Row 2 (All groups + Search) hides on mobile once a conversation is open
 * (`hasOpenConversation`). Kept visible on desktop (`md:flex`).
 *
 * `contactsCount` (Permissions/Groups→List): inline at the end of row 2.
 */
function BeeperContactsPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [groupsRefreshKey, setGroupsRefreshKey] = useState(0);
	const [groupsSubTab, setGroupsSubTab] = useState<GroupsSubTab>("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [permFilter, setPermFilter] = useState<PermissionFilter>("all");
	const [contactsCount, setContactsCount] = useState<number | null>(null);
	/** Hides only the in-frame tabs/filters block (not NavGroup / title / panels). */
	const [isViewToolbarCollapsed, setIsViewToolbarCollapsed] = useState(false);
	const appliedDefaultGroupRef = useRef(false);

	const toggleViewToolbar = useCallback(() => {
		setIsViewToolbarCollapsed((collapsed) => !collapsed);
	}, []);

	const tabParam = searchParams.get("tab");
	const view: ViewTab = isViewTab(tabParam) ? tabParam : "conversations";
	const contactParam = searchParams.get("contact") ?? undefined;
	const groupParam = searchParams.get("group") ?? undefined;
	const isPermissions = view === "permissions";
	const isGroups = view === "groups";
	const hasOpenConversation = !isGroups && Boolean(contactParam);

	const updateUrl = useCallback(
		(nextView: ViewTab, nextContact?: string, nextGroup?: string) => {
			const params = new URLSearchParams();
			if (nextView !== "conversations") params.set("tab", nextView);
			if (nextContact) params.set("contact", nextContact);
			if (nextGroup) params.set("group", nextGroup);
			const qs = params.toString();
			router.replace(`/dashboard/msg-automation/multiview${qs ? `?${qs}` : ""}`, { scroll: false });
		},
		[router]
	);

	const handleTabChange = useCallback(
		(v: string) => {
			setSearchQuery("");
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

	// One-time: apply the user's default group (Groups → Manage) instead of
	// "All groups" when there's no explicit `?group=` in the URL at all — but
	// only once on mount, so manually picking "All groups" afterward sticks
	// for the rest of the session (see doc comment above).
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (appliedDefaultGroupRef.current) return;
		appliedDefaultGroupRef.current = true;
		if (searchParams.get("group")) return;
		fetch("/api/beeper-crm/groups/default")
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?._id) updateUrl(view, contactParam, data._id);
			})
			.catch(() => {});
	}, []);

	const handleGroupChange = useCallback(
		(groupId: string | undefined) => {
			// Changing the group filter drops the currently open conversation —
			// it may not even be in the new group.
			updateUrl(view, undefined, groupId);
		},
		[updateUrl, view]
	);

	const searchField = (
		<div className="relative">
			<Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder="Search"
				className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
				value={searchQuery}
				onChange={(e) => setSearchQuery(e.target.value)}
				aria-label="Search contacts"
			/>
		</div>
	);

	// Same visual recipe as the fixed sidebar menu handle in
	// app/(dashboard)/layout.tsx — size/border/radius/hover/icon — but
	// in-flow (not `fixed`), so it sits between that handle and Back.
	const viewToolbarToggle = (
		<button
			type="button"
			onClick={toggleViewToolbar}
			aria-label={isViewToolbarCollapsed ? "Pokaż pasek widoku MultiView" : "Ukryj pasek widoku MultiView"}
			aria-expanded={!isViewToolbarCollapsed}
			title={isViewToolbarCollapsed ? "Pokaż pasek widoku" : "Ukryj pasek widoku"}
			className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
		>
			{isViewToolbarCollapsed ? (
				<ChevronDown className="h-5 w-5" />
			) : (
				<ChevronUp className="h-5 w-5" />
			)}
		</button>
	);

	return (
		<DashboardPageShell
			title="MultiView"
			upLevel={{ href: "/dashboard/msg-automation" }}
			scroll={false}
			toolbarLeading={viewToolbarToggle}
		>
			{/* Tabs + filters INSIDE the frame (Daily Tracker convention). Hidden
			    via `toolbarLeading` chevron — that is how height is recovered;
			    there is no shell/page vertical scrollbar. */}
			{!isViewToolbarCollapsed && (
			<div className="mb-1.5 flex w-full shrink-0 flex-col gap-1.5">
				<Tabs value={view} onValueChange={handleTabChange}>
					<TabsList aria-label="MultiView tabs">
						{VIEW_OPTIONS.map((opt) => (
							<TabsTrigger key={opt.value} value={opt.value}>
								{opt.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<div
					className={cn(
						"flex-wrap items-center gap-2",
						hasOpenConversation ? "hidden md:flex" : "flex"
					)}
				>
					{!isGroups && (
						<BeeperGroupFilter value={groupParam} onChange={handleGroupChange} refreshKey={groupsRefreshKey} />
					)}
					{isGroups && (
						<Tabs value={groupsSubTab} onValueChange={(v) => setGroupsSubTab(v as GroupsSubTab)}>
							<TabsList aria-label="Groups view">
								<TabsTrigger value="list">List</TabsTrigger>
								<TabsTrigger value="manage">Manage</TabsTrigger>
							</TabsList>
						</Tabs>
					)}
					{searchField}
					{isPermissions && (
						<select
							className="h-10 w-[110px] rounded-[9px] border border-border bg-background px-2 text-sm"
							value={permFilter}
							onChange={(e) => setPermFilter(e.target.value as PermissionFilter)}
							aria-label="Permission filter"
						>
							{PERM_FILTER_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					)}
					{(isPermissions || (isGroups && groupsSubTab === "list")) && contactsCount !== null && (
						<span className="text-sm text-muted-foreground">{contactsCount} items</span>
					)}
				</div>
			</div>
			)}

			{isPermissions ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<BeeperPermissionsView
						groupFilter={groupParam}
						query={searchQuery}
						onQueryChange={setSearchQuery}
						permFilter={permFilter}
						onCountChange={setContactsCount}
					/>
				</div>
			) : isGroups ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<BeeperGroupsView
						onGroupsChanged={() => setGroupsRefreshKey((k) => k + 1)}
						subTab={groupsSubTab}
						query={searchQuery}
						onQueryChange={setSearchQuery}
						onCountChange={setContactsCount}
					/>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-hidden">
					{view === "conversations" ? (
						<BeeperConversationsView
							initialContactId={contactParam}
							onSelectContact={handleSelectContact}
							groupFilter={groupParam}
							query={searchQuery}
							onQueryChange={setSearchQuery}
						/>
					) : (
						<MsgWorkoutReviewView
							initialContactId={contactParam}
							onSelectContact={handleSelectContact}
							groupFilter={groupParam}
							query={searchQuery}
							onQueryChange={setSearchQuery}
						/>
					)}
				</div>
			)}
		</DashboardPageShell>
	);
}

export default function MultiViewPage() {
	return (
		<Suspense fallback={null}>
			<BeeperContactsPageInner />
		</Suspense>
	);
}
