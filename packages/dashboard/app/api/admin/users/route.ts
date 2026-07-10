import { NextResponse } from "next/server";
import { getUsersFromSharp, type AppUser, type UserServiceDebugInfo } from "@/lib/user-service";

export async function GET() {
	try {
		console.log("[AdminUsers] Fetching users via UserService (Sharp runner)");

		// Fetch users from Content Provider using Sharp runner via UserService
		const result = await getUsersFromSharp({ includeDebug: true }) as { users: AppUser[]; debug: UserServiceDebugInfo };
		const users = result.users;
		const debug = result.debug;

		// Log diagnostic information
		console.log("[AdminUsers] Debug info:", {
			runnerCalled: debug.runnerCalled,
			arguments: debug.arguments.join(' '),
			usersCount: debug.usersCount,
			parseError: debug.parseError,
			usersSample: debug.usersSample,
		});

		if (debug.parseError || debug.error) {
			console.warn("[AdminUsers] Issues fetching users:", {
				parseError: debug.parseError,
				error: debug.error,
				rawResultPreview: debug.rawResult ? debug.rawResult.substring(0, 200) : null,
			});
		}

		// Map to the format expected by the UI (already done in service, but ensure consistency)
		const formattedUsers = users.map((user: AppUser) => ({
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			email: user.email,
			isActive: user.isActive,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}));

		console.log("[AdminUsers] Returning", formattedUsers.length, "users");
		return NextResponse.json(formattedUsers);
	} catch (error) {
		console.error("[AdminUsers] Error fetching users:", error);
		return NextResponse.json(
			{ error: "Failed to fetch users" },
			{ status: 500 }
		);
	}
}