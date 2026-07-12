"use client";
import { useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Mail, Phone } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface User {
	id: string;
	username: string;
	displayName: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export default function UsersPage() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchUsers();
	}, []);

	const fetchUsers = async () => {
		try {
			const response = await fetch("/api/admin/users");
			if (response.ok) {
				const data = await response.json();
				setUsers(data);
			}
		} catch (error) {
			console.error("Error fetching users:", error);
		} finally {
			setLoading(false);
		}
	};

	const getInitials = (name: string | null) => {
		if (!name) return "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	const toolbar = (
		<h2 className="text-lg font-bold">
			Users{" "}
			<span className="text-sm font-normal text-muted-foreground">
				({users.length})
			</span>
		</h2>
	);

	if (loading) {
		return (
			<DashboardPageShell toolbar={toolbar}>
				<div className="py-4 text-sm text-muted-foreground">Loading users...</div>
			</DashboardPageShell>
		);
	}

	return (
		<DashboardPageShell scroll={false} padded={false} toolbar={toolbar}>
			<div className="min-h-0 flex-1 overflow-auto">
				{users.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No users found.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Last Seen</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.map((user, index) => (
								<TableRow key={`${user.id}-${index}`}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src="/avatar.png" alt={user.username} />
												<AvatarFallback>
													{getInitials(user.displayName)}
												</AvatarFallback>
											</Avatar>
											<div>
												<div className="font-medium">
													{user.displayName || user.username}
												</div>
												<div className="text-sm text-muted-foreground">
													{user.username}
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="secondary">User</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={user.isActive ? "default" : "secondary"}>
											{user.isActive ? "Active" : "Inactive"}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{new Date(user.updatedAt).toLocaleDateString("en-US", {
											year: "numeric",
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</TableCell>
									<TableCell className="text-right">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon">
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem className="flex items-center gap-2">
													<Mail className="h-4 w-4" />
													Send Email
												</DropdownMenuItem>
												<DropdownMenuItem className="flex items-center gap-2">
													<Phone className="h-4 w-4" />
													Call
												</DropdownMenuItem>
												<DropdownMenuItem>Edit User</DropdownMenuItem>
												<DropdownMenuItem className="text-red-600">
													Delete User
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</DashboardPageShell>
	);
}
