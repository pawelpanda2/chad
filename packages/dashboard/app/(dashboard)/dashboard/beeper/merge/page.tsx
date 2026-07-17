"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users2, ArrowRightLeft, X } from "lucide-react";
import { toast } from "sonner";

interface Card_ {
	_id: string;
	displayName: string;
	avatarURL: string | null;
	networks: string[];
	lastMessage: { text: string; network: string; timestamp: string | null } | null;
}
interface Suggestion {
	id: string;
	similarity: number;
	a: Card_;
	b: Card_;
}

function ContactCard({ c }: { c: Card_ }) {
	return (
		<div className="flex items-center gap-3">
			<Avatar>
				{c.avatarURL && <AvatarImage src={`/api/beeper-crm/contacts/${c._id}/avatar`} alt={c.displayName} />}
				<AvatarFallback>{c.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<Link href={`/dashboard/beeper/${c._id}`} className="font-medium hover:underline">
					{c.displayName}
				</Link>
				<div className="flex flex-wrap gap-1">
					{c.networks.map((n) => (
						<Badge key={n} variant="outline" className="text-[10px]">
							{n}
						</Badge>
					))}
				</div>
				{c.lastMessage && <p className="truncate text-xs text-muted-foreground">{c.lastMessage.text}</p>}
			</div>
		</div>
	);
}

export default function BeeperMergePage() {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch("/api/beeper-crm/merge-suggestions");
			if (!res.ok) throw new Error(`Failed to load suggestions: ${res.status}`);
			setSuggestions(await res.json());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load suggestions");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	async function doMerge(primaryId: string, secondaryId: string, pairId: string) {
		setBusyId(pairId);
		try {
			const res = await fetch(`/api/beeper-crm/contacts/${primaryId}/merge`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mergeWithId: secondaryId }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "Merge failed");
			toast.success(data.message ?? "Merged");
			setSuggestions((prev) => prev.filter((s) => s.id !== pairId));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Merge failed");
		} finally {
			setBusyId(null);
		}
	}

	function dismiss(pairId: string) {
		setSuggestions((prev) => prev.filter((s) => s.id !== pairId));
	}

	return (
		<DashboardPageShell
			upLevel={{ href: "/dashboard/beeper" }}
			title="Merge Suggestions"
		>
			{/* Second row inside the outer frame — see backlog/stories/60. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 mb-3">
				<span className="text-xs text-muted-foreground">
					Fuzzy name matches among direct-DM contacts. Nothing is merged automatically.
				</span>
				<span className="ml-auto text-xs text-muted-foreground">{suggestions.length} pairs</span>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
					<RefreshCw className="h-4 w-4 animate-spin" /> Computing suggestions...
				</div>
			) : suggestions.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
					<Users2 className="h-10 w-10 opacity-20" />
					<span>No merge suggestions right now.</span>
				</div>
			) : (
				<div className="space-y-3">
					{suggestions.map((s) => (
						<Card key={s.id}>
							<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
									<ContactCard c={s.a} />
									<ArrowRightLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
									<ContactCard c={s.b} />
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<Badge variant="secondary">{s.similarity}% match</Badge>
									<Button
										size="sm"
										disabled={busyId === s.id}
										onClick={() => doMerge(s.a._id, s.b._id, s.id)}
									>
										Merge into {s.a.displayName.split(" ")[0]}
									</Button>
									<Button variant="ghost" size="icon" onClick={() => dismiss(s.id)} title="Dismiss">
										<X className="h-4 w-4" />
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</DashboardPageShell>
	);
}
