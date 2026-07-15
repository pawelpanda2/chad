"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";

interface BeeperInboxRow {
	id: string;
	contact: { _id: string; displayName: string; avatarURL: string | null };
	message: { text: string; timestamp: string | null; network: string; isSelf: boolean };
}

function formatDate(iso: string | null): string {
	if (!iso) return "";
	return new Date(iso).toLocaleString();
}

export default function BeeperInboxPage() {
	const [rows, setRows] = useState<BeeperInboxRow[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			try {
				const res = await fetch("/api/beeper-crm/inbox");
				if (!res.ok) throw new Error(`Failed to load inbox: ${res.status}`);
				setRows(await res.json());
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to load inbox");
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	return (
		<DashboardPageShell
			upLevel={{ href: "/dashboard/beeper" }}
			toolbar={<h2 className="text-lg font-bold">Inbox</h2>}
		>
			{/* Second row inside the outer frame — see documentation/stories/60. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 mb-3">
				<span className="text-xs text-muted-foreground">
					Latest message per direct conversation, most recent first.
				</span>
				<span className="ml-auto text-xs text-muted-foreground">{rows.length} conversations</span>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
					<RefreshCw className="h-4 w-4 animate-spin" /> Loading inbox...
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
					<InboxIcon className="h-10 w-10 opacity-20" />
					<span>No direct conversations yet.</span>
				</div>
			) : (
				<div className="space-y-2">
					{rows.map((row) => (
						<Link key={row.id} href={`/dashboard/beeper/${row.contact._id}`}>
							<Card className="transition-colors hover:bg-accent/50">
								<CardContent className="flex items-center gap-3 p-4">
									<Avatar>
										{row.contact.avatarURL && (
											<AvatarImage
												src={`/api/beeper-crm/contacts/${row.contact._id}/avatar`}
												alt={row.contact.displayName}
											/>
										)}
										<AvatarFallback>{row.contact.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium">{row.contact.displayName}</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{formatDate(row.message.timestamp)}
											</span>
										</div>
										<p className="truncate text-sm text-muted-foreground">
											{row.message.isSelf ? "You: " : ""}
											{row.message.text}
										</p>
									</div>
									<Badge variant="outline" className="shrink-0 text-[10px]">
										{row.message.network}
									</Badge>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			)}
		</DashboardPageShell>
	);
}
