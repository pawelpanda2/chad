"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorBox } from "@/components/shared/error-box";
import { UsersList, type UsersListRow } from "@/components/shared/users-list";

/**
 * Settings → Users: switch the active session to another account.
 *
 * Authorization is enforced server-side (`POST /api/settings/users/switch`):
 * only admins may switch (no universal impersonation). See that route's
 * doc comment for the explicit permission decision.
 */
export default function SettingsUsersPage() {
	const [users, setUsers] = useState<UsersListRow[]>([]);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyUserId, setBusyUserId] = useState<string | null>(null);
	const [canSwitch, setCanSwitch] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [sessionRes, usersRes] = await Promise.all([
				fetch("/api/auth/session"),
				fetch("/api/settings/users"),
			]);
			const session = await sessionRes.json();
			const usersData = await usersRes.json();
			if (!sessionRes.ok || !session.user) {
				setError("Not authenticated");
				return;
			}
			setCurrentUserId(session.user.repoGuid ?? session.user.id ?? null);
			setCanSwitch(Boolean(session.user.isAdmin));
			if (!usersRes.ok) {
				setError(usersData.error ?? "Failed to load users");
				return;
			}
			setUsers(usersData.users ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load users");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSwitch(user: UsersListRow) {
		setBusyUserId(user.id);
		setError(null);
		try {
			const res = await fetch("/api/settings/users/switch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repoGuid: user.id }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error ?? data.details ?? "Switch failed");
				return;
			}
			// Hard navigation clears client caches so the new repoGuid is used everywhere.
			window.location.href = "/dashboard/settings/users";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Switch failed");
		} finally {
			setBusyUserId(null);
		}
	}

	if (loading) {
		return <p className="py-4 text-sm text-muted-foreground">Loading users...</p>;
	}

	return (
		<div className="space-y-4">
			<ErrorBox message={error} />
			{!canSwitch && (
				<p className="text-sm text-muted-foreground">
					Session switch is admin-only. You can see who is signed in; switching
					requires an admin account (server-enforced).
				</p>
			)}
			<div className="border bg-muted/10">
				<UsersList
					users={users}
					currentUserId={currentUserId}
					mode="session-switch"
					busyUserId={busyUserId}
					onSwitchUser={canSwitch ? handleSwitch : undefined}
				/>
			</div>
			{canSwitch && (
				<p className="text-xs text-muted-foreground">
					Switch replaces your session cookie server-side. After switch, refresh
					uses the new user&apos;s repoGuid only.
				</p>
			)}
		</div>
	);
}
