import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { createSessionToken } from "@/lib/session-token";
import { getUsersFromSharp, type AppUser } from "@/lib/user-service";

/**
 * POST /api/settings/users/switch
 * Body: `{ repoGuid: string }`
 *
 * Re-issues the signed `session` cookie for a different active user.
 *
 * ## Permission decision (Story 116 continuation)
 *
 * The repo had **no** existing rule for who may switch into whose session
 * (no impersonation / login-as feature). A universal "any user → any user"
 * switch would be an auth bypass — refused.
 *
 * Provisional rule used here (server-side only, never a client override):
 * **only `isAdmin` sessions may switch**, and only onto an **active** user
 * that exists in `chad_admin/users/users-list`. Product owner should confirm
 * or replace this rule; until then non-admins get 403.
 */
export async function POST(request: Request) {
	const actor = await getCurrentUserFromCookies();
	if (!actor) {
		return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
	}
	if (!actor.isAdmin) {
		return NextResponse.json(
			{
				success: false,
				error: "NOT_AUTHORIZED",
				details:
					"Session switch requires an admin account. No broader switch permission exists yet.",
			},
			{ status: 403 },
		);
	}

	const body = await request.json().catch(() => null);
	const targetRepoGuid = typeof body?.repoGuid === "string" ? body.repoGuid.trim() : "";
	if (!targetRepoGuid) {
		return NextResponse.json(
			{ success: false, error: "VALIDATION", details: 'Missing "repoGuid"' },
			{ status: 400 },
		);
	}

	const users = (await getUsersFromSharp()) as AppUser[];
	const target = users.find((u) => u.id === targetRepoGuid);
	if (!target) {
		return NextResponse.json(
			{ success: false, error: "USER_NOT_FOUND" },
			{ status: 404 },
		);
	}
	if (!target.isActive) {
		return NextResponse.json(
			{ success: false, error: "USER_INACTIVE" },
			{ status: 403 },
		);
	}

	const sessionToken = await createSessionToken(target.id);
	const cookieOptions = [
		"session=" + encodeURIComponent(sessionToken),
		"HttpOnly",
		"Path=/",
		"SameSite=Lax",
		"Max-Age=" + 60 * 60 * 24 * 7,
	];
	if (process.env.AUTH_COOKIE_SECURE === "true") {
		cookieOptions.push("Secure");
	}

	console.info(
		`[settings/users/switch] admin=${actor.username} → ${target.username} (${target.id})`,
	);

	return NextResponse.json(
		{
			success: true,
			user: {
				repoGuid: target.id,
				username: target.username,
				role: target.role,
				isAdmin: target.isAdmin,
			},
		},
		{ headers: { "Set-Cookie": cookieOptions.join("; ") } },
	);
}
