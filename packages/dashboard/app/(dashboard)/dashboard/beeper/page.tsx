"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MessageCircle, RefreshCw, Inbox, Users2 } from "lucide-react";
import { toast } from "sonner";

interface BeeperContactListItem {
	_id: string;
	displayName: string;
	notes: string;
	tags: string[];
	identities: { network: string }[];
	hasAvatar: boolean;
	channelCount: number;
	lastMessage: { text: string; timestamp: string | null; network: string } | null;
}

const TAB_OPTIONS = [
	{ value: "all", label: "All" },
	{ value: "business", label: "Business" },
	{ value: "romantic", label: "Romantic" },
	{ value: "friends", label: "Friends" },
] as const;

function relativeTime(iso: string | null): string {
	if (!iso) return "";
	const diffMs = Date.now() - new Date(iso).getTime();
	const mins = Math.round(diffMs / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d`;
	return new Date(iso).toLocaleDateString();
}

export default function BeeperContactsPage() {
	const [tab, setTab] = useState<(typeof TAB_OPTIONS)[number]["value"]>("all");
	const [contacts, setContacts] = useState<BeeperContactListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");

	const load = useCallback(async (tagValue: string) => {
		setLoading(true);
		try {
			const url =
				tagValue === "all" ? "/api/beeper-crm/contacts" : `/api/beeper-crm/contacts?tag=${tagValue}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
			const data = await res.json();
			setContacts(data);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load contacts");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load(tab);
	}, [tab, load]);

	const filtered = contacts.filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()));

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Beeper</h2>
					<p className="text-muted-foreground">Contacts synced from Beeper (Telegram, WhatsApp, iMessage, Signal, ...).</p>
				</div>
				<div className="flex gap-2">
					<Link
						href="/dashboard/beeper/inbox"
						className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
					>
						<Inbox className="h-4 w-4" /> Inbox
					</Link>
					<Link
						href="/dashboard/beeper/merge"
						className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
					>
						<Users2 className="h-4 w-4" /> Merge suggestions
					</Link>
				</div>
			</div>

			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
					<TabsList>
						{TAB_OPTIONS.map((opt) => (
							<TabsTrigger key={opt.value} value={opt.value}>
								{opt.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<div className="relative w-full sm:w-72">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search contacts..."
						className="pl-8"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
					<RefreshCw className="h-4 w-4 animate-spin" /> Loading contacts...
				</div>
			) : filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
					<MessageCircle className="h-10 w-10 opacity-20" />
					<span>No contacts found.</span>
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{filtered.map((c) => (
						<Link key={c._id} href={`/dashboard/beeper/${c._id}`}>
							<Card className="h-full transition-colors hover:bg-accent/50">
								<CardContent className="flex items-start gap-3 p-4">
									<Avatar>
										{c.hasAvatar && <AvatarImage src={`/api/beeper-crm/contacts/${c._id}/avatar`} alt={c.displayName} />}
										<AvatarFallback>{c.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium">{c.displayName}</span>
											{c.lastMessage?.timestamp && (
												<span className="shrink-0 text-xs text-muted-foreground">
													{relativeTime(c.lastMessage.timestamp)}
												</span>
											)}
										</div>
										{c.lastMessage && (
											<p className="truncate text-sm text-muted-foreground">{c.lastMessage.text}</p>
										)}
										<div className="mt-2 flex flex-wrap gap-1">
											{c.tags.map((t) => (
												<Badge key={t} variant="secondary" className="text-[10px]">
													{t}
												</Badge>
											))}
											{[...new Set(c.identities.map((i) => i.network))].map((n) => (
												<Badge key={n} variant="outline" className="text-[10px]">
													{n}
												</Badge>
											))}
										</div>
									</div>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
