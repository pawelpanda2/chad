"use client";
import { Suspense, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import { cn } from "@/lib/utils";

// The top bar is intentionally hidden on EVERY screen size (desktop + mobile)
// while its implementation stays in the tree. Flip this flag to `true` to
// restore the topbar everywhere — no other change needed.
const SHOW_TOPBAR = false;

// Same breakpoint Tailwind uses for `md`.
const DESKTOP_QUERY = "(min-width: 768px)";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Same push-in sidebar on both desktop and mobile, and it is OPEN by default
	// on both. The ONLY difference is what happens after picking a menu item:
	//   - desktop: sidebar stays open,
	//   - mobile:  sidebar closes.
	const [menuOpen, setMenuOpen] = useState(true);
	const [isDesktop, setIsDesktop] = useState(true);

	useEffect(() => {
		const mq = window.matchMedia(DESKTOP_QUERY);
		const apply = () => setIsDesktop(mq.matches);
		apply();
		mq.addEventListener("change", apply);
		return () => mq.removeEventListener("change", apply);
	}, []);

	// A selected menu item closes the sidebar only on mobile.
	const handleNavigate = () => {
		if (!isDesktop) setMenuOpen(false);
	};

	return (
		<div className="relative flex h-[100dvh] overflow-hidden bg-background">
			{/* Sidebar — inline panel that PUSHES the content aside. No overlay,
			    no dimming; the main content simply shifts to make room and stays
			    fully interactive. */}
			<div
				className={cn(
					"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
					menuOpen ? "w-72" : "w-0",
				)}
			>
				<div className="h-full w-72">
					<Sidebar mobile onMobileClose={handleNavigate} />
				</div>
			</div>

			{/* Main column — shifts naturally as the sidebar takes/releases space.
			    On mobile, clicking the content while the menu is open closes it
			    (click outside the sidebar); on desktop the menu stays open. */}
			<div
				className="flex min-w-0 flex-1 flex-col overflow-hidden"
				onClick={() => {
					if (!isDesktop && menuOpen) setMenuOpen(false);
				}}
			>
				{SHOW_TOPBAR && (
					<div className="shrink-0">
						<Topbar />
					</div>
				)}

				{/* Content region — the shared page shells fill this exactly, so the
				    page never scrolls; scroll lives inside the frames. Padding is
				    kept to ~2px so the frame nearly fills the screen. `md:pr-[150px]`
				    (Story 62) reserves an empty strip on the right edge, desktop
				    only (same `md:` / 768px threshold as DESKTOP_QUERY above) —
				    absent on mobile, where the page uses the full width. */}
				<main className="min-h-0 flex-1 overflow-y-auto p-0.5 md:pr-[150px]">
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
					menuOpen ? "left-72" : "left-1",
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
