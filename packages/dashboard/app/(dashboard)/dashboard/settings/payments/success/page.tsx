"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { CheckCircle2, Loader2, Clock } from "lucide-react";

type Status = "checking" | "pending" | "completed" | "not_found" | "error" | "timed_out";

// The success page never treats its own presence (or the session_id query
// param) as proof of payment (§1.8) — it only ever displays whatever the
// server reports, which in turn only ever reflects the webhook-confirmed
// row. Polls a few times since the webhook can arrive slightly after the
// browser redirect.
//
// Root cause of a real report (Story 116 continuation): a payment that
// genuinely succeeded on Stripe never showed as confirmed here because no
// webhook endpoint was reachable at all (no public URL yet) — the DB row
// stayed 'pending' forever, so this page polled forever too. Before this
// fix, exhausting MAX_POLLS just silently stopped scheduling further polls
// while leaving `status` (and therefore the spinner) at "pending" — the
// page LOOKED like an infinite hang even though polling had actually
// stopped. Now it transitions to an explicit "timed_out" terminal state.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

// Success and the main Payments page are the same Settings tab — once
// confirmed, return there automatically instead of making the user click a
// redundant "Back to Payments" button (the new payment shows up in its
// history list there).
const REDIRECT_AFTER_SUCCESS_MS = 1500;

export default function PaymentsSuccessPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const sessionId = searchParams.get("session_id");
	const [status, setStatus] = useState<Status>("checking");
	const attemptsRef = useRef(0);
	const cancelledRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const startPolling = useCallback(() => {
		if (!sessionId) {
			setStatus("error");
			return;
		}

		cancelledRef.current = false;
		attemptsRef.current = 0;
		setStatus("checking");

		const poll = async () => {
			try {
				const res = await fetch(
					`/api/settings/payments/status?sessionId=${encodeURIComponent(sessionId)}`,
				);
				const data = await res.json();
				if (cancelledRef.current) return;

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

				attemptsRef.current += 1;
				if (attemptsRef.current >= MAX_POLLS) {
					// Terminal state — never leave the spinner running forever.
					setStatus("timed_out");
					return;
				}
				setStatus("pending");
				timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
			} catch {
				if (!cancelledRef.current) setStatus("error");
			}
		};

		poll();
	}, [sessionId]);

	useEffect(() => {
		startPolling();
		return () => {
			cancelledRef.current = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [startPolling]);

	useEffect(() => {
		if (status !== "completed") return;
		const t = setTimeout(() => router.push("/dashboard/settings/payments"), REDIRECT_AFTER_SUCCESS_MS);
		return () => clearTimeout(t);
	}, [status, router]);

	const isSpinning = status === "checking" || status === "pending";

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
						) : status === "timed_out" ? (
							<Clock className="h-5 w-5 text-muted-foreground" />
						) : isSpinning ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : null}
						{status === "completed" && "Payment successful"}
						{isSpinning && "Confirming your payment..."}
						{status === "timed_out" && "Still confirming"}
						{status === "not_found" && "Payment not found"}
						{status === "error" && "Could not confirm payment"}
					</CardTitle>
					<CardDescription>
						{status === "completed" &&
							"Thank you — your card payment has been confirmed."}
						{isSpinning &&
							"Stripe is finalizing your payment. This usually takes a few seconds."}
						{status === "timed_out" &&
							"We couldn't confirm this payment yet. If you completed it on Stripe's page, it may still be processing — check again in a moment."}
						{status === "not_found" &&
							"We couldn't find a record of this checkout session."}
						{status === "error" &&
							"Something went wrong while checking the payment status."}
					</CardDescription>
				</CardHeader>
				{(status === "not_found" || status === "error" || status === "timed_out") && (
					<CardContent className="space-y-4">
						<ErrorBox message="If you completed the payment, it may still be processing — try checking again in a moment." />
						<Button onClick={startPolling}>Check again</Button>
					</CardContent>
				)}
			</Card>
		</div>
	);
}
