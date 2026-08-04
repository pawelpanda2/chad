"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { beeperContactDisplayName } from "@/lib/beeper-contact-display";
import { BeeperPlatformIcon } from "./beeper-platform-icon";
import { ClickRevealTooltip } from "@/components/shared/click-reveal-tooltip";

interface BeeperContactListItem {
	_id: string;
	displayName: string;
	notes: string;
	tags: string[];
	identities: { network: string; senderName?: string }[];
	hasAvatar: boolean;
	channelCount: number;
	lastMessage: { text: string; timestamp: string | null; network: string } | null;
	platformNetwork?: string | null;
	include: boolean;
	exclude: boolean;
}

export type PermissionFilter = "all" | "include" | "exclude" | "permission";

export const PERM_FILTER_OPTIONS: Array<{ value: PermissionFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "include", label: "Include" },
	{ value: "exclude", label: "Exclude" },
	{ value: "permission", label: "Permission" },
];

export interface BeeperPermissionsViewProps {
	/** Story 101 — filters to one contact group; undefined/"All groups" shows everyone. */
	groupFilter?: string;
	/** Search query from the page toolbar (next to All groups). */
	query?: string;
	onQueryChange?: (query: string) => void;
	/** Controlled by the page's row 2, right after Search (moved there per explicit request — was its own row here before). */
	permFilter?: PermissionFilter;
	/** Reports the filtered row count so the page can render "N items" inline in row 2, instead of this view rendering its own otherwise-empty row for it. */
	onCountChange?: (count: number) => void;
}

/**
 * Beeper Permissions tab (Story 86 layout, extracted unchanged into its own
 * component in Story 94 so beeper/page.tsx can switch between this and the
 * Conversations split-view without one giant file).
 * Platform column + compact left-aligned columns: Story platform-icons follow-up.
 */
export function BeeperPermissionsView({
	groupFilter,
	query = "",
	permFilter = "all",
	onCountChange,
}: BeeperPermissionsViewProps = {}) {
	const [contacts, setContacts] = useState<BeeperContactListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [savingId, setSavingId] = useState<string | null>(null);

	const load = useCallback(
		async (cancelledRef: { current: boolean }) => {
			setLoading(true);
			try {
				const params = new URLSearchParams();
				params.set("view", "permissions");
				params.set("permissionFilter", permFilter);
				if (groupFilter) params.set("groupId", groupFilter);
				const res = await fetch(`/api/beeper-crm/contacts?${params.toString()}`);
				if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
				const data = await res.json();
				// Guard against out-of-order responses: if `permFilter`/`groupFilter`
				// changed again while this request was in flight, an earlier,
				// slower request could otherwise land last and silently overwrite
				// the correct, more recent result with stale/unfiltered data.
				if (!cancelledRef.current) setContacts(Array.isArray(data) ? data : []);
			} catch (err) {
				if (!cancelledRef.current) toast.error(err instanceof Error ? err.message : "Failed to load contacts");
			} finally {
				if (!cancelledRef.current) setLoading(false);
			}
		},
		[permFilter, groupFilter]
	);

	useEffect(() => {
		const cancelledRef = { current: false };
		load(cancelledRef);
		return () => {
			cancelledRef.current = true;
		};
	}, [load]);

	const filtered = contacts.filter((c) =>
		c.displayName.toLowerCase().includes(query.toLowerCase())
	);

	useEffect(() => {
		onCountChange?.(filtered.length);
	}, [filtered.length, onCountChange]);

	async function patchPermissions(id: string, include: boolean, exclude: boolean) {
		setSavingId(id);
		// Optimistic update
		setContacts((prev) =>
			prev.map((c) => (c._id === id ? { ...c, include, exclude } : c))
		);
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/permissions`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ include, exclude }),
			});
			const json = await res.json();
			if (!res.ok || json.ok === false) {
				throw new Error(json.error || `Save failed (${res.status})`);
			}
			setContacts((prev) =>
				prev.map((c) =>
					c._id === id
						? { ...c, include: json.include, exclude: json.exclude }
						: c
				)
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save permissions");
			await load({ current: false });
		} finally {
			setSavingId(null);
		}
	}

	function onIncludeChange(c: BeeperContactListItem, checked: boolean) {
		if (checked) {
			void patchPermissions(c._id, true, false);
		} else {
			void patchPermissions(c._id, false, c.exclude);
		}
	}

	function onExcludeChange(c: BeeperContactListItem, checked: boolean) {
		if (checked) {
			void patchPermissions(c._id, false, true);
		} else {
			void patchPermissions(c._id, c.include, false);
		}
	}

	return (
		<>
			{loading ? (
				<div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
					<RefreshCw className="h-4 w-4 animate-spin" /> Loading contacts...
				</div>
			) : filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
					<MessageCircle className="h-10 w-10 opacity-20" />
					<span>No contacts found.</span>
				</div>
			) : (
				// table-fixed + explicit widths (+ trailing empty column) so
				// columns never reflow when the group filter/search changes
				// which rows are visible — matches Groups (8px left, 16px
				// between). Vertical scroll lives on beeper/page.tsx's
				// flex-1 pane (no shell/page scrollbar).
				<div className="overflow-x-auto">
					<table className="w-full min-w-[420px] table-fixed text-left text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="w-20 pl-2 pr-4 py-2 text-center">Include</th>
								<th className="w-20 pr-4 py-2 text-center">Exclude</th>
								<th className="w-[60px] pr-4 py-2 text-center">
									<ClickRevealTooltip label="Platform">Plat.</ClickRevealTooltip>
								</th>
								<th className="w-[240px] py-2">Name</th>
								<th aria-hidden="true" />
							</tr>
						</thead>
						<tbody className="divide-y">
							{filtered.map((c) => {
								const name = beeperContactDisplayName(c.displayName, c.identities);
								return (
									<tr
										key={c._id}
										className={cn("hover:bg-accent", savingId === c._id && "opacity-70")}
									>
										<td className="pl-2 pr-4 py-1.5 text-center align-middle">
											<input
												type="checkbox"
												className="h-[18px] w-[18px] cursor-pointer"
												checked={c.include}
												disabled={savingId === c._id}
												onChange={(e) => onIncludeChange(c, e.target.checked)}
												aria-label={`Include ${name}`}
											/>
										</td>
										<td className="pr-4 py-1.5 text-center align-middle">
											<input
												type="checkbox"
												className="h-[18px] w-[18px] cursor-pointer"
												checked={c.exclude}
												disabled={savingId === c._id}
												onChange={(e) => onExcludeChange(c, e.target.checked)}
												aria-label={`Exclude ${name}`}
											/>
										</td>
										<td className="pr-4 py-1.5 text-center align-middle">
											<BeeperPlatformIcon
												network={c.platformNetwork ?? c.lastMessage?.network ?? null}
											/>
										</td>
										<td className="truncate py-1.5 align-middle">
											<div className="truncate font-medium">{name}</div>
										</td>
										<td aria-hidden="true" />
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
