import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET() {
	try {
		const cookieStore = await cookies();
		const session = cookieStore.get("session");

		if (!session) {
			return NextResponse.json({ user: null });
		}

		// Parse session token (format: userId:timestamp)
		const [userId] = session.value.split(":");

		if (!userId) {
			return NextResponse.json({ user: null });
		}

		// Find user by ID
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				username: true,
				displayName: true,
				isActive: true,
			},
		});

		if (!user || !user.isActive) {
			return NextResponse.json({ user: null });
		}

		return NextResponse.json({ user });
	} catch (error) {
		console.error("Session error:", error);
		return NextResponse.json({ user: null });
	}
}