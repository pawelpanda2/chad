"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	ArrowLeft,
	RefreshCw,
	Save,
	Copy,
	CalendarPlus,
	Merge as MergeIcon,
	Paperclip,
} from "lucide-react";
import { toast } from "sonner";

// ── Types (mirrors dba's BeeperContactFullDetail) ───────────────────────────

interface Identity {
	network: string;
	senderID: string;
	senderName?: string;
}
interface Contact {
	_id: string;
	displayName: string;
	bio: string;
	notes: string;
	tags: string[];
	avatarURL: string;
	identities: Identity[];
	socialLinks: string[];
	phones: { number: string; label: string }[];
	ratingStatus: string;
	nextStep: string;
}
interface Message {
	_id: string;
	isSelf: boolean;
	text: string;
	network: string;
	type: string;
	timestamp: string | null;
	reactions: { senderID: string; emoji: string }[];
	groupChannel: { title: string | null; type: string } | null;
	attachments: { fileName: string; type: string }[];
}
interface TimelineEvent {
	_id: string;
	type: string;
	timestamp: string | null;
	title: string;
	description: string;
}
interface Detail {
	contact: Contact;
	channels: { _id: string; type: string; title: string | null; network: string }[];
	messages: Message[];
	timelineEvents: TimelineEvent[];
}
interface SearchResult {
	_id: string;
	displayName: string;
	tags: string[];
	networks: string[];
}

const ALL_TAGS = ["business", "romantic", "friends", "spam"] as const;
const EVENT_ICONS: Record<string, string> = { meeting: "📅", note: "📝", milestone: "🏆", call: "📞" };

function dayKey(iso: string | null): string {
	return iso ? new Date(iso).toDateString() : "";
}

export default function BeeperContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);

	const [detail, setDetail] = useState<Detail | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// Editable profile draft
	const [displayName, setDisplayName] = useState("");
	const [bio, setBio] = useState("");
	const [notes, setNotes] = useState("");

	// Add event dialog
	const [eventDialogOpen, setEventDialogOpen] = useState(false);
	const [eventTitle, setEventTitle] = useState("");
	const [eventDescription, setEventDescription] = useState("");
	const [eventType, setEventType] = useState<"meeting" | "note" | "milestone" | "call">("note");

	// Merge dialog
	const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
	const [mergeQuery, setMergeQuery] = useState("");
	const [mergeResults, setMergeResults] = useState<SearchResult[]>([]);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}`);
			if (!res.ok) throw new Error(`Failed to load contact: ${res.status}`);
			const data: Detail = await res.json();
			setDetail(data);
			setDisplayName(data.contact.displayName);
			setBio(data.contact.bio);
			setNotes(data.contact.notes);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load contact");
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		load();
	}, [load]);

	async function saveProfile() {
		setSaving(true);
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/profile`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ displayName, bio, notes }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
			toast.success("Saved");
			load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed");
		} finally {
			setSaving(false);
		}
	}

	async function toggleTag(tag: string, active: boolean) {
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/tags`, {
				method: active ? "DELETE" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tag }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update tag");
			load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update tag");
		}
	}

	async function addEvent() {
		if (!eventTitle.trim()) {
			toast.error("Title is required");
			return;
		}
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/events`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: eventType, title: eventTitle, description: eventDescription }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "Failed to add event");
			toast.success("Event added");
			setEventDialogOpen(false);
			setEventTitle("");
			setEventDescription("");
			load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to add event");
		}
	}

	async function searchMerge(q: string) {
		setMergeQuery(q);
		if (q.trim().length < 2) {
			setMergeResults([]);
			return;
		}
		try {
			const res = await fetch(
				`/api/beeper-crm/contacts/search?q=${encodeURIComponent(q)}&exclude=${id}`
			);
			if (!res.ok) return;
			setMergeResults(await res.json());
		} catch {
			// ignore transient search errors
		}
	}

	async function confirmMerge(secondaryId: string, secondaryName: string) {
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/merge`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mergeWithId: secondaryId }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "Merge failed");
			toast.success(`${secondaryName} merged into this contact`);
			setMergeDialogOpen(false);
			setMergeQuery("");
			setMergeResults([]);
			load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Merge failed");
		}
	}

	async function copyForAI() {
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${id}/export`);
			if (!res.ok) throw new Error("Export failed");
			const text = await res.text();
			await navigator.clipboard.writeText(text);
			toast.success("Copied to clipboard");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Export failed");
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
				<RefreshCw className="h-4 w-4 animate-spin" /> Loading contact...
			</div>
		);
	}
	if (!detail) {
		return <div className="py-24 text-center text-muted-foreground">Contact not found.</div>;
	}

	const { contact, messages, timelineEvents } = detail;

	type TimelineItem =
		| { kind: "msg"; ts: string | null; data: Message }
		| { kind: "event"; ts: string | null; data: TimelineEvent };
	const timeline: TimelineItem[] = [
		...messages.filter((m) => m.type !== "REACTION").map((m) => ({ kind: "msg" as const, ts: m.timestamp, data: m })),
		...timelineEvents.map((e) => ({ kind: "event" as const, ts: e.timestamp, data: e })),
	].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime());

	let lastDay = "";

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link href="/dashboard/beeper" className="text-muted-foreground hover:text-foreground">
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<h2 className="text-2xl font-bold tracking-tight">{contact.displayName}</h2>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Profile column */}
				<Card className="lg:col-span-1 h-fit">
					<CardContent className="space-y-4 p-4">
						<div className="flex flex-col items-center gap-2 text-center">
							<Avatar className="h-20 w-20">
								{contact.avatarURL && (
									<AvatarImage src={`/api/beeper-crm/contacts/${id}/avatar`} alt={contact.displayName} />
								)}
								<AvatarFallback className="text-2xl">
									{contact.displayName.slice(0, 1).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-wrap justify-center gap-1">
								{[...new Set(contact.identities.map((i) => i.network))].map((n) => (
									<Badge key={n} variant="outline" className="text-[10px]">
										{n}
									</Badge>
								))}
							</div>
						</div>

						<div className="space-y-1">
							<label className="text-xs font-medium text-muted-foreground">Name</label>
							<Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
						</div>
						<div className="space-y-1">
							<label className="text-xs font-medium text-muted-foreground">Bio</label>
							<Textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
						</div>
						<div className="space-y-1">
							<label className="text-xs font-medium text-muted-foreground">Notes</label>
							<Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
						</div>
						<Button onClick={saveProfile} disabled={saving} className="w-full" size="sm">
							<Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save profile"}
						</Button>

						<div className="space-y-1">
							<label className="text-xs font-medium text-muted-foreground">Tags</label>
							<div className="flex flex-wrap gap-1">
								{ALL_TAGS.map((tag) => {
									const active = contact.tags.includes(tag);
									return (
										<Badge
											key={tag}
											variant={active ? "default" : "outline"}
											className="cursor-pointer text-[11px]"
											onClick={() => toggleTag(tag, active)}
										>
											{tag}
										</Badge>
									);
								})}
							</div>
						</div>

						{contact.socialLinks.length > 0 && (
							<div className="space-y-1">
								<label className="text-xs font-medium text-muted-foreground">Links</label>
								<ul className="space-y-0.5 text-xs">
									{contact.socialLinks.map((link) => (
										<li key={link}>
											<a
												href={link}
												target="_blank"
												rel="noreferrer"
												className="truncate text-primary hover:underline"
											>
												{link}
											</a>
										</li>
									))}
								</ul>
							</div>
						)}

						<div className="flex flex-col gap-2 pt-2">
							<Button variant="outline" size="sm" onClick={copyForAI}>
								<Copy className="mr-2 h-4 w-4" /> Copy for AI
							</Button>
							<Button variant="outline" size="sm" onClick={() => setEventDialogOpen(true)}>
								<CalendarPlus className="mr-2 h-4 w-4" /> Add timeline event
							</Button>
							<Button variant="outline" size="sm" onClick={() => setMergeDialogOpen(true)}>
								<MergeIcon className="mr-2 h-4 w-4" /> Merge with another contact
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Timeline column */}
				<Card className="lg:col-span-2 flex max-h-[calc(100vh-220px)] flex-col">
					<CardHeader className="border-b pb-3">
						<span className="font-semibold">Conversation & timeline</span>
					</CardHeader>
					<CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
						{timeline.length === 0 && (
							<p className="py-12 text-center text-sm text-muted-foreground">No messages or events yet.</p>
						)}
						{timeline.map((item) => {
							const dk = dayKey(item.ts);
							const showDayHeader = dk !== lastDay;
							lastDay = dk;
							return (
								<div key={`${item.kind}-${item.data._id}`}>
									{showDayHeader && item.ts && (
										<div className="my-3 text-center text-xs font-medium text-muted-foreground">
											{new Date(item.ts).toLocaleDateString(undefined, {
												weekday: "long",
												day: "numeric",
												month: "long",
												year: "numeric",
											})}
										</div>
									)}
									{item.kind === "msg" ? (
										<div className={`flex ${item.data.isSelf ? "justify-end" : "justify-start"}`}>
											<div
												className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
													item.data.isSelf
														? "rounded-br-sm bg-primary text-primary-foreground"
														: "rounded-bl-sm bg-muted"
												}`}
											>
												{item.data.groupChannel && (
													<p className="mb-0.5 text-[10px] opacity-70">{item.data.groupChannel.title}</p>
												)}
												<p className="whitespace-pre-wrap break-words">
													{item.data.text || `[${item.data.type}]`}
												</p>
												{item.data.attachments.length > 0 && (
													<p className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
														<Paperclip className="h-3 w-3" /> {item.data.attachments.length} attachment(s)
													</p>
												)}
												{item.data.reactions.length > 0 && (
													<p className="mt-1 text-xs">{item.data.reactions.map((r) => r.emoji).join(" ")}</p>
												)}
												{item.ts && (
													<p className="mt-1 text-right text-[10px] opacity-60">
														{new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
													</p>
												)}
											</div>
										</div>
									) : (
										<div className="mx-auto max-w-[85%] rounded-lg border bg-muted/40 px-3 py-2 text-sm">
											<p className="font-medium">
												{EVENT_ICONS[item.data.type] ?? "📌"} {item.data.title}
											</p>
											{item.data.description && (
												<p className="text-muted-foreground">{item.data.description}</p>
											)}
										</div>
									)}
								</div>
							);
						})}
					</CardContent>
				</Card>
			</div>

			{/* Add event dialog */}
			<Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add timeline event</DialogTitle>
					</DialogHeader>
					<div className="space-y-3">
						<div className="flex flex-wrap gap-1">
							{(["note", "meeting", "call", "milestone"] as const).map((t) => (
								<Badge
									key={t}
									variant={eventType === t ? "default" : "outline"}
									className="cursor-pointer"
									onClick={() => setEventType(t)}
								>
									{EVENT_ICONS[t]} {t}
								</Badge>
							))}
						</div>
						<Input placeholder="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
						<Textarea
							placeholder="Description (optional)"
							value={eventDescription}
							onChange={(e) => setEventDescription(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEventDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={addEvent}>Add event</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Merge dialog */}
			<Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Merge {contact.displayName} with...</DialogTitle>
					</DialogHeader>
					<Input
						placeholder="Search contacts by name..."
						value={mergeQuery}
						onChange={(e) => searchMerge(e.target.value)}
						autoFocus
					/>
					<div className="max-h-64 space-y-1 overflow-y-auto">
						{mergeResults.map((r) => (
							<button
								key={r._id}
								onClick={() => confirmMerge(r._id, r.displayName)}
								className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
							>
								<span>{r.displayName}</span>
								<span className="flex gap-1">
									{r.networks.map((n) => (
										<Badge key={n} variant="outline" className="text-[10px]">
											{n}
										</Badge>
									))}
								</span>
							</button>
						))}
						{mergeQuery.trim().length >= 2 && mergeResults.length === 0 && (
							<p className="py-4 text-center text-sm text-muted-foreground">No matches.</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
