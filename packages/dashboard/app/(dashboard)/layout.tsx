"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar, SIDEBAR_EXPANDED_WIDTH_CLASS, SIDEBAR_EXPANDED_LEFT_CLASS } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import { OfflineReadonlyBackupBanner } from "@/components/offline-readonly-backup-banner";
import { useViewportClass } from "@/lib/use-viewport-class";
import { cn } from "@/lib/utils";

// The top bar is intentionally hidden on EVERY screen size (desktop + mobile)
// while its implementation stays in the tree. Flip this flag to `true` to
// restore the topbar everywhere — no other change needed.
const SHOW_TOPBAR = false;

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Same push-in sidebar on both desktop and mobile. Default open state
	// differs (Story 126): desktop and phone-landscape default OPEN (matches
	// the previous universal default); phone portrait defaults CLOSED so a
	// fresh visit/refresh on a phone doesn't open with the menu covering the
	// content. Decided ONCE, from the first real viewport classification
	// (`hasSetInitialMenuState` ref) — later orientation/resize changes never
	// fight the user's own manual open/close.
	const { isDesktop, isPhonePortrait, ready: viewportReady } = useViewportClass();
	const [menuOpen, setMenuOpen] = useState(true);
	const hasSetInitialMenuState = useRef(false);

	useEffect(() => {
		if (!viewportReady || hasSetInitialMenuState.current) return;
		hasSetInitialMenuState.current = true;
		setMenuOpen(!isPhonePortrait);
	}, [viewportReady, isPhonePortrait]);

	// A selected menu item closes the sidebar only on mobile (portrait or
	// landscape) — unchanged from before.
	const handleNavigate = () => {
		if (!isDesktop) setMenuOpen(false);
	};

	// Phone portrait, menu open: main is dimmed and fully non-interactive
	// (Story 126) — the user must close via the handle or a menu item, not by
	// tapping the dimmed content. Every other case (desktop, phone landscape,
	// tablet) keeps the previous push-in, fully-interactive behavior.
	const isMainBlocked = isPhonePortrait && menuOpen;

	return (
		<div className="relative flex h-[100dvh] overflow-hidden bg-background">
			{/* Sidebar — inline panel that PUSHES the content aside. No overlay,
			    no dimming; the main content simply shifts to make room and stays
			    fully interactive. Width comes from SIDEBAR_EXPANDED_* (sidebar.tsx). */}
			<div
				className={cn(
					"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
					menuOpen ? SIDEBAR_EXPANDED_WIDTH_CLASS : "w-0",
				)}
			>
				<div className={cn("h-full", SIDEBAR_EXPANDED_WIDTH_CLASS)}>
					<Sidebar mobile onMobileClose={handleNavigate} />
				</div>
			</div>

			{/* Main column. Desktop/landscape: shifts naturally as the sidebar
			    takes/releases space (`flex-1 min-w-0`), clicking content while
			    open closes the menu on mobile. Phone portrait + menu open: main
			    keeps its own full viewport width instead of shrinking
			    (`w-screen shrink-0` — the row overflows and the outer
			    `overflow-hidden` clips it to sidebar + a sliver of main), is
			    visually dimmed, and is `inert` (blocks click, focus/tab, and the
			    a11y tree in one native attribute) plus `pointer-events-none` as a
			    defensive fallback — no click-through, no click-to-close. */}
			<div
				className={cn(
					"flex flex-col overflow-hidden transition-opacity duration-200",
					isMainBlocked ? "w-screen shrink-0 pointer-events-none opacity-40" : "min-w-0 flex-1",
				)}
				onClick={() => {
					if (!isDesktop && !isPhonePortrait && menuOpen) setMenuOpen(false);
				}}
				inert={isMainBlocked}
			>
				{SHOW_TOPBAR && (
					<div className="shrink-0">
						<Topbar />
					</div>
				)}

				{/* Content region — the shared page shells fill this exactly, so the
				    page never scrolls; scroll lives inside the frames. Padding is
				    kept to ~2px so the frame nearly fills the screen. `xl:pr-[150px]`
				    (Story 62 pane; breakpoint raised from `md`/768px) reserves an
				    empty strip on the right only on wide desktops (≥1280px). At
				    narrower widths — phone, tablet, or half-screen Mac browser —
				    the frame uses the full window width. Sidebar open/close still
				    uses the same `md`/768px desktop breakpoint above. */}
				<main className="min-h-0 flex-1 overflow-y-auto p-0.5 xl:pr-[150px]">
					<OfflineReadonlyBackupBanner />
					<Suspense fallback={null}>
						<DashboardHistoryProvider>{children}</DashboardHistoryProvider>
					</Suspense>
				</main>
			</div>

			{/* Menu handle — a small chevron pinned to the left edge; it rides to
			    the sidebar's right edge when open and toggles the menu. Same
			    handle on desktop and mobile. */}
			{/* Menu handle — sits in the TOP-LEFT, in the first (toolbar) line of
			    every view, so it never covers the frame's content. Wide and
			    short for an easy tap target (esp. on phone). Every page shell
			    reserves matching left space at the top for it. */}
			<button
				type="button"
				onClick={() => setMenuOpen((open) => !open)}
				aria-label={menuOpen ? "Zamknij menu" : "Otwórz menu"}
				className={cn(
					"fixed top-1 z-40 flex h-9 w-12 items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-[left] duration-300 ease-in-out hover:text-foreground",
					menuOpen ? SIDEBAR_EXPANDED_LEFT_CLASS : "left-1",
				)}
			>
				{menuOpen ? (
					<ChevronLeft className="h-5 w-5" />
				) : (
					<ChevronRight className="h-5 w-5" />
				)}
			</button>
		</div>
	);
}
