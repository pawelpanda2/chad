"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";

const settingsTabs: Array<{ href: string; title: string }> = [
	{ title: "Profile", href: "/dashboard/settings" },
	{ title: "Account", href: "/dashboard/settings/account" },
	{ title: "Password", href: "/dashboard/settings/password" },
	{ title: "Appearance", href: "/dashboard/settings/appearance" },
	{ title: "Display", href: "/dashboard/settings/display" },
	{ title: "Payments", href: "/dashboard/settings/payments" },
	{ title: "Folders", href: "/dashboard/settings/read-only-folders" },
];

function isActiveTab(pathname: string, href: string): boolean {
	if (href === "/dashboard/settings") {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}

interface SettingsLayoutProps {
	children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
	const pathname = usePathname();

	return (
		<DashboardPageShell title="Settings" contentClassName={FRAME_SECTION_GAP_CLASS}>
			<div className="rounded-lg border bg-muted/10 p-4">
				<nav
					className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-[3px]"
					aria-label="Settings sections"
				>
					{settingsTabs.map((tab) => {
						const active = isActiveTab(pathname, tab.href);
						return (
							<Link
								key={tab.href}
								href={tab.href}
								className={cn(
									"inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
									active
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{tab.title}
							</Link>
						);
					})}
				</nav>
				<div className="max-w-2xl">{children}</div>
			</div>
		</DashboardPageShell>
	);
}
