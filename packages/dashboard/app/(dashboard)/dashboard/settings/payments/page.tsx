"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/shared/error-box";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

interface LicensePlan {
	id: string;
	productName: string;
	userCount: number;
	amountMinor: number;
	currency: string;
	licensePeriod: string;
}

interface BusinessProfile {
	legalBusinessName: string;
	country: string;
}

interface Agreement {
	version: string;
	title: string;
	body: string;
	draft: boolean;
}

interface Verification {
	accountEmail: string;
	verifiedAt: string | null;
}

interface UserPaymentRow {
	id: string;
	amountMinor: number;
	currency: string;
	createdAt: string;
	status: string;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function clampUserCount(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.trunc(value)));
}

export default function PaymentsSettingsPage() {
	const [userCount, setUserCount] = useState(1);
	const [userCountMin, setUserCountMin] = useState(1);
	const [userCountMax, setUserCountMax] = useState(99);
	const [unitPriceMinor, setUnitPriceMinor] = useState(79000);
	const [planId, setPlanId] = useState("chad-dashboard-1u");
	const [_profile, setProfile] = useState<BusinessProfile | null>(null);
	const [agreement, setAgreement] = useState<Agreement | null>(null);
	const [verification, setVerification] = useState<Verification | null>(null);
	const [accountEmail, setAccountEmail] = useState<string | null>(null);
	const [payments, setPayments] = useState<UserPaymentRow[]>([]);
	const [testPayments, setTestPayments] = useState<UserPaymentRow[]>([]);
	const [declarationPreview, setDeclarationPreview] = useState<string | null>(null);
	const [businessComplete, setBusinessComplete] = useState(false);
	const [liveConfigured, setLiveConfigured] = useState(false);
	const [otpCode, setOtpCode] = useState("");
	const [localDevCode, setLocalDevCode] = useState("");
	const [provider, setProvider] = useState("stripe");
	const [accepted, setAccepted] = useState(false);
	const [acceptanceId, setAcceptanceId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [details, setDetails] = useState("");

	const selectedPlan = useMemo<LicensePlan | null>(() => {
		const count = clampUserCount(userCount, userCountMin, userCountMax);
		return {
			id: planId,
			productName: "CHAD Dashboard",
			userCount: count,
			amountMinor: count * unitPriceMinor,
			currency: "PLN",
			licensePeriod: "1 month",
		};
	}, [userCount, userCountMin, userCountMax, unitPriceMinor, planId]);

	const emailVerified = Boolean(verification?.verifiedAt);
	const showAgreement = emailVerified && businessComplete;

	const loadCommerce = useCallback(async (nextUserCount?: number) => {
		const count = clampUserCount(nextUserCount ?? userCount, userCountMin, userCountMax);
		const res = await fetch(`/api/settings/payments/commerce?userCount=${encodeURIComponent(String(count))}`);
		const data = await res.json();
		if (!data.success) {
			setError(data.error || "Failed to load payments");
			return;
		}
		const loadedCount = clampUserCount(data.userCount ?? count, data.userCountMin ?? 1, data.userCountMax ?? 99);
		setUserCountMin(data.userCountMin ?? 1);
		setUserCountMax(data.userCountMax ?? 99);
		setUnitPriceMinor(data.unitPriceMinor ?? 79000);
		setUserCount(loadedCount);
		setPlanId(data.planId ?? `chad-dashboard-${loadedCount}u`);
		setProfile(data.profile);
		setAgreement(data.agreement);
		setVerification(data.verification);
		setAccountEmail(data.accountEmail);
		setPayments(data.payments);
		setTestPayments(data.testPayments);
		setDeclarationPreview(data.declarationPreview);
		setBusinessComplete(Boolean(data.businessComplete));
		setLiveConfigured(Boolean(data.liveConfigured));
		setAccepted(false);
		setAcceptanceId(null);
	}, [userCount, userCountMin, userCountMax]);

	useEffect(() => {
		void loadCommerce(1)
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
	}, []);

	useEffect(() => {
		if (!loading) {
			void loadCommerce(userCount);
		}
	}, [userCount, loading, loadCommerce]);

	const handleUserCountChange = (raw: string) => {
		if (raw === "") {
			setUserCount(userCountMin);
			return;
		}
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return;
		setUserCount(clampUserCount(parsed, userCountMin, userCountMax));
	};

	const handleVerify = async () => {
		setError("");
		setDetails("");
		const res = await fetch("/api/settings/payments/verify-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ planId }),
		});
		const data = await res.json();
		if (!res.ok || !data.success) {
			setError(data.error || "Could not start verification.");
			return;
		}
		setLocalDevCode(typeof data.localDevCode === "string" ? data.localDevCode : "");
	};

	const handleConfirmOtp = async () => {
		setError("");
		const res = await fetch("/api/settings/payments/confirm-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ planId, code: otpCode.trim() }),
		});
		const data = await res.json();
		if (!res.ok || !data.success) {
			setError(data.error || "Verification failed.");
			return;
		}
		setVerification(data.verification);
		setOtpCode("");
		setLocalDevCode("");
	};

  const handleAcceptAgreement = async (): Promise<string | null> => {
		setError("");
		if (!accepted || !selectedPlan) return null;
		const res = await fetch("/api/settings/payments/accept", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ planId: selectedPlan.id, paymentMethod: provider }),
		});
		const data = await res.json();
		if (!res.ok || !data.success) {
			setError(data.error || "Could not record license acceptance.");
			return null;
		}
		setAcceptanceId(data.acceptanceId);
		return data.acceptanceId as string;
	};

	const handlePay = async () => {
		setError("");
		setDetails("");
		if (!selectedPlan) {
			setError("Select a license type.");
			return;
		}
		if (!businessComplete) {
			setError("Complete business details before payment.");
			return;
		}
		if (!emailVerified) {
			setError("Verify your account email before payment.");
			return;
		}
		if (!accepted) {
			setError("Accept the License Agreement before payment.");
			return;
		}
		if (provider === "revolut") {
			setError("Revolut is not available — integration is not configured.");
			return;
		}
		if (provider === "stripe" && !liveConfigured) {
			setError("Stripe payment is not configured in this environment.");
			return;
		}
		setSubmitting(true);
		try {
			const id = acceptanceId || (await handleAcceptAgreement());
			if (!id) {
				setSubmitting(false);
				return;
			}
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);
			try {
				const res = await fetch("/api/settings/payments/checkout", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ acceptanceId: id, provider }),
					signal: controller.signal,
				});
				const data = await res.json();
				if (!res.ok || !data.success) {
					setError(data.error || "Could not start checkout.");
					setDetails(data.code ? `code: ${data.code}` : "");
					setSubmitting(false);
					return;
				}
				window.location.href = data.url;
			} finally {
				clearTimeout(timeout);
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setError("Starting checkout timed out — please try again.");
			} else {
				setError("Network error while starting checkout.");
				setDetails(err instanceof Error ? err.message : String(err));
			}
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="space-y-4 rounded-lg border bg-background p-4">
				{loading ? (
					<p className="text-sm text-muted-foreground">Loading...</p>
				) : (
					<>
						<div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
							<Label>Payment method</Label>
							<Select value={provider} onValueChange={setProvider}>
								<SelectTrigger className="max-w-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="stripe">Stripe</SelectItem>
									<SelectItem value="revolut" disabled>
										Revolut (not configured)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
							<Label htmlFor="license-user-count">Users</Label>
							<Input
								id="license-user-count"
								type="number"
								min={userCountMin}
								max={userCountMax}
								step={1}
								className="max-w-xs"
								value={userCount}
								onChange={(e) => handleUserCountChange(e.target.value)}
							/>
						</div>

						<div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
							<Label>Price</Label>
							<p className="text-sm">
								{selectedPlan ? (
									<>
										<span className="font-medium">
											{formatAmount(selectedPlan.amountMinor, selectedPlan.currency)}
										</span>
										<span className="text-muted-foreground">
											{" "}
											({formatAmount(unitPriceMinor, selectedPlan.currency)} per user) for 1 month
										</span>
									</>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</p>
						</div>

						<Separator />

						{!businessComplete ? (
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
								<p>Complete business details before purchase.</p>
								<Link href="/dashboard/settings?tab=business" className="underline underline-offset-4">
									Account → Business
								</Link>
							</div>
						) : null}

						<div className="space-y-2">
							<p className="text-sm font-medium">Email verification</p>
							<p className="text-sm text-muted-foreground">
								Confirm your identity with a one-time code sent to your account email
								{accountEmail ? ` (${accountEmail})` : ""}.
							</p>
							{emailVerified ? (
								<Badge variant="secondary">
									Verified {verification?.verifiedAt ? new Date(verification.verifiedAt).toLocaleString() : ""}
								</Badge>
							) : businessComplete ? (
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" variant="outline" onClick={() => void handleVerify()} disabled={submitting}>
										Send verification code
									</Button>
									<Input
										className="w-32"
										placeholder="6-digit code"
										value={otpCode}
										onChange={(e) => setOtpCode(e.target.value)}
									/>
									<Button
										type="button"
										variant="outline"
										onClick={() => void handleConfirmOtp()}
										disabled={submitting || !otpCode}
									>
										Confirm
									</Button>
									{localDevCode ? (
										<span className="font-mono text-xs text-muted-foreground">{localDevCode}</span>
									) : null}
								</div>
							) : null}
						</div>

						{showAgreement && agreement ? (
							<div className="space-y-2">
								<p className="text-sm font-medium">
									{agreement.title}
									{agreement.draft ? " (draft)" : ""}
								</p>
								<div className="max-h-64 overflow-y-auto rounded-md border p-3 text-xs whitespace-pre-wrap text-muted-foreground">
									{agreement.body}
								</div>
								{declarationPreview ? (
									<p className="text-sm">{declarationPreview}</p>
								) : null}
								<label className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										className="mt-1"
										checked={accepted}
										onChange={(e) => setAccepted(e.target.checked)}
									/>
									<span>
										I accept License Agreement {agreement.version} and confirm the declaration above.
									</span>
								</label>
							</div>
						) : null}

						<ErrorBox message={error || null} details={details || null} />

						<Button
							onClick={() => void handlePay()}
							disabled={
								submitting ||
								!accepted ||
								!emailVerified ||
								!businessComplete ||
								(provider === "stripe" && !liveConfigured)
							}
						>
							{submitting ? "Starting checkout..." : "Pay"}
						</Button>
					</>
				)}
			</div>

			<div className="space-y-2">
				<h3 className="text-sm font-medium">Payment history</h3>
				{loading ? (
					<p className="text-sm text-muted-foreground">Loading...</p>
				) : payments.length === 0 ? (
					<p className="text-sm text-muted-foreground">No payments yet.</p>
				) : (
					<ul className="divide-y rounded-md border text-sm">
						{payments.map((row) => (
							<li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
								<span className="text-muted-foreground">
									{new Date(row.createdAt).toLocaleString("en-US", {
										year: "numeric",
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
								<span>{row.status}</span>
								<span className="font-medium">{formatAmount(row.amountMinor, row.currency)}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			{testPayments.length > 0 ? (
				<div className="space-y-2">
					<h3 className="text-sm font-medium">Test payments</h3>
					<ul className="divide-y rounded-md border text-sm">
						{testPayments.map((row) => (
							<li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
								<Badge variant="secondary">TEST</Badge>
								<span className="text-muted-foreground">
									{new Date(row.createdAt).toLocaleString("en-US", {
										year: "numeric",
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
								<span>{row.status}</span>
								<span className="font-medium">{formatAmount(row.amountMinor, row.currency)}</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
