import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername, getRawUsersFromSharp, getUsersFromSharpRaw, type CpUser } from "@/lib/user-service";

export async function POST(request: NextRequest) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const debugInfo: any = {};

	try {
		const { username, password } = await request.json();
		debugInfo.input = { username, passwordLength: password?.length };

		// Validate input
		if (!username || !password) {
			return NextResponse.json(
				{ error: "Please enter username and password", debug: debugInfo },
				{ status: 400 }
			);
		}

		// Log that we're using Sharp runner for authentication
		console.log("[Login] Authenticating user via UserService (Sharp runner)");
		debugInfo.authMethod = "Sharp runner via GetByNames";
		debugInfo.getByNamesCall = {
			service: "IRepoService",
			worker: "IItemWorker",
			method: "GetByNames",
			args: ["root", "users", "chad_admin"]
		};
		debugInfo.contentProviderApiUrl = process.env.CONTENT_PROVIDER_API_URL;

		// First, try to get the raw output from Sharp runner
		let rawSharpOutput: string = "";
		let cpApiError = false;
		try {
			rawSharpOutput = await getUsersFromSharpRaw();
			debugInfo.rawCsharpOutput = rawSharpOutput;
		} catch (rawError) {
			debugInfo.rawCsharpError = rawError instanceof Error ? rawError.message : String(rawError);
			console.error("[Login] Error getting raw Sharp output:", debugInfo.rawCsharpError);
			cpApiError = true;
		}

		// Then try to get all users to see what's available
		try {
			const allUsers = await getRawUsersFromSharp();
			debugInfo.allUsersCount = allUsers.length;
			debugInfo.allUsersSample = allUsers.slice(0, 3).map((u: CpUser) => ({
				repoGuid: u.repoGuid,
				username: u.username,
				email: u.email
			}));
			console.log("[Login] Fetched", allUsers.length, "users from Sharp runner");
		} catch (fetchError) {
			debugInfo.usersFetchError = fetchError instanceof Error ? fetchError.message : String(fetchError);
			console.error("[Login] Error fetching users list:", debugInfo.usersFetchError);
			cpApiError = true;
		}

		// If Content Provider API is unavailable, return clear error
		if (cpApiError && debugInfo.allUsersCount === 0) {
			console.log("[Login] Content Provider API is unavailable");
			return NextResponse.json(
				{
					error: "Content Provider API is unavailable. Cannot authenticate.",
					debug: {
						...debugInfo,
						errorType: "CONTENT_PROVIDER_API_UNAVAILABLE",
						message: "Content Provider API is not reachable. Login via GetByNames cannot load users.",
						hint: "Make sure Content Provider API is running on the URL specified in CONTENT_PROVIDER_API_URL"
					}
				},
				{ status: 503 }
			);
		}

		// Find user by username using Sharp runner
		const user: CpUser | null = await findUserByUsername(username);
		debugInfo.foundUser = user ? { username: user.username, hasPasswordHash: !!user.passwordHash } : null;

		if (!user) {
			console.log("[Login] User not found:", username);
			debugInfo.error = "User not found in Content Provider via Sharp runner";
			debugInfo.searchedUsername = username;
			// Include raw C# output for debugging
			if (debugInfo.rawSharpJson) {
				debugInfo.rawCsharpOutput = debugInfo.rawSharpJson;
			}
			return NextResponse.json(
				{ error: "Invalid credentials", debug: debugInfo },
				{ status: 401 }
			);
		}

		// Verify password
		debugInfo.verifyingPassword = { username: user.username, hasHash: !!user.passwordHash };
		const isValidPassword = await bcrypt.compare(password, user.passwordHash);
		debugInfo.passwordValid = isValidPassword;

		if (!isValidPassword) {
			console.log("[Login] Invalid password for user:", username);
			return NextResponse.json(
				{ error: "Invalid credentials", debug: debugInfo },
				{ status: 401 }
			);
		}

		console.log("[Login] Successfully authenticated user:", username);

		// Create session cookie (simple implementation using httpOnly cookie).
		// user.repoGuid doubles as this user's identity AND their Content
		// Provider data-root repo GUID — see chad_admin's body.txt comment.
		const sessionToken = `${user.repoGuid}:${Date.now()}`;
		const cookieOptions = [
			"session=" + encodeURIComponent(sessionToken),
			"HttpOnly",
			"Path=/",
			"SameSite=Lax",
			"Max-Age=" + (60 * 60 * 24 * 7), // 7 days
		];

		// Only add Secure flag if explicitly enabled (e.g., HTTPS environment)
		// Default is false for HTTP environments like QNAP test
		const cookieSecure = process.env.AUTH_COOKIE_SECURE === "true";
		if (cookieSecure) {
			cookieOptions.push("Secure");
		}

		const setCookieHeader = cookieOptions.join("; ");

		// Return user data (without password hash) with Set-Cookie header
		return NextResponse.json(
			{
				user: {
					repoGuid: user.repoGuid,
					username: user.username,
					displayName: user.username,
				},
			},
			{
				headers: {
					"Set-Cookie": setCookieHeader,
				},
			}
		);
	} catch (error) {
		debugInfo.exception = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
		console.error("[Login] Error during authentication:", debugInfo);
		return NextResponse.json(
			{ error: "An error occurred during login", debug: debugInfo },
			{ status: 500 }
		);
	}
}