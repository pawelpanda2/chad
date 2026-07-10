"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Grid3X3,
	Mail,
	Calendar,
	FileText,
	BarChart3,
	Settings,
	Users,
	FolderKanban,
	MessageSquare,
	Database,
} from "lucide-react";

const apps = [
	{
		name: "Dashboard",
		icon: Grid3X3,
		href: "/dashboard",
		description: "Main dashboard overview",
	},
	{
		name: "Mail",
		icon: Mail,
		href: "/mail",
		description: "Email management",
	},
	{
		name: "Calendar",
		icon: Calendar,
		href: "/calendar",
		description: "Schedule and events",
	},
	{
		name: "Documents",
		icon: FileText,
		href: "/documents",
		description: "File management",
	},
	{
		name: "Analytics",
		icon: BarChart3,
		href: "/analytics",
		description: "Data insights",
	},
	{
		name: "Users",
		icon: Users,
		href: "/users",
		description: "User management",
	},
	{
		name: "Projects",
		icon: FolderKanban,
		href: "/projects",
		description: "Project tracking",
	},
	{
		name: "Messages",
		icon: MessageSquare,
		href: "/messages",
		description: "Team communication",
	},
	{
		name: "Database",
		icon: Database,
		href: "/database",
		description: "Data management",
	},
	{
		name: "Settings",
		icon: Settings,
		href: "/settings",
		description: "System configuration",
	},
];

export function AppSwitcher() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					aria-label="Switch applications"
				>
					<Grid3X3 className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-80 p-4"
				align="start"
				side="bottom"
				sideOffset={8}
			>
				<DropdownMenuLabel className="text-sm font-medium text-gray-500 mb-3">
					Applications
				</DropdownMenuLabel>
				<div className="grid grid-cols-3 gap-2">
					{apps.map((app) => {
						const Icon = app.icon;
						return (
							<DropdownMenuItem
								key={app.name}
								className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
								onClick={() => {
									window.location.href = app.href;
									setIsOpen(false);
								}}
							>
								<div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
									<Icon className="h-5 w-5 text-gray-600" />
								</div>
								<span className="text-xs font-medium text-center">
									{app.name}
								</span>
							</DropdownMenuItem>
						);
					})}
				</div>
				<DropdownMenuSeparator className="my-3" />
				<div className="text-xs text-gray-500 text-center">
					More apps coming soon...
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
