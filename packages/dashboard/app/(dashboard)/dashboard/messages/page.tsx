"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Search,
	MessageSquare,
	AlertCircle,
	RefreshCw,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

/** Parsed message from WhatsApp conversation */
interface ParsedMessage {
	id: string;
	sender: "you" | "she" | "system";
	message: string;
	timestamp: string;
	isOwn: boolean;
	raw: string;
}

// ============================================================================
// Message Parser
// ============================================================================

/**
 * Parses WhatsApp conversation text into structured messages.
 *
 * Format: [DD/MM/YYYY, HH:MM:SS] sender: message
 * - "you" = my messages (displayed on right)
 * - "she" = her messages (displayed on left)
 * - attachments: ‎<attached: filename>
 */
function parseWhatsAppMessages(content: string): ParsedMessage[] {
	if (!content || typeof content !== "string") {
		return [];
	}

	const lines = content.split("\n").filter((line) => line.trim());
	const messages: ParsedMessage[] = [];

	// WhatsApp message pattern: [DD/MM/YYYY, HH:MM:SS] sender: message
	const messagePattern =
		/\[(\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}:\d{2})\]\s*(\w+):\s*(.*)/;

	for (const line of lines) {
		const match = line.match(messagePattern);

		if (match) {
			const [, timestamp, sender, messageText] = match;
			const normalizedSender = sender.toLowerCase();

			let parsedSender: "you" | "she" | "system" = "system";
			if (normalizedSender === "you") {
				parsedSender = "you";
			} else if (normalizedSender === "she") {
				parsedSender = "she";
			}

			// Check for attachment placeholder
			const attachmentMatch = messageText.match(/‎<attached:\s*(.+)>/);
			let displayMessage = messageText;
			if (attachmentMatch) {
				displayMessage = `📎 Attachment: ${attachmentMatch[1]}`;
			}

			messages.push({
				id: `${timestamp}-${sender}-${messages.length}`,
				sender: parsedSender,
				message: displayMessage,
				timestamp: timestamp.trim(),
				isOwn: parsedSender === "you",
				raw: line,
			});
		} else if (line.trim()) {
			// Unparsed line - treat as system message
			messages.push({
				id: `system-${messages.length}`,
				sender: "system",
				message: line.trim(),
				timestamp: "",
				isOwn: false,
				raw: line,
			});
		}
	}

	return messages;
}

// ============================================================================
// Main Component
// ============================================================================

export default function MessagesPage() {
	// State
	const [leads, setLeads] = useState<string[]>([]);
	const [selectedLead, setSelectedLead] = useState<string | null>(null);
	const [messages, setMessages] = useState<ParsedMessage[]>([]);
	const [loadingLeads, setLoadingLeads] = useState(true);
	const [loadingConversation, setLoadingConversation] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	const messagesEndRef = useRef<HTMLDivElement>(null);

	/** Load all leads with beeper whatsapp conversations */
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

	// Load leads on mount
	useEffect(() => {
		loadLeads();
	}, [loadLeads]);

	// Load conversation when selected lead changes
	useEffect(() => {
		if (selectedLead) {
			loadConversation(selectedLead);
		}
	}, [selectedLead]);

	// Scroll to bottom when messages change
	useEffect(() => {
		if (messagesEndRef.current) {
			messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages]);

	/** Load conversation for a specific lead */
	async function loadConversation(leadName: string) {
		setLoadingConversation(true);
		setMessages([]);

		try {
			const response = await fetch(
				`/api/beeper/conversation/${encodeURIComponent(leadName)}`
			);

			if (!response.ok) {
				if (response.status === 404) {
					setMessages([]);
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
			if (data.content) {
				const parsed = parseWhatsAppMessages(data.content);
				setMessages(parsed);
			}
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

	/** Filter leads based on search query */
	const filteredLeads = leads.filter((lead) =>
		lead.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// ========================================================================
	// Render
	// ========================================================================

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h2 className="text-3xl font-bold tracking-tight">Messages</h2>
				<p className="text-muted-foreground">
					WhatsApp conversations from Content Provider.
				</p>
			</div>

			{/* Main Content */}
			<div className="grid gap-6 lg:grid-cols-3 h-[calc(100vh-200px)] min-h-[500px]">
				{/* Left Panel - Leads List */}
				<Card className="lg:col-span-1 flex flex-col">
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="font-semibold">Conversations</span>
							<span className="text-xs text-muted-foreground">
								{leads.length} leads
							</span>
						</div>
						<div className="relative">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
							<Input
								placeholder="Search leads..."
								className="pl-8 text-sm"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
					</CardHeader>
					<CardContent className="flex-1 overflow-hidden p-0">
						{loadingLeads ? (
							<div className="flex items-center justify-center h-full py-12">
								<div className="flex items-center gap-2 text-muted-foreground">
									<RefreshCw className="h-4 w-4 animate-spin" />
									<span>Loading leads...</span>
								</div>
							</div>
						) : error && leads.length === 0 ? (
							<div className="flex items-center justify-center h-full py-12">
								<div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
									<AlertCircle className="h-6 w-6" />
									<span>{error}</span>
									<button
										onClick={loadLeads}
										className="text-sm text-primary hover:underline mt-2"
									>
										Retry
									</button>
								</div>
							</div>
						) : filteredLeads.length === 0 ? (
							<div className="flex items-center justify-center h-full py-12">
								<div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
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
											className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-accent ${
												selectedLead === lead
													? "bg-accent font-medium"
													: ""
											}`}
										>
											<span className="truncate block">{lead}</span>
										</button>
									))}
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Right Panel - Messages */}
				<Card className="lg:col-span-2 flex flex-col">
					<CardHeader className="pb-3 border-b">
						<div className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
								<MessageSquare className="h-4 w-4 text-primary" />
							</div>
							<div>
								<h3 className="font-semibold text-base">
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
					<CardContent className="flex-1 flex flex-col overflow-hidden p-0">
						{loadingConversation ? (
							<div className="flex items-center justify-center h-full">
								<div className="flex items-center gap-2 text-muted-foreground">
									<RefreshCw className="h-4 w-4 animate-spin" />
									<span>Loading messages...</span>
								</div>
							</div>
						) : !selectedLead ? (
							<div className="flex items-center justify-center h-full">
								<div className="flex flex-col items-center gap-3 text-muted-foreground text-center px-4">
									<MessageSquare className="h-12 w-12 opacity-20" />
									<span className="text-sm">
										Select a lead from the list to view messages
									</span>
								</div>
							</div>
						) : messages.length === 0 ? (
							<div className="flex items-center justify-center h-full">
								<div className="flex flex-col items-center gap-3 text-muted-foreground text-center px-4">
									<MessageSquare className="h-12 w-12 opacity-20" />
									<span className="text-sm">
										Conversation unavailable
									</span>
									<span className="text-xs">
										No Beeper conversation saved for this lead
									</span>
								</div>
							</div>
						) : (
							<div className="flex-1 overflow-y-auto p-4 space-y-3">
								{messages.map((msg) => (
									<div
										key={msg.id}
										className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
									>
										<div
											className={`max-w-[70%] lg:max-w-[60%] px-4 py-2.5 rounded-2xl ${
												msg.sender === "system"
													? "bg-muted text-muted-foreground text-xs text-center mx-auto"
													: msg.isOwn
														? "bg-primary text-primary-foreground rounded-br-sm"
														: "bg-muted text-foreground rounded-bl-sm"
											}`}
										>
											<p className="text-sm whitespace-pre-wrap break-words">
												{msg.message}
											</p>
											{msg.timestamp && (
												<p
													className={`text-[10px] mt-1 text-right ${
														msg.isOwn
															? "text-primary-foreground/70"
															: "text-muted-foreground"
													}`}
												>
													{msg.timestamp}
												</p>
											)}
										</div>
									</div>
								))}
								<div ref={messagesEndRef} />
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}