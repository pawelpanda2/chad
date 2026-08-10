import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { getUsersFromSharp, type AppUser } from "@/lib/user-service";

/**
 * GET /api/settings/users — list users for Settings → Users (session switch UI).
 * Any authenticated session may list usernames/roles needed to pick a target;
 * the actual switch is gated separately on POST /api/settings/users/switch.
 */
export async function GET() {
	const currentUser = await getCurrentUserFromCookies();
	if (!currentUser) {
		return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
	}

	const users = (await getUsersFromSharp()) as AppUser[];
	return NextResponse.json({
		users: users.map((u) => ({
			id: u.id,
			username: u.username,
			displayName: u.displayName,
			isActive: u.isActive,
			role: u.role,
		})),
	});
}
