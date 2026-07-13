"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const MODES = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Dark / Light / System theme selector — a small segmented control. Rendered at
 * the top of the Settings page.
 */
export function ThemeModeSelector() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// next-themes only knows the resolved theme after mount; avoid a hydration
	// mismatch by not marking any option active until then.
	useEffect(() => setMounted(true), []);

	return (
		<div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
			{MODES.map(({ value, label, icon: Icon }) => {
				const active = mounted && theme === value;
				return (
					<button
						key={value}
						type="button"
						onClick={() => setTheme(value)}
						aria-pressed={active}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
							active
								? "bg-primary text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						<Icon className="h-4 w-4" />
						{label}
					</button>
				);
			})}
		</div>
	);
}
