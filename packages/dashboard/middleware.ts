import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "./lib/session-token";

// Previously this middleware only checked cookie *presence*, never its
// signature — a forged/tampered cookie would pass this pre-filter and only
// get caught deeper in each route (or not at all for any route that forgot
// to call getCurrentUserFromCookies()). Now calls the same
// verifySessionToken() every route uses. It's Web-Crypto-based (see
// session-token.ts's own doc comment), so it works on the Edge runtime this
// middleware already runs on — no runtime change needed.
export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - api/auth (public auth endpoints)
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 */
		"/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
	],
};

// Routes that don't require authentication
const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

// Routes that are API routes and should be protected
const protectedApiRoutes = ["/api"];

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const sessionCookie = request.cookies.get("session");
	// Signature + expiry check (not just presence) — a tampered or expired
	// cookie is treated identically to no cookie at all. See
	// verifySessionToken()'s own doc comment for the unsigned-fallback
	// behavior when SESSION_SIGNING_SECRET isn't configured yet.
	const session = sessionCookie && (await verifySessionToken(sessionCookie.value)) ? sessionCookie : undefined;
	const method = request.method;

	// 2026-07-30 removed: this used to gate writes here on
	// `process.env.CHAD_DATA_MODE === "offline-readonly-backup"`. That env
	// var is mutated at runtime by dev-db-override.ts's setPostgresSource()
	// (called from the Dev Panel's POST /api/dev-settings/db-source) — but
	// middleware runs in its own Edge runtime isolate, a separate JS realm
	// from the Node.js process that request runs in, so it never observed
	// the mutation. Net effect: once the process's very first
	// defaultPostgresSource() read ever resolved to "offline-readonly-backup"
	// (e.g. a stale persisted preference from a previous session), this
	// isolate stayed stuck rejecting every write with
	// OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN even after switching both DBs
	// back to Server in the Dev Panel — the Dev Panel itself, and every
	// actual mutation, correctly saw "server" (same Node.js process), so
	// only this pre-filter disagreed. The real, live-accurate enforcement
	// already exists deeper in the write path — assertChadWriteAllowed()
	// (chad-data-mode.ts), called from data-router.ts's executeWrite() and
	// cp-history/mutate-postgres.ts — which runs in the same request's
	// Node.js process as the Dev Panel toggle, so it can't go stale like
	// this middleware check did. No separate fix needed there; removing the
	// duplicate here is the fix.

	// Check if the route is public
	const isPublicRoute = publicRoutes.some((route) => {
		if (route === "/api/auth/login" || route === "/api/auth/logout" || route === "/api/auth/session") {
			return pathname === route;
		}
		return pathname === route || pathname.startsWith(route);
	});

	// Allow public routes
	if (isPublicRoute) {
		return NextResponse.next();
	}

	// Allow static files and assets
	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/assets") ||
		pathname.startsWith("/favicon") ||
		pathname === "/robots.txt" ||
		pathname === "/sitemap.xml" ||
		pathname === "/site.webmanifest" ||
		pathname.startsWith("/public") ||
		pathname === "/avatar.png" ||
		pathname === "/file.svg" ||
		pathname === "/globe.svg" ||
		pathname === "/window.svg" ||
		pathname === "/vercel.svg" ||
		pathname === "/next.svg" ||
		pathname === "/og-image.png"
	) {
		return NextResponse.next();
	}

	// For API routes, check if user is authenticated
	if (protectedApiRoutes.some((route) => pathname.startsWith(route))) {
		if (!session) {
			// Same shape every route's own getCurrentUserFromCookies() null-check
			// already returns (see e.g. app/api/folders/route.ts,
			// app/api/msg-automation/links/route.ts) — middleware runs first, so
			// its own response shape must match, not a different ad-hoc one.
			return NextResponse.json(
				{ success: false, error: "NOT_AUTHENTICATED" },
				{ status: 401 }
			);
		}
		return NextResponse.next();
	}

	// For page routes, redirect to login if not authenticated
	if (!session) {
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set("callbackUrl", encodeURI(pathname));
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}