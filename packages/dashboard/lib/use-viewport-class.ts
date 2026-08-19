"use client";

import { useEffect, useState } from "react";

/** Same breakpoint `layout.tsx` has always used for desktop/mobile. */
export const DESKTOP_QUERY = "(min-width: 768px)";
const PORTRAIT_QUERY = "(orientation: portrait)";

export interface ViewportClass {
	isDesktop: boolean;
	/** Below the desktop breakpoint AND portrait — tablet portrait stays at
	 * `md`+ width so it's `isDesktop`, not this. */
	isPhonePortrait: boolean;
	/** False until the first real `matchMedia` read has happened (i.e. the
	 * two fields above are still the SSR placeholder, not a real
	 * classification). Consumers that need to make a ONE-TIME decision based
	 * on the actual device (e.g. the sidebar's initial open/closed state)
	 * must wait for this to flip true, or they'd decide from the placeholder. */
	ready: boolean;
}

const SSR_DEFAULT: ViewportClass = { isDesktop: true, isPhonePortrait: false, ready: false };

/**
 * Classifies the viewport into desktop / phone-portrait / other (landscape
 * phone, tablet, etc. — no separate signal needed for those, Story 126 only
 * asks for phone-portrait specifically). SSR-safe default matches today's
 * behavior (desktop, menu open) — corrected on mount, same one-frame flash
 * the codebase already accepted for the pre-existing `isDesktop` check.
 */
export function useViewportClass(): ViewportClass {
	const [viewport, setViewport] = useState<ViewportClass>(SSR_DEFAULT);

	useEffect(() => {
		const desktopMq = window.matchMedia(DESKTOP_QUERY);
		const portraitMq = window.matchMedia(PORTRAIT_QUERY);
		const apply = () => {
			const isDesktop = desktopMq.matches;
			setViewport({ isDesktop, isPhonePortrait: !isDesktop && portraitMq.matches, ready: true });
		};
		apply();
		desktopMq.addEventListener("change", apply);
		portraitMq.addEventListener("change", apply);
		return () => {
			desktopMq.removeEventListener("change", apply);
			portraitMq.removeEventListener("change", apply);
		};
	}, []);

	return viewport;
}
