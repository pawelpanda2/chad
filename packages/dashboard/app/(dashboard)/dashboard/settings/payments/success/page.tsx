"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { CheckCircle2, Loader2 } from "lucide-react";

type Status = "checking" | "pending" | "completed" | "not_found" | "error";

// The success page never treats its own presence (or the session_id query
// param) as proof of payment (§1.8) — it only ever displays whatever the
// server reports, which in turn only ever reflects the webhook-confirmed
// row. Polls a few times since the webhook can arrive slightly after the
// browser redirect.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

export default function PaymentsSuccessPage() {
	const searchParams = useSearchParams();
	const sessionId = searchParams.get("session_id");
	const [status, setStatus] = useState<Status>("checking");
	const attemptsRef = useRef(0);

	useEffect(() => {
		if (!sessionId) {
			setStatus("error");
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			try {
				const res = await fetch(
					`/api/settings/payments/status?sessionId=${encodeURIComponent(sessionId)}`,
				);
				const data = await res.json();
				if (cancelled) return;

				if (!res.ok || !data.success) {
					setStatus("error");
					return;
				}
				if (data.status === "completed") {
					setStatus("completed");
					return;
				}
				if (data.status === "not_found") {
					setStatus("not_found");
					return;
				}

				setStatus("pending");
				attemptsRef.current += 1;
				if (attemptsRef.current < MAX_POLLS) {
					timer = setTimeout(poll, POLL_INTERVAL_MS);
				}
			} catch {
				if (!cancelled) setStatus("error");
			}
		};

		poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [sessionId]);

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Payment</h3>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{status === "completed" ? (
							<CheckCircle2 className="h-5 w-5 text-green-600" />
						) : status === "checking" || status === "pending" ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : null}
						{status === "completed" && "Payment successful"}
						{(status === "checking" || status === "pending") && "Confirming your payment..."}
						{status === "not_found" && "Payment not found"}
						{status === "error" && "Could not confirm payment"}
					</CardTitle>
					<CardDescription>
						{status === "completed" &&
							"Thank you — your card payment has been confirmed."}
						{(status === "checking" || status === "pending") &&
							"Stripe is finalizing your payment. This usually takes a few seconds."}
						{status === "not_found" &&
							"We couldn't find a record of this checkout session."}
						{status === "error" &&
							"Something went wrong while checking the payment status."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{(status === "not_found" || status === "error") && (
						<ErrorBox message="If you completed the payment, it may still be processing — try refreshing in a moment." />
					)}
					<Button asChild variant="outline">
						<Link href="/dashboard/settings/payments">Back to Payments</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
