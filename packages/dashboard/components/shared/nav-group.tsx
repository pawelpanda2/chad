"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardHistory } from "@/components/shared/dashboard-history-provider";
import { getHierarchyParent } from "@/lib/dashboard-hierarchy";
import { useIsLocalRuntime } from "@/lib/dev-panel/use-is-local-runtime";
import { useDebugSettings } from "@/lib/dev-panel/use-debug-settings";
import { cn } from "@/lib/utils";

export interface NavGroupProps {
	className?: string;
}

/**
 * Shared navigation control for dashboard toolbars: three icon-only
 * buttons, `←` `↶` `↷`, left-aligned — Story 126. Two fully independent
 * logics, never mixed:
 *
 * - `←` (hierarchy) — this page's structural parent, resolved purely from
 *   the current pathname/search params via `lib/dashboard-hierarchy.ts`.
 *   Never touches browser/dashboard history. Disabled only at the
 *   Dashboards root.
 * - `↶` / `↷` (history) — `DashboardHistoryProvider`'s tracked visit stack
 *   only. Never falls back to hierarchy. Disabled when there's no
 *   previous/next entry.
 *
 * Must be the FIRST element among its flex toolbar siblings, placed right
 * after the toolbar's `pl-14` menu-handle gap — left-aligned, no `ml-auto`.
 * `DashboardPageShell` renders `title` immediately after this, so the
 * LOCAL-only history-debug combobox (rendered here, after the three
 * buttons) always ends up between the arrows and the page title.
 */
export function NavGroup({ className }: NavGroupProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { canGoBack, canGoForward, goBack, goForward, debug } = useDashboardHistory();

	const hierarchyParent = getHierarchyParent(pathname, searchParams);

	const isLocal = useIsLocalRuntime();
	const [debugSettings] = useDebugSettings();
	const showHistoryDebug = isLocal && debugSettings.navigationHistoryVisible;

	return (
		<div className={cn("flex shrink-0 items-center gap-1", className)}>
			<Button
				variant="outline"
				size="sm"
				className="h-7 w-7 shrink-0 p-0"
				disabled={!hierarchyParent}
				onClick={() => hierarchyParent && router.push(hierarchyParent.href)}
				title="Up one level"
				aria-label="Up one level"
			>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-7 w-7 shrink-0 p-0"
				disabled={!canGoBack}
				onClick={goBack}
				title="Back through navigation history"
				aria-label="Back through navigation history"
			>
				<Undo2 className="h-4 w-4" />
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-7 w-7 shrink-0 p-0"
				disabled={!canGoForward}
				onClick={goForward}
				title="Forward through navigation history"
				aria-label="Forward through navigation history"
			>
				<Redo2 className="h-4 w-4" />
			</Button>
			{showHistoryDebug && <HistoryDebugCombobox entries={debug.entries} index={debug.index} />}
		</div>
	);
}

/**
 * LOCAL-only, read-only viewer of the tracked history stack. Never a second
 * store — just displays `DashboardHistoryProvider`'s existing snapshot.
 * Deliberately not a real "jump to entry" control: since it can't call
 * `router.push` for a past entry without faking a history traversal, the
 * `<select>` always snaps back to the current index after any selection —
 * a scrollable readout, not navigation.
 */
function HistoryDebugCombobox({ entries, index }: { entries: string[]; index: number }) {
	// Selecting a different option must NOT navigate (would fake history
	// traversal) — `snapBack` forces a re-render so React reconciles the
	// controlled `value={index}` back onto the <select>, visually snapping
	// the picked option back to the real current entry.
	const [, snapBack] = useState(0);
	return (
		<select
			value={index}
			onChange={() => snapBack((n) => n + 1)}
			title="Navigation history debug (LOCAL only)"
			aria-label="Navigation history debug"
			className="h-7 shrink-0 rounded-md border bg-background px-1.5 text-xs text-muted-foreground"
		>
			{entries.map((entry, i) => (
				<option key={`${i}-${entry}`} value={i}>
					{`${i + 1} / ${entries.length} — ${entry}`}
				</option>
			))}
		</select>
	);
}
