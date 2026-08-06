"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeeperConversationsView } from "@/components/beeper/beeper-conversations-view";
import { ErrorBox } from "@/components/shared/error-box";
import {
	isPluginSynchErrorStatus,
	pluginSynchStatusMessage,
} from "@/lib/beeper-plugin-synch";
import { cn } from "@/lib/utils";

type BeeperTab = "conv" | "settings";

const LEGACY_MULTIVIEW_TABS = new Set(["permissions", "groups", "msg-workout", "conversations"]);

function isBeeperTab(value: string | null): value is BeeperTab {
	return value === "conv" || value === "settings";
}

/**
 * Beeper page under Msg Auto hub (Story 105): Conv + Settings.
 * Conversations UI is the shared `BeeperConversationsView` also used by
 * Msg Auto → MultiView → Conversations.
 */
function BeeperPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const contactParam = searchParams.get("contact") ?? undefined;
	const groupParam = searchParams.get("group") ?? undefined;
	const [searchQuery, setSearchQuery] = useState("");

	// Legacy multi-tab URLs that used to live on /dashboard/beeper → MultiView.
	useEffect(() => {
		if (tabParam && LEGACY_MULTIVIEW_TABS.has(tabParam) && tabParam !== "conversations") {
			const params = new URLSearchParams(searchParams.toString());
			router.replace(`/dashboard/msg-automation/multiview?${params.toString()}`, { scroll: false });
		}
	}, [tabParam, searchParams, router]);

	const tab: BeeperTab =
		tabParam === "conversations" || tabParam === null || tabParam === ""
			? "conv"
			: isBeeperTab(tabParam)
				? tabParam
				: "conv";

	const updateUrl = useCallback(
		(nextTab: BeeperTab, nextContact?: string, nextGroup?: string) => {
			const params = new URLSearchParams();
			if (nextTab !== "conv") params.set("tab", nextTab);
			if (nextContact) params.set("contact", nextContact);
			if (nextGroup) params.set("group", nextGroup);
			const qs = params.toString();
			router.replace(`/dashboard/beeper${qs ? `?${qs}` : ""}`, { scroll: false });
		},
		[router],
	);

	const handleSelectContact = useCallback(
		(id: string | null) => {
			updateUrl(tab, id ?? undefined, groupParam);
		},
		[updateUrl, tab, groupParam],
	);

	const hasOpenConversation = Boolean(contactParam);
	const [pluginBanner, setPluginBanner] = useState("");

	useEffect(() => {
		if (tab !== "settings") setPluginBanner("");
	}, [tab]);

	return (
		<DashboardPageShell
			title="Beeper"
			upLevel={{ href: "/dashboard/msg-automation" }}
			scroll={false}
		>
			{pluginBanner && isPluginSynchErrorStatus(pluginBanner) ? (
				<div className="mb-1.5 w-full shrink-0">
					<ErrorBox
						message={pluginSynchStatusMessage(pluginBanner)}
						className="w-full"
					/>
				</div>
			) : null}
			<div className="mb-1.5 flex w-full shrink-0 flex-col gap-1.5">
				<Tabs
					value={tab}
					onValueChange={(v) => {
						setSearchQuery("");
						updateUrl(v as BeeperTab, undefined, groupParam);
					}}
				>
					<TabsList aria-label="Beeper tabs">
						<TabsTrigger value="conv">Conv</TabsTrigger>
						<TabsTrigger value="settings">Settings</TabsTrigger>
					</TabsList>
				</Tabs>
				{tab === "conv" && (
					<div
						className={cn(
							"flex-wrap items-center gap-2",
							hasOpenConversation ? "hidden md:flex" : "flex",
						)}
					>
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
					</div>
				)}
			</div>

			{tab === "conv" ? (
				<div className="min-h-0 flex-1 overflow-hidden">
					<BeeperConversationsView
						initialContactId={contactParam}
						onSelectContact={handleSelectContact}
						groupFilter={groupParam}
						query={searchQuery}
						onQueryChange={setSearchQuery}
					/>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<BeeperPluginSynchSettings onStatusChange={setPluginBanner} />
				</div>
			)}
		</DashboardPageShell>
	);
}

type PluginStatus =
	| "running"
	| "starting"
	| "started"
	| "already running"
	| "unhealthy"
	| "token expired"
	| "unauthorized"
	| "sync failed"
	| "failed"
	| "error no connection to plugin"
	| "";

function BeeperPluginSynchSettings({
	onStatusChange,
}: {
	onStatusChange?: (status: string) => void;
}) {
	const [status, setStatus] = useState<PluginStatus>("");
	const [busy, setBusy] = useState(false);

	const applyStatus = useCallback(
		(s: string) => {
			setStatus(s as PluginStatus);
			onStatusChange?.(s);
		},
		[onStatusChange],
	);

	const refreshStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/beeper/plugin-synch/status");
			const json = await res.json();
			const s = typeof json.status === "string" ? json.status : "error no connection to plugin";
			applyStatus(s);
		} catch {
			applyStatus("error no connection to plugin");
		}
	}, [applyStatus]);

	useEffect(() => {
		void refreshStatus();
	}, [refreshStatus]);

	async function handleStart() {
		setBusy(true);
		try {
			const res = await fetch("/api/beeper/plugin-synch/start", { method: "POST" });
			const json = await res.json();
			const s = typeof json.status === "string" ? json.status : "error no connection to plugin";
			applyStatus(s);
		} catch {
			applyStatus("error no connection to plugin");
		} finally {
			setBusy(false);
		}
	}

	const isError = status ? isPluginSynchErrorStatus(status) : false;

	return (
		<div className="flex max-w-md flex-col gap-3 p-1">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-8 w-fit gap-1.5 text-xs"
				disabled={busy}
				onClick={() => void handleStart()}
			>
				{busy && <Loader2 className="h-3 w-3 animate-spin" />}
				Plugin synch
			</Button>
			{status && !isError ? (
				<p className="text-sm text-muted-foreground">{status}</p>
			) : null}
		</div>
	);
}

export default function BeeperPage() {
	return (
		<Suspense fallback={null}>
			<BeeperPageInner />
		</Suspense>
	);
}
