import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername, type CpUser } from "@/lib/user-service";
import { createSessionToken } from "@/lib/session-token";

export async function POST(request: NextRequest) {
	try {
		const { username, password } = await request.json();

		// Validate input
		if (!username || !password) {
			return NextResponse.json(
				{ error: "Please enter username and password" },
				{ status: 400 }
			);
		}

		console.log("[Login] Authenticating user:", username);

		// Find user by username using DBA (Mongo-backed)
		let user: CpUser | null = null;
		try {
			user = await findUserByUsername(username);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[Login] Error fetching users:", message);
			return NextResponse.json(
				{ error: "Unable to load user database. Please try again." },
				{ status: 503 }
			);
		}

		if (!user) {
			console.log("[Login] User not found:", username);
			return NextResponse.json(
				{ error: "Invalid credentials" },
				{ status: 401 }
			);
		}

		// Verify password
		let isValidPassword = false;
		try {
			isValidPassword = await bcrypt.compare(password, user.passwordHash);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[Login] Error verifying password:", message);
			return NextResponse.json(
				{ error: "Authentication failed" },
				{ status: 500 }
			);
		}

		if (!isValidPassword) {
			console.log("[Login] Invalid password for user:", username);
			return NextResponse.json(
				{ error: "Invalid credentials" },
				{ status: 401 }
			);
		}

		if (user.isActive === false) {
			console.log("[Login] Account is disabled:", username);
			return NextResponse.json(
				{ error: "This account is disabled" },
				{ status: 403 }
			);
		}

		console.log("[Login] Successfully authenticated user:", username);

		// Signed, expiring session token (2026-07-28 P0 fix) — see
		// lib/session-token.ts's own doc comment for why the previous plain
		// `${repoGuid}:${timestamp}` was forgeable.
		const sessionToken = createSessionToken(user.repoGuid);
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
					role: user.role ?? (user.username.toLowerCase() === "pawel_f" ? "admin" : "user"),
				},
			},
			{
				headers: {
					"Set-Cookie": setCookieHeader,
				},
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[Login] Unexpected error:", message);
		return NextResponse.json(
			{ error: "An error occurred during login" },
			{ status: 500 }
		);
	}
}