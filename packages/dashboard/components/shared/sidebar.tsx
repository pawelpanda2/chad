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
	Calendar,
	MessageSquare,
	FolderKanban,
	LogOut,
	ListTodo,
	FileText,
	Table,
	Contact,
	History,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const sidebarGroups = [
	{
		title: "ACTIONS",
		items: [
			{ title: "Forms", href: "/dashboard/forms", icon: ClipboardList, badge: null },
			{ title: "Views", href: "/dashboard/views", icon: Table, badge: null },
			{ title: "History", href: "/dashboard/history", icon: History, badge: null },
		],
	},
	{
		title: "MESSAGES / LEADS",
		items: [
			{ title: "Statuses", href: "/dashboard/statuses", icon: FileText, badge: null },
			{ title: "Msg Todo", href: "/dashboard/todo-msg", icon: ListTodo, badge: null },
			{ title: "Msg Planner", href: "/dashboard/msg-planner", icon: Calendar, badge: null },
			{ title: "Beeper", href: "/dashboard/beeper", icon: Contact, badge: null },
			{ title: "Folders", href: "/dashboard/folders", icon: FolderKanban, badge: null },
			{ title: "Messages", href: "/dashboard/messages", icon: MessageSquare, badge: null },
		],
	},
	{
		title: "Others",
		items: [
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
				mobile ? "w-full" : collapsed ? "w-16" : "w-72",
			)}
		>
			{/* Logo */}
			<div className="flex h-16 items-center border-b px-6 justify-between">
				{!collapsed && (
					<Link href="/dashboard" className="flex items-center gap-3 group">
						<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
							<LayoutDashboard className="w-4 h-4 text-primary-foreground" />
						</div>
						<span className="text-xl font-bold group-hover:text-primary transition-colors">
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
						className="h-8 w-8 hover:bg-muted"
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
			<nav className="flex-1 overflow-y-auto p-6">
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
								const isActive = pathname === item.href;
								const Icon = item.icon;

								return (
									<Link
										key={item.href}
										href={item.href}
										onClick={handleLinkClick}
										className={cn(
											"group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 hover:bg-muted",
											isActive
												? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
												: "text-muted-foreground hover:text-foreground",
											collapsed && "justify-center px-3 py-4",
										)}
										title={collapsed ? item.title : undefined}
									>
										<Icon
											className={cn(
												"transition-all duration-200",
												collapsed ? "h-5 w-5" : "h-4 w-4",
												isActive && !collapsed && "text-primary-foreground",
											)}
										/>
										{!collapsed && (
											<span className="group-hover:translate-x-0.5 transition-transform duration-200">
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
								"transition-all duration-200",
								collapsed ? "h-5 w-5" : "h-4 w-4",
							)}
						/>
						{!collapsed && <span>Wyloguj</span>}
					</button>
				</div>
			</nav>
		</div>
	);
}