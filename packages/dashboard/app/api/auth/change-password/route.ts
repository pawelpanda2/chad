import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * POST /api/auth/change-password
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * NOTE: The password change UI is in place, but persisting a new password
 * requires writing the user's passwordHash back to the Content Provider user
 * item (chad_admin/users/users-list). There is no dba helper for that write
 * yet, and doing it wrong would corrupt real accounts, so this endpoint does
 * not yet perform the change. It authenticates the request and returns a clear
 * "not implemented" so the UI never silently claims success.
 */
export async function POST(request: Request) {
	const user = await getCurrentUserFromCookies();
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "NOT_AUTHENTICATED" },
			{ status: 401 },
		);
	}

	// Validate the shape so the client contract is real even before persistence.
	const body = await request.json().catch(() => null);
	const currentPassword = body?.currentPassword;
	const newPassword = body?.newPassword;
	if (!currentPassword || !newPassword) {
		return NextResponse.json(
			{ success: false, error: "Podaj obecne i nowe hasło." },
			{ status: 400 },
		);
	}

	return NextResponse.json(
		{
			success: false,
			error:
				"Zmiana hasła nie jest jeszcze obsługiwana po stronie serwera (brak zapisu do Content Providera).",
		},
		{ status: 501 },
	);
}
