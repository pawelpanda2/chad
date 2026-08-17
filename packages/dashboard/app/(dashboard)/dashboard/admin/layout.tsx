"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin section — visible in sidebar only for isAdmin sessions; this layout
 * blocks direct URL access for everyone else.
 */
export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const [allowed, setAllowed] = useState<boolean | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/auth/session")
			.then((res) => res.json())
			.then((data: { user?: { isAdmin?: boolean } | null }) => {
				if (cancelled) return;
				if (!data.user?.isAdmin) {
					router.replace("/error/403");
					return;
				}
				setAllowed(true);
			})
			.catch(() => {
				if (!cancelled) router.replace("/error/403");
			});
		return () => {
			cancelled = true;
		};
	}, [router]);

	if (allowed !== true) {
		return null;
	}

	return children;
}
