"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
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
	// Single open/close state used identically on desktop and mobile — there is
	// no separate desktop layout.
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<div className="relative flex h-[100dvh] overflow-hidden bg-background">
			{/* Sidebar — inline panel that PUSHES the content aside. No overlay,
			    no dimming of the area outside the menu; the main content simply
			    shifts right to make room and stays fully interactive. */}
			<div
				className={cn(
					"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
					menuOpen ? "w-72" : "w-0",
				)}
			>
				<div className="h-full w-72">
					<Sidebar mobile onMobileClose={() => setMenuOpen(false)} />
				</div>
			</div>

			{/* Main column — shifts naturally as the sidebar takes/releases space.
			    Clicking the content while the menu is open closes it (click
			    outside the sidebar), without any blocking/greyed overlay. */}
			<div
				className="flex min-w-0 flex-1 flex-col overflow-hidden"
				onClick={() => {
					if (menuOpen) setMenuOpen(false);
				}}
			>
				{SHOW_TOPBAR && (
					<div className="shrink-0">
						<Topbar />
					</div>
				)}

				{/* Content region — the shared page shells fill this exactly, so the
				    page never scrolls; scroll lives inside the frames. Padding is
				    kept to ~2px so the frame nearly fills the screen. */}
				<main className="min-h-0 flex-1 overflow-y-auto p-0.5">
					{children}
				</main>
			</div>

			{/* Menu handle — a small chevron pinned to the left edge; it rides to
			    the sidebar's right edge when open and toggles the menu. Same
			    handle on desktop and mobile. */}
			<button
				type="button"
				onClick={() => setMenuOpen((open) => !open)}
				aria-label={menuOpen ? "Zamknij menu" : "Otwórz menu"}
				className={cn(
					"fixed top-1/2 z-40 flex -translate-y-1/2 items-center rounded-r-md border border-l-0 bg-card/90 px-0.5 py-3 text-muted-foreground shadow-md backdrop-blur transition-[left] duration-300 ease-in-out hover:text-foreground",
					menuOpen ? "left-72" : "left-0",
				)}
			>
				{menuOpen ? (
					<ChevronLeft className="h-4 w-4" />
				) : (
					<ChevronRight className="h-4 w-4" />
				)}
			</button>
		</div>
	);
}
