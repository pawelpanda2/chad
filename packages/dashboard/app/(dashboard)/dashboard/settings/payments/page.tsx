"use client";

import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { ErrorBox } from "@/components/shared/error-box";
import { CreditCard } from "lucide-react";

// UX-only mirror of the server-side rule (packages/payments's
// parseAmountToMinorUnits) — real enforcement always happens server-side;
// this only avoids a round-trip for obviously-invalid input.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

function isPlausibleAmount(value: string): boolean {
	const trimmed = value.trim();
	return AMOUNT_PATTERN.test(trimmed) && Number(trimmed) > 0;
}

export default function PaymentsSettingsPage() {
	const [amount, setAmount] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [details, setDetails] = useState("");

	const handlePay = async () => {
		setError("");
		setDetails("");

		if (!isPlausibleAmount(amount)) {
			setError("Enter an amount greater than 0, with at most 2 decimal places.");
			return;
		}

		setSubmitting(true);
		try {
			const res = await fetch("/api/settings/payments/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ amount: amount.trim() }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error || "Could not start checkout.");
				setDetails(data.code ? `code: ${data.code}` : "");
				setSubmitting(false);
				return;
			}
			window.location.href = data.url;
		} catch (err) {
			setError("Network error while starting checkout.");
			setDetails(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Payments</h3>
				<p className="text-sm text-muted-foreground">
					Make a one-off card payment via Stripe Checkout. This is not a
					subscription — every payment is its own transaction, and you choose
					the amount each time.
				</p>
			</div>
			<Separator />

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
		</div>
	);
}
