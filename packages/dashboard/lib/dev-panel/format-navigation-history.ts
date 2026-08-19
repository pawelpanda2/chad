/**
 * Formats `DashboardHistoryProvider`'s debug snapshot for Dev Panel Debug's
 * Copy button — Story 127. Every entry is a same-origin dashboard
 * pathname+search string (see `dashboard-history-provider.tsx`'s own doc
 * comment — RAM-only, never anything but `usePathname()+useSearchParams()`
 * output), so there is nothing secret to strip here.
 */
export function formatNavigationHistorySnapshot(snapshot: { entries: string[]; index: number }): string {
	const lines = [
		"navigation-history",
		`currentIndex: ${snapshot.index}`,
		`count: ${snapshot.entries.length}`,
		"",
		...snapshot.entries.map((entry, i) => `${i}${i === snapshot.index ? " | CURRENT" : ""} | ${entry}`),
	];
	return lines.join("\n");
}
