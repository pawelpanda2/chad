"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
	Search,
	Plus,
	MoreHorizontal,
	Mail,
	Phone,
	Filter,
} from "lucide-react";
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
	const [searchQuery, setSearchQuery] = useState("");

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

	const filteredUsers = users.filter(
		(user) =>
			user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
			user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const getInitials = (name: string | null) => {
		if (!name) return "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-3xl font-bold tracking-tight">Users</h2>
						<p className="text-muted-foreground">
							Manage user accounts and permissions.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Users</h2>
					<p className="text-muted-foreground">
						Manage user accounts and permissions.
					</p>
				</div>
				<Button className="flex items-center gap-2">
					<Plus className="h-4 w-4" />
					Add User
				</Button>
			</div>

			{/* Filters and Search */}
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center gap-4">
						<div className="relative flex-1">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
							<Input
								placeholder="Search users..."
								className="pl-8"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
						<Button variant="outline" className="flex items-center gap-2">
							<Filter className="h-4 w-4" />
							Filter
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Users Table */}
			<Card>
				<CardHeader>
					<CardTitle>All Users ({filteredUsers.length})</CardTitle>
				</CardHeader>
				<CardContent>
					{filteredUsers.length === 0 ? (
						<p className="text-sm text-muted-foreground text-center py-8">
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
								{filteredUsers.map((user, index) => {
									// Diagnostic warning for duplicate IDs
									if (index > 0 && filteredUsers[index - 1].id === user.id) {
										console.warn(`Duplicate user ID detected: ${user.id} at index ${index}`);
									}
									return (
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
											<Badge
												variant={
													user.isActive ? "default" : "secondary"
												}
											>
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
								);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}