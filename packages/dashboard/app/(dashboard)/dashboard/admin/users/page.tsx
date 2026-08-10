"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { ErrorBox } from "@/components/shared/error-box";
import { UsersList, type UsersListRow } from "@/components/shared/users-list";
import { cn } from "@/lib/utils";

export default function AdminUsersPage() {
	const [users, setUsers] = useState<UsersListRow[]>([]);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyUserId, setBusyUserId] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [sessionRes, usersRes] = await Promise.all([
				fetch("/api/auth/session"),
				fetch("/api/admin/users"),
			]);
			const session = await sessionRes.json();
			if (session?.user?.repoGuid) setCurrentUserId(session.user.repoGuid);

			if (!usersRes.ok) {
				const data = await usersRes.json().catch(() => ({}));
				setError(data.error ?? `Failed to load users (${usersRes.status})`);
				return;
			}
			const data = await usersRes.json();
			const list = Array.isArray(data) ? data : data.users ?? [];
			setUsers(
				list.map((u: UsersListRow & { role?: string }) => ({
					id: u.id,
					username: u.username,
					displayName: u.displayName,
					isActive: u.isActive,
					role: u.role === "admin" ? "admin" : "user",
				})),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load users");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleToggleRole(user: UsersListRow, nextRole: "admin" | "user") {
		setBusyUserId(user.id);
		setError(null);
		try {
			const res = await fetch("/api/admin/users", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repoGuid: user.id, role: nextRole }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.details ?? data.error ?? "Failed to update role");
				return;
			}
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update role");
		} finally {
			setBusyUserId(null);
		}
	}

	if (loading) {
		return (
			<DashboardPageShell title="Admin — Users">
				<div className="py-4 text-sm text-muted-foreground">Loading users...</div>
			</DashboardPageShell>
		);
	}

	return (
		<DashboardPageShell
			contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")}
			title="Admin — Users"
		>
			<span className="shrink-0 text-xs text-muted-foreground">{users.length} users</span>
			<ErrorBox message={error} />
			<div className="border bg-muted/10">
				<UsersList
					users={users}
					currentUserId={currentUserId}
					mode="admin-roles"
					busyUserId={busyUserId}
					onToggleRole={handleToggleRole}
				/>
			</div>
		</DashboardPageShell>
	);
}
