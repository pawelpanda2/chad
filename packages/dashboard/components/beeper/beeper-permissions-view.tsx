"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { beeperContactDisplayName } from "@/lib/beeper-contact-display";
import { BeeperPlatformIcon } from "./beeper-platform-icon";

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

type PermissionFilter = "all" | "include" | "exclude" | "permission";

const PERM_FILTER_OPTIONS: Array<{ value: PermissionFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "include", label: "Include" },
	{ value: "exclude", label: "Exclude" },
	{ value: "permission", label: "Permission" },
];

export interface BeeperPermissionsViewProps {
	/** Story 101 — filters to one contact group; undefined/"All groups" shows everyone. */
	groupFilter?: string;
}

/**
 * Beeper Permissions tab (Story 86 layout, extracted unchanged into its own
 * component in Story 94 so beeper/page.tsx can switch between this and the
 * Conversations split-view without one giant file).
 * Platform column + compact left-aligned columns: Story platform-icons follow-up.
 */
export function BeeperPermissionsView({ groupFilter }: BeeperPermissionsViewProps = {}) {
	const [permFilter, setPermFilter] = useState<PermissionFilter>("all");
	const [contacts, setContacts] = useState<BeeperContactListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [savingId, setSavingId] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			params.set("view", "permissions");
			params.set("permissionFilter", permFilter);
			if (groupFilter) params.set("groupId", groupFilter);
			const res = await fetch(`/api/beeper-crm/contacts?${params.toString()}`);
			if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
			const data = await res.json();
			setContacts(Array.isArray(data) ? data : []);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load contacts");
		} finally {
			setLoading(false);
		}
	}, [permFilter, groupFilter]);

	useEffect(() => {
		load();
	}, [load]);

	const filtered = contacts.filter((c) =>
		c.displayName.toLowerCase().includes(query.toLowerCase())
	);

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
			await load();
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
			<div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
				<select
					className="h-10 w-[92px] rounded-[9px] border border-border bg-background px-2 text-sm"
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

				<div className="relative">
					<Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search"
						className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>

				<span className="ml-auto pr-1 text-sm text-muted-foreground">
					{filtered.length} contacts
				</span>
			</div>

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
				<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/10">
					{/* Compact left-aligned table: content-width cols + ~4px gaps; do not stretch across the page. */}
					<table className="w-auto max-w-full border-separate border-spacing-x-1 border-spacing-y-0 text-left text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="px-0.5 py-2 text-center whitespace-nowrap">Include</th>
								<th className="px-0.5 py-2 text-center whitespace-nowrap">Exclude</th>
								<th className="px-0.5 py-2 text-center whitespace-nowrap">Platform</th>
								<th className="px-0.5 py-2 whitespace-nowrap">Name</th>
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
										<td className="px-0.5 py-1.5 text-center align-middle">
											<input
												type="checkbox"
												className="h-[18px] w-[18px] cursor-pointer"
												checked={c.include}
												disabled={savingId === c._id}
												onChange={(e) => onIncludeChange(c, e.target.checked)}
												aria-label={`Include ${name}`}
											/>
										</td>
										<td className="px-0.5 py-1.5 text-center align-middle">
											<input
												type="checkbox"
												className="h-[18px] w-[18px] cursor-pointer"
												checked={c.exclude}
												disabled={savingId === c._id}
												onChange={(e) => onExcludeChange(c, e.target.checked)}
												aria-label={`Exclude ${name}`}
											/>
										</td>
										<td className="px-0.5 py-1.5 text-center align-middle">
											<BeeperPlatformIcon
												network={c.platformNetwork ?? c.lastMessage?.network ?? null}
											/>
										</td>
										<td className="px-0.5 py-1.5 align-middle whitespace-nowrap">
											<div className="font-medium">{name}</div>
										</td>
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
