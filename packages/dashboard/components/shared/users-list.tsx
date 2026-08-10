"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface UsersListRow {
	id: string;
	username: string;
	displayName: string | null;
	isActive: boolean;
	role?: "admin" | "user";
}

function getInitials(name: string | null, username: string): string {
	const source = name || username;
	return source
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

/**
 * Shared users table used by Admin → Users (role management) and
 * Settings → Users (session switch). Mode controls which action column
 * appears — never mix both intents in one page.
 */
export function UsersList({
	users,
	currentUserId,
	mode,
	busyUserId,
	onSwitchUser,
	onToggleRole,
}: {
	users: UsersListRow[];
	/** Highlight the signed-in (or switched-to) user. */
	currentUserId?: string | null;
	mode: "admin-roles" | "session-switch";
	busyUserId?: string | null;
	onSwitchUser?: (user: UsersListRow) => void;
	onToggleRole?: (user: UsersListRow, nextRole: "admin" | "user") => void;
}) {
	if (users.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>User</TableHead>
					<TableHead>Role</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{users.map((user) => {
					const isCurrent = currentUserId != null && user.id === currentUserId;
					const role = user.role ?? "user";
					const busy = busyUserId === user.id;
					return (
						<TableRow
							key={user.id}
							className={cn(isCurrent && "bg-muted/40")}
						>
							<TableCell>
								<div className="flex items-center gap-3">
									<Avatar className="h-8 w-8">
										<AvatarImage src="/avatar.png" alt={user.username} />
										<AvatarFallback>
											{getInitials(user.displayName, user.username)}
										</AvatarFallback>
									</Avatar>
									<div>
										<div className="font-medium">
											{user.displayName || user.username}
											{isCurrent && (
												<span className="ml-2 text-xs font-normal text-muted-foreground">
													(current)
												</span>
											)}
										</div>
										<div className="text-sm text-muted-foreground">{user.username}</div>
									</div>
								</div>
							</TableCell>
							<TableCell>
								<Badge variant={role === "admin" ? "default" : "secondary"}>
									{role === "admin" ? "Admin" : "User"}
								</Badge>
							</TableCell>
							<TableCell>
								<Badge variant={user.isActive ? "default" : "secondary"}>
									{user.isActive ? "Active" : "Inactive"}
								</Badge>
							</TableCell>
							<TableCell className="text-right">
								{mode === "session-switch" && onSwitchUser && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={busy || isCurrent || !user.isActive}
										onClick={() => onSwitchUser(user)}
									>
										{busy ? "Switching..." : isCurrent ? "Active" : "Switch"}
									</Button>
								)}
								{mode === "admin-roles" && onToggleRole && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={busy || isCurrent}
										title={
											isCurrent
												? "Cannot change your own role from here"
												: role === "admin"
													? "Demote to user"
													: "Promote to admin"
										}
										onClick={() =>
											onToggleRole(user, role === "admin" ? "user" : "admin")
										}
									>
										{busy
											? "Saving..."
											: role === "admin"
												? "Make user"
												: "Make admin"}
									</Button>
								)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
