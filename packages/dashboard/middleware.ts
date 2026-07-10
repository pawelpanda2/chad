import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

// Routes that are API routes and should be protected
const protectedApiRoutes = ["/api"];

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const session = request.cookies.get("session");

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
			return NextResponse.json(
				{ error: "Unauthorized" },
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