import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared button-grid pattern used by every hub page (Forms, Views, Msg
 * Automation, Knowledge, Admin, Dashboards). Fixed 4-column grid on desktop
 * and phone landscape; phone portrait (below the `md` desktop breakpoint,
 * AND portrait orientation — tablet portrait stays at `md`+ so it keeps the
 * 4-column layout) drops to 2 columns so tiles are wide enough for their
 * label to wrap instead of truncating (Story 126).
 */
export function HubGrid({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("grid grid-cols-4 gap-2 max-md:portrait:grid-cols-2", className)}>{children}</div>;
}

interface HubTileProps {
	label: string;
	onClick: () => void;
	className?: string;
	ariaLabel?: string;
	title?: string;
}

/** One tile inside a {@link HubGrid} — identical markup across every hub page. */
export function HubTile({ label, onClick, className, ariaLabel, title }: HubTileProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={ariaLabel}
			title={title}
			className={cn(
				"flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]",
				className,
			)}
		>
			<span className="font-semibold text-sm">{label}</span>
		</button>
	);
}
