"use client";

import { useState } from "react";
import { AlertCircle, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIAGNOSTICS_ENABLED } from "@/lib/flags";

interface ErrorBoxProps {
	/** Concise, user-facing error message (always shown). */
	message?: string | null;
	/**
	 * Diagnostic details (stack trace, debug JSON, raw response). Only rendered
	 * behind the "+" toggle, and only when diagnostics are enabled at build time
	 * — so test/prod builds never surface it.
	 */
	details?: string | null;
	className?: string;
}

/**
 * Standardized error indicator used across the app (login + dashboard tabs).
 *
 * A small red box labelled "error" with the concise message, plus a "+" toggle
 * that expands diagnostic details. The details (and the "+") only appear when
 * {@link DIAGNOSTICS_ENABLED} is true, so on test/prod the box stays a clean
 * one-line error with no diagnostic logs.
 */
export function ErrorBox({ message, details, className }: ErrorBoxProps) {
	const [open, setOpen] = useState(false);

	if (!message) return null;

	const hasDetails = DIAGNOSTICS_ENABLED && !!details;

	return (
		<div
			className={cn(
				"rounded-md border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
				className,
			)}
		>
			<div className="flex items-start gap-2 px-2 py-1.5">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
				<span className="min-w-0 flex-1 break-words">
					<span className="font-semibold">error:</span> {message}
				</span>
				{hasDetails && (
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						aria-label={open ? "Ukryj szczegóły" : "Pokaż szczegóły"}
						aria-expanded={open}
						className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
					>
						{open ? (
							<Minus className="h-4 w-4" />
						) : (
							<Plus className="h-4 w-4" />
						)}
					</button>
				)}
			</div>
			{hasDetails && open && (
				<pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-red-200 px-2 py-1.5 font-mono text-xs dark:border-red-900/50">
					{details}
				</pre>
			)}
		</div>
	);
}
