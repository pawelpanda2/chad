"use client";

import { useEffect, useState } from "react";
import { readDebugSettings, subscribeDebugSettings, writeDebugSettings, type DebugSettings } from "./debug-settings-store";

/** Reactive read/write of the Debug tab's localStorage settings (Story 126). */
export function useDebugSettings(): [DebugSettings, (next: DebugSettings) => void] {
	const [settings, setSettings] = useState<DebugSettings>({ navigationHistoryVisible: false });

	useEffect(() => {
		setSettings(readDebugSettings());
		return subscribeDebugSettings(() => setSettings(readDebugSettings()));
	}, []);

	const update = (next: DebugSettings) => {
		writeDebugSettings(next);
		setSettings(next);
	};

	return [settings, update];
}
