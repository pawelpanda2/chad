"use client";

import { useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorBox } from "@/components/shared/error-box";

interface AdminPaymentRow {
	id: string;
	repoGuid: string;
	username: string;
	amountMinor: number;
	currency: string;
	status: string;
	stripeMode: string | null;
	chadEnvironment: string | null;
	paymentIntentId: string | null;
	createdAt: string;
	updatedAt: string;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export default function AdminPaymentsPage() {
	const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		fetch("/api/admin/payments")
			.then((res) => res.json())
			.then((data) => {
				if (!data.success) {
					setError(data.error || "Failed to load payments");
					return;
				}
				setPayments(data.payments);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load payments"))
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return (
			<DashboardPageShell title="Admin — Payments">
				<div className="py-4 text-sm text-muted-foreground">Loading payments...</div>
			</DashboardPageShell>
		);
	}

	return (
		<DashboardPageShell contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")} title="Admin — Payments">
			<p className="text-sm text-muted-foreground">
				Read-only transaction list — Stripe Checkout payments across all users. No card
				data is ever stored. Technical lifecycle logs live in the Dev Panel, not here.
			</p>
			<ErrorBox message={error || null} />
			<div className="border bg-muted/10">
				{payments.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>User</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Mode</TableHead>
								<TableHead>Environment</TableHead>
								<TableHead>Checkout Session</TableHead>
								<TableHead>PaymentIntent</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{payments.map((p) => (
								<TableRow key={p.id}>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{new Date(p.createdAt).toLocaleString("en-US", {
											year: "numeric",
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</TableCell>
									<TableCell>{p.username}</TableCell>
									<TableCell>{formatAmount(p.amountMinor, p.currency)}</TableCell>
									<TableCell>
										{p.stripeMode ? (
											<Badge variant={p.stripeMode === "live" ? "default" : "secondary"}>
												{p.stripeMode}
											</Badge>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">{p.chadEnvironment || "—"}</TableCell>
									<TableCell className="max-w-[220px] truncate font-mono text-xs" title={p.id}>
										{p.id}
									</TableCell>
									<TableCell className="max-w-[180px] truncate font-mono text-xs" title={p.paymentIntentId || undefined}>
										{p.paymentIntentId || "—"}
									</TableCell>
									<TableCell>
										<Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status}</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</DashboardPageShell>
	);
}
