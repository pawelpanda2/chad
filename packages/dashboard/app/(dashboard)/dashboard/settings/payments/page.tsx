"use client";

import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBox } from "@/components/shared/error-box";
import { CreditCard } from "lucide-react";

// UX-only mirror of the server-side rule (packages/payments's
// parseAmountToMinorUnits) — real enforcement always happens server-side;
// this only avoids a round-trip for obviously-invalid input.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

// The spinner must never hang forever if the network stalls (Story 116
// continuation — a related report on the success page's own polling loop).
const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

function isPlausibleAmount(value: string): boolean {
	const trimmed = value.trim();
	return AMOUNT_PATTERN.test(trimmed) && Number(trimmed) > 0;
}

interface UserPaymentRow {
	id: string;
	amountMinor: number;
	currency: string;
	createdAt: string;
}

function formatAmount(row: UserPaymentRow): string {
	return `${(row.amountMinor / 100).toFixed(2)} ${row.currency}`;
}

export default function PaymentsSettingsPage() {
	const [amount, setAmount] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [details, setDetails] = useState("");
	const [history, setHistory] = useState<UserPaymentRow[]>([]);
	const [historyLoading, setHistoryLoading] = useState(true);

	useEffect(() => {
		fetch("/api/settings/payments/history")
			.then((res) => res.json())
			.then((data) => {
				if (data.success) setHistory(data.payments);
			})
			.catch(() => {
				/* history is a convenience list — a failed fetch here doesn't block paying */
			})
			.finally(() => setHistoryLoading(false));
	}, []);

	const handlePay = async () => {
		setError("");
		setDetails("");

		if (!isPlausibleAmount(amount)) {
			setError("Enter an amount greater than 0, with at most 2 decimal places.");
			return;
		}

		setSubmitting(true);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);
		try {
			const res = await fetch("/api/settings/payments/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ amount: amount.trim() }),
				signal: controller.signal,
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error || "Could not start checkout.");
				setDetails(data.code ? `code: ${data.code}` : "");
				setSubmitting(false);
				return;
			}
			// Redirect immediately — never leave the spinner up once we have a URL.
			window.location.href = data.url;
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setError("Starting checkout timed out — please try again.");
			} else {
				setError("Network error while starting checkout.");
				setDetails(err instanceof Error ? err.message : String(err));
			}
			setSubmitting(false);
		} finally {
			clearTimeout(timeout);
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Pay with card</CardTitle>
					<CardDescription>
						Enter the amount in PLN, then continue to Stripe&apos;s secure
						checkout page. Card details are entered on Stripe&apos;s page, never
						here.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="amount">Amount</Label>
						<div className="flex max-w-xs items-center gap-2">
							<Input
								id="amount"
								inputMode="decimal"
								placeholder="500.00"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								disabled={submitting}
							/>
							<span className="text-sm text-muted-foreground">PLN</span>
						</div>
					</div>

					<ErrorBox message={error || null} details={details || null} />

					<Button onClick={handlePay} disabled={submitting}>
						<CreditCard className="mr-2 h-4 w-4" />
						{submitting ? "Starting checkout..." : "Pay with card"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Previous payments</CardTitle>
				</CardHeader>
				<CardContent>
					{historyLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : history.length === 0 ? (
						<p className="text-sm text-muted-foreground">No successful payments yet.</p>
					) : (
						<ul className="divide-y">
							{history.map((row) => (
								<li key={row.id} className="flex items-center justify-between py-2 text-sm">
									<span className="text-muted-foreground">
										{new Date(row.createdAt).toLocaleString("en-US", {
											year: "numeric",
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
									<span className="font-medium">{formatAmount(row)}</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
