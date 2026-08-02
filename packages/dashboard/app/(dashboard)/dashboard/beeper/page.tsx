"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
 * Query params, not a `/dashboard/beeper/[id]` path segment: that exact
 * dynamic route already exists for a different, older feature (the
 * full-page contact profile/merge editor, still linked from Msg Auto →
 * Links) — reusing it here would collide with that route's own meaning.
 *
 * Layout (responsive-layout-standard, matches Daily Tracker's own
 * above-the-table filter row — packages/dashboard/app/(dashboard)/dashboard/
 * views/page.tsx, Story 62 Round 3/6): tabs + All groups + Search render as
 * plain children INSIDE the DashboardPageShell frame (never via `toolbar`/
 * `toolbarSecondRow`, which sit outside it and never scroll) — the standard
 * shell frame owns the frame + scrollbar for Permissions/Groups (plain
 * tables, no internal scroll of their own — scrolling the shell far enough
 * already scrolls the tabs out of view there).
 *
 * Conversations/Msg workout are different: their contact list and
 * conversation pane each keep their OWN independent scrollbar (see
 * ai-docs/gui-standard/ai-start.md, "split-view with collapsing header") —
 * a chat-style split view needs that, unlike a plain table. On top of that,
 * the wrapper around the split-view (`h-full shrink-0` — NOT `flex-1
 * min-h-0`) is deliberately sized to the shell's *full* content height
 * regardless of the tabs+filter block above it, instead of only "whatever
 * space is left". That makes the shell's own scroll content taller than its
 * viewport by exactly the tabs+filter block's height, so the shell's own
 * (real, native) scrollbar can smoothly scroll that block out of view —
 * scroll down and the tabs recede as the split-view slides up to fill the
 * freed space; scroll back to the top and they return. No JS scroll
 * listener, no collapse animation to keep in sync with anything — it's the
 * same native scroll as any other page, just with the split-view
 * intentionally "oversized" by the header's own height. This is why the
 * split-view's own internal auto-scroll-to-latest-message (see
 * beeper-conversations-view.tsx) never touches the tabs: it's a completely
 * separate scroll container from the shell's. Selecting a conversation DOES
 * still scroll the shell down automatically (see the effect on
 * `hasOpenConversation` below) — that's a deliberate, separate action from
 * the local auto-scroll-to-latest-message, using `scrollContainerRef`
 * (forwarded into `DashboardPageShell`) to reach the shell's own scroll div.
 *
 * `group` (Story 101): filters Conversations/Permissions/Msg workout to one
 * contact group, or "All groups"/"— no group —" for everyone/ungrouped.
 * The Groups tab has its own, finer-grained per-group toggle pills instead
 * (see beeper-groups-view.tsx) — a single-select combobox stopped making
 * sense there once you could toggle several groups' visibility at once, so
 * it isn't shown on this tab at all (not even as a placeholder). On first
 * load with no `?group=` in the URL at all, the user's default group
 * (Groups → Manage) is applied instead of "All groups" — see the one-time
 * effect below.
 *
 * Row 2 (All groups + Search) hides on mobile once a conversation is open
 * (`hasOpenConversation`): the contact list/aside is also hidden then (see
 * beeper-conversations-view.tsx), so the filter/search controlling that list
 * have nothing left to act on — hiding them lets the conversation start
 * right under the tabs instead of under the now-pointless filter row. Kept
 * visible on desktop (`md:flex`), where the contact list stays on screen
 * next to the open conversation.
 *
 * `contactsCount` (Permissions/Groups→List): lifted here instead of each
 * view rendering its own "N contacts" in a separate row — a standalone row
 * with nothing else in it (Permissions) was pure wasted vertical space.
 * Rendered inline at the end of row 2 instead, packed left with everything
 * else (no `ml-auto`).
 */
function BeeperContactsPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [groupsRefreshKey, setGroupsRefreshKey] = useState(0);
	const [groupsSubTab, setGroupsSubTab] = useState<GroupsSubTab>("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [permFilter, setPermFilter] = useState<PermissionFilter>("all");
	const [contactsCount, setContactsCount] = useState<number | null>(null);
	const appliedDefaultGroupRef = useRef(false);
	const shellScrollRef = useRef<HTMLDivElement>(null);

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
			router.replace(`/dashboard/beeper${qs ? `?${qs}` : ""}`, { scroll: false });
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

	// Selecting a conversation (Conversations/Msg workout only) scrolls the
	// shell's own scrollbar all the way down, retracting the tabs+filter row
	// out of view — same mechanism as scrolling it manually (see the doc
	// comment above), just triggered automatically so the extra room shows up
	// right away instead of only on request. Never fires for
	// Groups/Permissions (no `contact` param there).
	useEffect(() => {
		if (!hasOpenConversation) return;
		const el = shellScrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [hasOpenConversation, contactParam]);

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

	return (
		<DashboardPageShell
			title="Beeper"
			upLevel={{ href: "/dashboard/msg-automation" }}
			scrollContainerRef={shellScrollRef}
		>
			{/* Tabs + filters live INSIDE the frame, same convention as Daily
			    Tracker's own filter row above its table — never `toolbar`/
			    `toolbarSecondRow`, which render outside/above the frame. On
			    Conversations/Msg workout this block scrolls out of view via the
			    shell's own native scroll — see the doc comment above. */}
			<div className="mb-1.5 flex w-full shrink-0 flex-col gap-1.5">
				<Tabs value={view} onValueChange={handleTabChange}>
					<TabsList aria-label="Beeper view">
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

			{isPermissions ? (
				<BeeperPermissionsView
					groupFilter={groupParam}
					query={searchQuery}
					onQueryChange={setSearchQuery}
					permFilter={permFilter}
					onCountChange={setContactsCount}
				/>
			) : isGroups ? (
				<BeeperGroupsView
					onGroupsChanged={() => setGroupsRefreshKey((k) => k + 1)}
					subTab={groupsSubTab}
					query={searchQuery}
					onQueryChange={setSearchQuery}
					onCountChange={setContactsCount}
				/>
			) : (
				<div className="h-full shrink-0 overflow-hidden">
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

export default function BeeperContactsPage() {
	return (
		<Suspense fallback={null}>
			<BeeperContactsPageInner />
		</Suspense>
	);
}
