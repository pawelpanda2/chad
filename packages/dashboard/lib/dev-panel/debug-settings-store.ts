/**
 * Persists the Dev Panel → Settings → Debug toggle(s) — Story 126. A purely
 * client-side, per-browser UI display preference (whether to show the
 * LOCAL-only navigation-history debug combobox), so it follows the same
 * shape as Folders' `lastAddress` (`lib/cp-address/last-address-store.ts`)
 * rather than the DB-source tab's server-persisted mechanism — that one is
 * actual data-source truth, this is just a display toggle, and conflating
 * the two is exactly what splitting Databases/Debug is meant to avoid.
 */

import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage-safe";

const STORAGE_KEY = "chad:dev-panel:debug-settings";
const CHANGE_EVENT = "chad:dev-panel:debug-settings-changed";

export interface DebugSettings {
	navigationHistoryVisible: boolean;
}

const DEFAULT_SETTINGS: DebugSettings = { navigationHistoryVisible: false };

export function readDebugSettings(): DebugSettings {
	const raw = readLocalStorage(STORAGE_KEY);
	if (!raw) return DEFAULT_SETTINGS;
	try {
		const parsed = JSON.parse(raw) as Partial<DebugSettings>;
		return { navigationHistoryVisible: Boolean(parsed.navigationHistoryVisible) };
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function writeDebugSettings(next: DebugSettings): void {
	writeLocalStorage(STORAGE_KEY, JSON.stringify(next));
	if (typeof window !== "undefined") {
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}
}

/** Notifies every mounted `useDebugSettings()` (e.g. Dev Panel writes, NavGroup reads) without a shared store. */
export function subscribeDebugSettings(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	window.addEventListener(CHANGE_EVENT, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(CHANGE_EVENT, callback);
		window.removeEventListener("storage", callback);
	};
}
