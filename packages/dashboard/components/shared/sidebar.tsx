"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
	LayoutDashboard,
	Settings,
	Users,
	ClipboardList,
	ChevronLeft,
	ChevronRight,
	MessageSquare,
	FolderKanban,
	LogOut,
	Table,
	History,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/** Expanded rail width — must match `layout.tsx` panel + menu-handle offset. */
export const SIDEBAR_EXPANDED_WIDTH_CLASS = "w-40";
export const SIDEBAR_EXPANDED_LEFT_CLASS = "left-40";

type SidebarItem = {
	title: string;
	href: string;
	icon: typeof LayoutDashboard;
	badge: string | null;
	activePrefixes?: string[];
};

const sidebarGroups: Array<{ title: string; items: SidebarItem[] }> = [
	{
		title: "PAGES",
		items: [
			{ title: "Forms", href: "/dashboard/forms", icon: ClipboardList, badge: null },
			{ title: "Views", href: "/dashboard/views", icon: Table, badge: null },
			{
				title: "Msg Auto",
				href: "/dashboard/msg-automation",
				icon: MessageSquare,
				badge: null,
				// Child pages keep their own routes; highlight this hub while on any of them.
				activePrefixes: [
					"/dashboard/msg-automation",
					"/dashboard/statuses",
					"/dashboard/todo-msg",
					"/dashboard/msg-planner",
					"/dashboard/beeper",
					"/dashboard/messages",
					"/dashboard/leads/message-creator",
				],
			},
		],
	},
	{
		title: "Others",
		items: [
			{ title: "History", href: "/dashboard/history", icon: History, badge: null },
			{ title: "Folders", href: "/dashboard/folders", icon: FolderKanban, badge: null },
			{ title: "Settings", href: "/dashboard/settings", icon: Settings, badge: null },
		],
	},
	{
		title: "Admin",
		items: [
			{ title: "Users", href: "/dashboard/users", icon: Users, badge: null },
		],
	},
];

interface SidebarProps {
	onMobileClose?: () => void;
	/** Rendered inside the mobile slide-in panel: fills width, no collapse toggle. */
	mobile?: boolean;
}

export function Sidebar({ onMobileClose, mobile = false }: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [isCollapsed, setIsCollapsed] = useState(false);
	// Collapsing only makes sense for the fixed desktop rail.
	const collapsed = mobile ? false : isCollapsed;

	// Brand label: the logged-in user's name in place of the static
	// "Dashboard" text (Story 62). Falls back to "Dashboard" while the
	// session fetch is in flight (or if there's no session, which shouldn't
	// normally happen here since this renders inside the authenticated
	// dashboard layout).
	const [brandLabel, setBrandLabel] = useState("Dashboard");
	useEffect(() => {
		let cancelled = false;
		fetch("/api/auth/session")
			.then((res) => res.json())
			.then((data: { user?: { username?: string; displayName?: string | null } | null }) => {
				if (cancelled) return;
				const user = data.user;
				const label = user?.displayName || user?.username;
				if (label) setBrandLabel(label);
			})
			.catch(() => {
				/* keep the "Dashboard" fallback on error */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleLinkClick = () => {
		if (onMobileClose) {
			onMobileClose();
		}
	};

	const handleLogout = async () => {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} catch (error) {
			console.error("Logout error:", error);
		}
	};

	return (
		<div
			className={cn(
				"flex h-full flex-col border-r bg-card shadow-sm transition-all duration-300",
				mobile ? "w-full" : collapsed ? "w-16" : SIDEBAR_EXPANDED_WIDTH_CLASS,
			)}
		>
			{/* Logo */}
			<div className="flex h-16 items-center border-b px-3 justify-between gap-1">
				{!collapsed && (
					<Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 group">
						<div className="w-8 h-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
							<LayoutDashboard className="w-4 h-4 text-primary-foreground" />
						</div>
						<span className="min-w-0 flex-1 truncate text-xl font-bold group-hover:text-primary transition-colors">
							{brandLabel}
						</span>
					</Link>
				)}
				{collapsed && (
					<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
						<LayoutDashboard className="w-4 h-4 text-primary-foreground" />
					</div>
				)}
				{!mobile && (
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 shrink-0 hover:bg-muted"
						onClick={() => setIsCollapsed(!isCollapsed)}
					>
						{isCollapsed ? (
							<ChevronRight className="h-4 w-4" />
						) : (
							<ChevronLeft className="h-4 w-4" />
						)}
					</Button>
				)}
			</div>

			{/* Navigation Groups */}
			<nav className="flex-1 overflow-y-auto p-3">
				<div className="space-y-8">
				{sidebarGroups.map((group) => (
					<div key={group.title} className="space-y-3">
						{/* Group Title */}
						{!collapsed && (
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-4">
								{group.title}
							</h3>
						)}

						{/* Group Items */}
						<div className="space-y-2">
							{group.items.map((item) => {
								const isActive = item.activePrefixes
									? item.activePrefixes.some(
											(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
										)
									: pathname === item.href || pathname.startsWith(`${item.href}/`);
								const Icon = item.icon;

								return (
									<Link
										key={item.href}
										href={item.href}
										onClick={handleLinkClick}
										className={cn(
											"group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 hover:bg-muted",
											isActive
												? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
												: "text-muted-foreground hover:text-foreground",
											collapsed && "justify-center px-3 py-4",
										)}
										title={collapsed ? item.title : undefined}
									>
										<Icon
											className={cn(
												"shrink-0 transition-all duration-200",
												collapsed ? "h-5 w-5" : "h-4 w-4",
												isActive && !collapsed && "text-primary-foreground",
											)}
										/>
										{!collapsed && (
											<span className="min-w-0 flex-1 truncate group-hover:translate-x-0.5 transition-transform duration-200">
												{item.title}
											</span>
										)}
									</Link>
								);
							})}
						</div>
					</div>
				))}
				</div>
				{/* Logout — a normal menu item inside the scrollable nav (not a
				    fixed footer), kept close under the last group. */}
				<div className="mt-4">
					<button
						type="button"
						onClick={handleLogout}
						title={collapsed ? "Wyloguj" : undefined}
						className={cn(
							"group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground",
							collapsed && "justify-center px-3 py-4",
						)}
					>
						<LogOut
							className={cn(
								"shrink-0 transition-all duration-200",
								collapsed ? "h-5 w-5" : "h-4 w-4",
							)}
						/>
						{!collapsed && <span className="min-w-0 flex-1 truncate text-left">Wyloguj</span>}
					</button>
				</div>
			</nav>
		</div>
	);
}