import { NextResponse } from "next/server";
import { getUsersFromSharp, type AppUser, type UserServiceDebugInfo } from "@/lib/user-service";
import { getCurrentUserFromCookies } from "@/lib/session";
import { setUserRoleInUsersList, AdminUsersError } from "dba";

export async function GET() {
	const currentUser = await getCurrentUserFromCookies();
	if (!currentUser || !currentUser.isAdmin) {
		return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
	}

	try {
		const result = (await getUsersFromSharp({ includeDebug: true })) as {
			users: AppUser[];
			debug: UserServiceDebugInfo;
		};
		const users = result.users;

		const formattedUsers = users.map((user: AppUser) => ({
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			email: user.email,
			isActive: user.isActive,
			role: user.role,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}));

		return NextResponse.json(formattedUsers);
	} catch (error) {
		console.error("[AdminUsers] Error fetching users:", error);
		return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/users — set a user's role (`admin` | `user`).
 * Admin-only; persists via dba `setUserRoleInUsersList` into users-list YAML.
 */
export async function PATCH(request: Request) {
	const currentUser = await getCurrentUserFromCookies();
	if (!currentUser || !currentUser.isAdmin) {
		return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const repoGuid = typeof body?.repoGuid === "string" ? body.repoGuid.trim() : "";
	const role = body?.role;
	if (!repoGuid || (role !== "admin" && role !== "user")) {
		return NextResponse.json(
			{ success: false, error: "VALIDATION", details: 'Body must include repoGuid and role ("admin"|"user")' },
			{ status: 400 },
		);
	}
	if (repoGuid === currentUser.repoGuid) {
		return NextResponse.json(
			{ success: false, error: "VALIDATION", details: "Cannot change your own role" },
			{ status: 400 },
		);
	}

	try {
		const updated = await setUserRoleInUsersList(repoGuid, role);
		console.info(
			`[AdminUsers] role change by ${currentUser.username}: ${updated.username} → ${updated.role}`,
		);
		return NextResponse.json({ success: true, user: updated });
	} catch (err) {
		if (err instanceof AdminUsersError) {
			const status =
				err.code === "USER_NOT_FOUND" || err.code === "USERS_LIST_NOT_FOUND"
					? 404
					: err.code === "LAST_ADMIN"
						? 409
						: 400;
			return NextResponse.json({ success: false, error: err.code, details: err.message }, { status });
		}
		console.error("[AdminUsers] PATCH failed:", err);
		return NextResponse.json({ success: false, error: "UNKNOWN_ERROR" }, { status: 500 });
	}
}
