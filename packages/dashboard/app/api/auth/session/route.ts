import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/auth/session
 *
 * Fixed in Story 62: this route used to look the session cookie up in the
 * Prisma `User` table (`prisma.user.findUnique({ where: { id: userId } })`),
 * which never matched anything for real logins — the actual session cookie
 * set by `/api/auth/login` is `${repoGuid}:${timestamp}`
 * (`app/api/auth/login/route.ts`), and every other route in this app
 * resolves it via `getCurrentUserFromCookies()` against the real
 * `chad_admin` user list, not Prisma. This endpoint always returned
 * `{ user: null }` for every real account as a result — confirmed live
 * (logged in as `pawel_f`, this endpoint still returned null) while
 * building the sidebar-username feature. Nothing else depended on its
 * broken response shape (only `middleware.ts` referenced the route by path
 * string, not its body), so switching it to the real mechanism is a fix,
 * not a breaking change to any working consumer.
 *
 * `displayName` isn't a real distinct field in the `chad_admin` user model
 * (see `lib/user-service.ts`'s `AppUser.displayName` — always set to
 * `user.username`), so this just returns `username`; callers wanting a
 * "display name with a username fallback" get the same value either way.
 */
export async function GET() {
	try {
		const user = await getCurrentUserFromCookies();
		if (!user) {
			return NextResponse.json({ user: null });
		}
		return NextResponse.json({ user: { username: user.username, displayName: user.username } });
	} catch (error) {
		console.error("Session error:", error);
		return NextResponse.json({ user: null });
	}
}