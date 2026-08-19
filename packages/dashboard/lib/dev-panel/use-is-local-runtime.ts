"use client";

import { useEffect, useState } from "react";

/**
 * Client-side read of the server-only "are we LOCAL" signal
 * (`is-local-runtime.ts`), via `/api/dev-settings/runtime-env`. Never a
 * build-time/CSS-only flag — this repo reuses the same image across
 * local/test/prod with `CHAD_ENVIRONMENT` supplied at deploy time, so the
 * history debug combobox's hard guard (Story 126) must ask the server at
 * runtime. Cached at module scope so every `NavGroup` remount (one per page
 * navigation) doesn't re-fetch.
 */

let cachedIsLocal: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchIsLocal(): Promise<boolean> {
	if (cachedIsLocal !== null) return cachedIsLocal;
	if (!inflight) {
		inflight = fetch("/api/dev-settings/runtime-env", { credentials: "include" })
			.then((res) => (res.ok ? res.json() : { isLocal: false }))
			.then((data: { isLocal?: boolean }) => {
				cachedIsLocal = Boolean(data.isLocal);
				return cachedIsLocal;
			})
			.catch(() => {
				cachedIsLocal = false;
				return false;
			});
	}
	return inflight;
}

export function useIsLocalRuntime(): boolean {
	const [isLocal, setIsLocal] = useState(cachedIsLocal ?? false);

	useEffect(() => {
		let cancelled = false;
		fetchIsLocal().then((value) => {
			if (!cancelled) setIsLocal(value);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return isLocal;
}
