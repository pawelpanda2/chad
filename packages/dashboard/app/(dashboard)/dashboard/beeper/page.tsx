"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BeeperContactListItem {
	_id: string;
	displayName: string;
	notes: string;
	tags: string[];
	identities: { network: string }[];
	hasAvatar: boolean;
	channelCount: number;
	lastMessage: { text: string; timestamp: string | null; network: string } | null;
	include: boolean;
	exclude: boolean;
}

type ViewTab = "permissions" | "all" | "business" | "romantic" | "friends";
type PermissionFilter = "all" | "include" | "exclude" | "permission";

const VIEW_OPTIONS: Array<{ value: ViewTab; label: string }> = [
	{ value: "permissions", label: "Permissions" },
	{ value: "all", label: "All" },
	{ value: "business", label: "Business" },
	{ value: "romantic", label: "Romantic" },
	{ value: "friends", label: "Friends" },
];

const PERM_FILTER_OPTIONS: Array<{ value: PermissionFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "include", label: "Include" },
	{ value: "exclude", label: "Exclude" },
	{ value: "permission", label: "Permission" },
];

export default function BeeperContactsPage() {
	const [view, setView] = useState<ViewTab>("permissions");
	const [permFilter, setPermFilter] = useState<PermissionFilter>("all");
	const [contacts, setContacts] = useState<BeeperContactListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [savingId, setSavingId] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			if (view === "permissions") {
				params.set("view", "permissions");
				params.set("permissionFilter", permFilter);
			} else if (view !== "all") {
				params.set("tag", view);
			}
			const qs = params.toString();
			const res = await fetch(`/api/beeper-crm/contacts${qs ? `?${qs}` : ""}`);
			if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
			const data = await res.json();
			setContacts(Array.isArray(data) ? data : []);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load contacts");
		} finally {
			setLoading(false);
		}
	}, [view, permFilter]);

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

	const isPermissions = view === "permissions";

	return (
		<DashboardPageShell title="Beeper" upLevel={{ href: "/dashboard/msg-automation" }}>
			{/*
				Story 86 — compact joined toolbar: view | permission filter | search
				(mockup: examples/beeper_permissions_mockup_v7.html)
			*/}
			<div className="mb-3.5 grid grid-cols-[88px_92px_90px_1fr] items-center gap-0 max-[900px]:grid-cols-2 max-[900px]:gap-2">
				<select
					className="h-10 w-[88px] rounded-l-[9px] rounded-r-none border border-border bg-white px-2 text-sm"
					value={view}
					onChange={(e) => setView(e.target.value as ViewTab)}
					aria-label="Beeper view"
				>
					{VIEW_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>

				{isPermissions ? (
					<select
						className="h-10 w-[92px] rounded-none border border-l-0 border-border bg-white px-2 text-sm"
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
				) : (
					<div className="h-10 w-[92px] border border-l-0 border-border bg-muted/30" />
				)}

				<div className="relative">
					<Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search"
						className="h-10 w-[90px] rounded-l-none rounded-r-[9px] border-l-0 pl-7 text-sm"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>

				<span className="justify-self-end pr-1 text-sm text-muted-foreground max-[900px]:justify-self-start">
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
			) : isPermissions ? (
				<div className="rounded-[14px] border border-border bg-white p-2.5">
					<div className="mb-2 grid min-h-[42px] grid-cols-[84px_84px_minmax(0,1fr)] items-center rounded-xl border border-border bg-[#fafafa] px-3.5 text-[13px] font-semibold">
						<div className="text-center">Include</div>
						<div className="text-center">Exclude</div>
						<div className="text-left">Contact</div>
					</div>
					<div className="space-y-2">
						{filtered.map((c) => (
							<div
								key={c._id}
								className={cn(
									"grid min-h-16 grid-cols-[84px_84px_minmax(0,1fr)] items-center rounded-[14px] border border-border bg-white px-3.5 hover:bg-[#f4f4f4]",
									savingId === c._id && "opacity-70"
								)}
							>
								<div className="flex items-center justify-center">
									<input
										type="checkbox"
										className="h-[18px] w-[18px] cursor-pointer"
										checked={c.include}
										disabled={savingId === c._id}
										onChange={(e) => onIncludeChange(c, e.target.checked)}
										aria-label={`Include ${c.displayName}`}
									/>
								</div>
								<div className="flex items-center justify-center">
									<input
										type="checkbox"
										className="h-[18px] w-[18px] cursor-pointer"
										checked={c.exclude}
										disabled={savingId === c._id}
										onChange={(e) => onExcludeChange(c, e.target.checked)}
										aria-label={`Exclude ${c.displayName}`}
									/>
								</div>
								<div className="min-w-0">
									<div className="truncate text-[15px] font-semibold">{c.displayName}</div>
								</div>
							</div>
						))}
					</div>
				</div>
			) : (
				<div className={LIST_ROW_WRAPPER_CLASS}>
					<div className="divide-y">
						{filtered.map((c) => (
							<Link
								key={c._id}
								href={`/dashboard/beeper/${c._id}`}
								className={`flex items-center gap-2 ${LIST_ROW_CLASS}`}
							>
								<Avatar className="h-7 w-7 shrink-0">
									{c.hasAvatar && (
										<AvatarImage
											src={`/api/beeper-crm/contacts/${c._id}/avatar`}
											alt={c.displayName}
										/>
									)}
									<AvatarFallback className="text-[10px]">
										{c.displayName.slice(0, 1).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 max-w-[50%] flex-1">
									<div className="flex items-baseline gap-1.5">
										<span className="truncate text-sm font-medium">{c.displayName}</span>
										{c.tags.map((t) => (
											<Badge key={t} variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
												{t}
											</Badge>
										))}
									</div>
									{c.lastMessage ? (
										<p className="truncate text-xs text-muted-foreground">{c.lastMessage.text}</p>
									) : (
										<p className="truncate text-xs italic text-muted-foreground/60">No messages</p>
									)}
								</div>
							</Link>
						))}
					</div>
				</div>
			)}
		</DashboardPageShell>
	);
}
