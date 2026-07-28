import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

// Routes that are API routes and should be protected
const protectedApiRoutes = ["/api"];

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const session = request.cookies.get("session");
	const method = request.method;

	if (
		method !== "GET" &&
		method !== "HEAD" &&
		process.env.CHAD_DATA_MODE === "offline-readonly-backup" &&
		pathname.startsWith("/api/") &&
		!pathname.startsWith("/api/auth/") &&
		!pathname.startsWith("/api/dev-settings/") &&
		!pathname.startsWith("/api/beeper-crm/")
	) {
		return NextResponse.json({ error: "OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN" }, { status: 403 });
	}

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