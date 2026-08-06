"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeeperConversationsView } from "@/components/beeper/beeper-conversations-view";
import { cn } from "@/lib/utils";

type BeeperTab = "conv" | "settings";

const LEGACY_MULTIVIEW_TABS = new Set(["permissions", "groups", "msg-workout", "conversations"]);

function isBeeperTab(value: string | null): value is BeeperTab {
	return value === "conv" || value === "settings";
}

/**
 * Dedicated Beeper page (Story 105): Conv + Settings only.
 * Conversations UI is the shared `BeeperConversationsView` also used by
 * Msg Auto → MultiView → Conversations.
 */
function BeeperPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const contactParam = searchParams.get("contact") ?? undefined;
	const groupParam = searchParams.get("group") ?? undefined;

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

	return (
		<DashboardPageShell title="Beeper" scroll={false}>
			<div className="mb-1.5 flex w-full shrink-0 flex-col gap-1.5">
				<Tabs
					value={tab}
					onValueChange={(v) => {
						updateUrl(v as BeeperTab, undefined, groupParam);
					}}
				>
					<TabsList aria-label="Beeper tabs">
						<TabsTrigger value="conv">Conv</TabsTrigger>
						<TabsTrigger value="settings">Settings</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{tab === "conv" ? (
				<div className="min-h-0 flex-1 overflow-hidden">
					<BeeperConversationsView
						initialContactId={contactParam}
						onSelectContact={handleSelectContact}
						groupFilter={groupParam}
					/>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<BeeperPluginSynchSettings />
				</div>
			)}
		</DashboardPageShell>
	);
}

type PluginStatus =
	| "running"
	| "started"
	| "already running"
	| "failed"
	| "error no connection to plugin"
	| "";

function BeeperPluginSynchSettings() {
	const [status, setStatus] = useState<PluginStatus>("");
	const [busy, setBusy] = useState(false);
	const [isError, setIsError] = useState(false);

	const refreshStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/beeper/plugin-synch/status");
			const json = await res.json();
			const s = typeof json.status === "string" ? json.status : "error no connection to plugin";
			setStatus(s as PluginStatus);
			setIsError(s === "error no connection to plugin" || s === "failed");
		} catch {
			setStatus("error no connection to plugin");
			setIsError(true);
		}
	}, []);

	useEffect(() => {
		void refreshStatus();
	}, [refreshStatus]);

	async function handleStart() {
		setBusy(true);
		try {
			const res = await fetch("/api/beeper/plugin-synch/start", { method: "POST" });
			const json = await res.json();
			const s = typeof json.status === "string" ? json.status : "error no connection to plugin";
			setStatus(s as PluginStatus);
			setIsError(s === "error no connection to plugin" || s === "failed");
		} catch {
			setStatus("error no connection to plugin");
			setIsError(true);
		} finally {
			setBusy(false);
		}
	}

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
			{status ? (
				<p
					className={cn(
						"text-sm",
						isError ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
					)}
				>
					{status}
				</p>
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
