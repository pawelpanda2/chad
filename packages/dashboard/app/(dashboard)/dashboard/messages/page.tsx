"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { BeeperConversationView } from "@/components/shared/beeper-conversation-view";
import {
	Search,
	MessageSquare,
	AlertCircle,
	RefreshCw,
} from "lucide-react";

export default function MessagesPage() {
	const [leads, setLeads] = useState<string[]>([]);
	const [selectedLead, setSelectedLead] = useState<string | null>(null);
	const [conversationContent, setConversationContent] = useState<string | null>(null);
	const [loadingLeads, setLoadingLeads] = useState(true);
	const [loadingConversation, setLoadingConversation] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	const messagesEndRef = useRef<HTMLDivElement>(null);

	const loadLeads = useCallback(async () => {
		setLoadingLeads(true);
		setError(null);

		try {
			const response = await fetch("/api/beeper/leads");
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.error || `Failed to load leads: ${response.status}`
				);
			}
			const leadsList = await response.json();
			setLeads(leadsList);
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Failed to load leads";
			setError(errorMsg);
			console.error("Error loading leads:", err);
		} finally {
			setLoadingLeads(false);
		}
	}, []);

	useEffect(() => {
		loadLeads();
	}, [loadLeads]);

	useEffect(() => {
		if (selectedLead) {
			loadConversation(selectedLead);
		}
	}, [selectedLead]);

	useEffect(() => {
		if (messagesEndRef.current && conversationContent) {
			messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [conversationContent]);

	async function loadConversation(leadName: string) {
		setLoadingConversation(true);
		setConversationContent(null);

		try {
			const response = await fetch(
				`/api/beeper/conversation/${encodeURIComponent(leadName)}`
			);

			if (!response.ok) {
				if (response.status === 404) {
					setConversationContent(null);
					return;
				}
				const errorData = await response.json();
				throw new Error(
					errorData.error || `Failed to load: ${response.status}`
				);
			}

			const data = await response.json();
			if (data?.ok === false) {
				throw new Error(data.error || "Conversation API returned an error");
			}
			setConversationContent(typeof data.content === "string" ? data.content : null);
		} catch (err) {
			const errorMsg =
				err instanceof Error
					? err.message
					: `Failed to load conversation for ${leadName}`;
			setError(errorMsg);
			console.error(`Error loading conversation for ${leadName}:`, err);
		} finally {
			setLoadingConversation(false);
		}
	}

	const filteredLeads = leads.filter((lead) =>
		lead.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<DashboardPageShell scroll={false} title="Manual Messages" upLevel={{ href: "/dashboard/msg-automation" }}>
			<div className="grid h-full min-h-0 gap-3 lg:grid-cols-3">
				<Card className="flex flex-col lg:col-span-1">
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="font-semibold">Conversations</span>
							<span className="text-xs text-muted-foreground">
								{leads.length} leads
							</span>
						</div>
						<div className="relative mt-2">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search leads..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8"
							/>
						</div>
					</CardHeader>
					<CardContent className="min-h-0 flex-1 overflow-hidden p-0">
						{error && (
							<div className="flex items-center gap-2 border-b px-4 py-2 text-sm text-destructive">
								<AlertCircle className="h-4 w-4 shrink-0" />
								<span className="truncate">{error}</span>
							</div>
						)}
						{loadingLeads ? (
							<div className="flex h-full items-center justify-center py-12">
								<div className="flex items-center gap-2 text-muted-foreground">
									<RefreshCw className="h-4 w-4 animate-spin" />
									<span>Loading...</span>
								</div>
							</div>
						) : filteredLeads.length === 0 ? (
							<div className="flex h-full items-center justify-center py-12">
								<div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
									<MessageSquare className="h-6 w-6" />
									<span>
										{searchQuery
											? "No leads match your search"
											: "No conversations found"}
									</span>
								</div>
							</div>
						) : (
							<div className="h-full overflow-y-auto">
								<div className="divide-y">
									{filteredLeads.map((lead) => (
										<button
											key={lead}
											onClick={() => setSelectedLead(lead)}
											className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
												selectedLead === lead
													? "bg-accent font-medium"
													: ""
											}`}
										>
											<span className="block truncate">{lead}</span>
										</button>
									))}
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="flex flex-col lg:col-span-2">
					<CardHeader className="border-b pb-3">
						<div className="flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
								<MessageSquare className="h-4 w-4 text-primary" />
							</div>
							<div>
								<h3 className="text-base font-semibold">
									{selectedLead || "Select a conversation"}
								</h3>
								{selectedLead && (
									<p className="text-xs text-muted-foreground">
										WhatsApp conversation
									</p>
								)}
							</div>
						</div>
					</CardHeader>
					<CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
						{loadingConversation ? (
							<div className="flex h-full items-center justify-center">
								<div className="flex items-center gap-2 text-muted-foreground">
									<RefreshCw className="h-4 w-4 animate-spin" />
									<span>Loading messages...</span>
								</div>
							</div>
						) : !selectedLead ? (
							<div className="flex h-full items-center justify-center">
								<div className="flex flex-col items-center gap-3 px-4 text-center text-muted-foreground">
									<MessageSquare className="h-12 w-12 opacity-20" />
									<span className="text-sm">
										Select a lead from the list to view messages
									</span>
								</div>
							</div>
						) : (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<BeeperConversationView
									content={conversationContent}
									emptyLabel="Conversation unavailable"
									emptyHint="No Beeper conversation saved for this lead"
									endRef={messagesEndRef}
								/>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</DashboardPageShell>
	);
}
