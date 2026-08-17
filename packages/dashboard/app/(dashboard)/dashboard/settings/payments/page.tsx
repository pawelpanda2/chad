"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

interface LicensePlan {
	id: string;
	productName: string;
	productVersion: string;
	userCount: number;
	amountMinor: number;
	currency: string;
	licensePeriod: string;
	territory: string;
}

interface LicenseeProfile {
	legalBusinessName: string;
	country: string;
	state: string | null;
	filingId: string | null;
	businessAddress: string | null;
	representativeFullName: string;
	representativeEmail: string;
	verifiedAt: string | null;
}

interface Agreement {
	version: string;
	title: string;
	body: string;
	draft: boolean;
}

interface UserPaymentRow {
	id: string;
	amountMinor: number;
	currency: string;
	createdAt: string;
	kind: "real" | "test";
	provider: string;
	status: string;
	planId: string | null;
	licenseUserCount: number | null;
	licensePeriod: string | null;
	licenseTerritory: string | null;
	agreementVersion: string | null;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function declarationFor(plan: LicensePlan | undefined, company: string, agreementVersion: string): string {
	if (!plan) return "";
	return `I declare that I am authorized to act on behalf of ${company || "[COMPANY]"} and, on its behalf, accept License Agreement ${agreementVersion} for ${plan.productName}, covering ${plan.userCount} users for ${plan.licensePeriod}, for a license fee of ${(plan.amountMinor / 100).toFixed(2)} ${plan.currency}.`;
}

export default function PaymentsSettingsPage() {
	const [plans, setPlans] = useState<LicensePlan[]>([]);
	const [planId, setPlanId] = useState("");
	const [profile, setProfile] = useState<LicenseeProfile | null>(null);
	const [agreement, setAgreement] = useState<Agreement | null>(null);
	const [payments, setPayments] = useState<UserPaymentRow[]>([]);
	const [testPayments, setTestPayments] = useState<UserPaymentRow[]>([]);
	const [legalBusinessName, setLegalBusinessName] = useState("");
	const [country, setCountry] = useState("Poland");
	const [state, setState] = useState("");
	const [filingId, setFilingId] = useState("");
	const [businessAddress, setBusinessAddress] = useState("");
	const [representativeFullName, setRepresentativeFullName] = useState("");
	const [representativeEmail, setRepresentativeEmail] = useState("");
	const [otpCode, setOtpCode] = useState("");
	const [localDevCode, setLocalDevCode] = useState("");
	const [provider, setProvider] = useState("stripe");
	const [accepted, setAccepted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [details, setDetails] = useState("");

	const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
	const verified = Boolean(profile?.verifiedAt);
	const declaration = declarationFor(selectedPlan, legalBusinessName, agreement?.version ?? "");

	const applyProfile = useCallback((next: LicenseeProfile | null) => {
		setProfile(next);
		if (!next) return;
		setLegalBusinessName(next.legalBusinessName);
		setCountry(next.country);
		setState(next.state ?? "");
		setFilingId(next.filingId ?? "");
		setBusinessAddress(next.businessAddress ?? "");
		setRepresentativeFullName(next.representativeFullName);
		setRepresentativeEmail(next.representativeEmail);
	}, []);

	useEffect(() => {
		fetch("/api/settings/payments/commerce")
			.then((res) => res.json())
			.then((data) => {
				if (!data.success) {
					setError(data.error || "Failed to load payments");
					return;
				}
				setPlans(data.plans);
				if (data.plans[0]) setPlanId(data.plans[0].id);
				setAgreement(data.agreement);
				setPayments(data.payments);
				setTestPayments(data.testPayments);
				applyProfile(data.profile);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load payments"))
			.finally(() => setLoading(false));
	}, [applyProfile]);

	const saveProfile = async (): Promise<LicenseeProfile | null> => {
		const res = await fetch("/api/settings/payments/licensee", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				legalBusinessName,
				country,
				state,
				filingId,
				businessAddress,
				representativeFullName,
				representativeEmail,
			}),
		});
		const data = await res.json();
		if (!res.ok || !data.success) {
			setError(data.error || "Could not save licensee.");
			return null;
		}
		applyProfile(data.profile);
		return data.profile as LicenseeProfile;
	};

	const handleVerify = async () => {
		setError("");
		setDetails("");
		const saved = await saveProfile();
		if (!saved) return;
		const res = await fetch("/api/settings/payments/verify-email", { method: "POST" });
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
			body: JSON.stringify({ code: otpCode.trim() }),
		});
		const data = await res.json();
		if (!res.ok || !data.success) {
			setError(data.error || "Verification failed.");
			return;
		}
		applyProfile(data.profile);
		setOtpCode("");
		setLocalDevCode("");
	};

	const handlePay = async () => {
		setError("");
		setDetails("");
		if (!selectedPlan) {
			setError("Select a license plan.");
			return;
		}
		if (!accepted) {
			setError("Accept the License Agreement before payment.");
			return;
		}
		if (provider !== "stripe") {
			setError("Revolut Pro is not available — no verifiable merchant payment API is configured.");
			return;
		}
		setSubmitting(true);
		try {
			const saved = await saveProfile();
			if (!saved) {
				setSubmitting(false);
				return;
			}
			const acceptRes = await fetch("/api/settings/payments/accept", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ planId: selectedPlan.id }),
			});
			const acceptData = await acceptRes.json();
			if (!acceptRes.ok || !acceptData.success) {
				setError(acceptData.error || "Could not record license acceptance.");
				setSubmitting(false);
				return;
			}
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);
			try {
				const res = await fetch("/api/settings/payments/checkout", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ acceptanceId: acceptData.acceptanceId, provider }),
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
			<Card>
				<CardHeader>
					<CardTitle>Payment</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{loading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : (
						<>
							<Select value={planId} onValueChange={setPlanId}>
								<SelectTrigger className="max-w-md">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{plans.map((plan) => (
										<SelectItem key={plan.id} value={plan.id}>
											{plan.userCount} users · {formatAmount(plan.amountMinor, plan.currency)} · {plan.licensePeriod}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{selectedPlan && (
								<p className="text-sm text-muted-foreground">
									{selectedPlan.productName} · {selectedPlan.territory} · {selectedPlan.currency}
								</p>
							)}

							<Input placeholder="Legal business name" value={legalBusinessName} onChange={(e) => setLegalBusinessName(e.target.value)} />
							<Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
							<Input placeholder="State / filing region" value={state} onChange={(e) => setState(e.target.value)} />
							<Input placeholder="Company registration / filing ID" value={filingId} onChange={(e) => setFilingId(e.target.value)} />
							<Input placeholder="Business address" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} />
							<Input placeholder="Authorized representative" value={representativeFullName} onChange={(e) => setRepresentativeFullName(e.target.value)} />
							<Input placeholder="Representative email" value={representativeEmail} onChange={(e) => setRepresentativeEmail(e.target.value)} />

							{verified ? (
								<Badge variant="secondary">Verified {profile?.verifiedAt ? new Date(profile.verifiedAt).toLocaleDateString() : ""}</Badge>
							) : (
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" variant="outline" onClick={() => void handleVerify()} disabled={submitting}>
										Verify email
									</Button>
									<Input className="w-32" placeholder="Code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
									<Button type="button" variant="outline" onClick={() => void handleConfirmOtp()} disabled={submitting || !otpCode}>
										Confirm
									</Button>
									{localDevCode ? <span className="font-mono text-xs text-muted-foreground">{localDevCode}</span> : null}
								</div>
							)}

							<Select value={provider} onValueChange={setProvider}>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="stripe">Stripe</SelectItem>
									<SelectItem value="revolut" disabled>
										Revolut Pro
									</SelectItem>
								</SelectContent>
							</Select>

							{agreement ? (
								<details className="rounded-md border p-3 text-sm">
									<summary className="cursor-pointer">
										{agreement.title}
										{agreement.draft ? " (draft)" : ""}
									</summary>
									<pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{agreement.body}</pre>
								</details>
							) : null}

							<label className="flex items-start gap-2 text-sm">
								<input
									type="checkbox"
									className="mt-1"
									checked={accepted}
									onChange={(e) => setAccepted(e.target.checked)}
								/>
								<span>{declaration}</span>
							</label>

							<ErrorBox message={error || null} details={details || null} />

							<Button onClick={() => void handlePay()} disabled={submitting || !accepted || !verified}>
								{submitting ? "Starting checkout..." : "Accept License & Continue to Payment"}
							</Button>
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Payment history</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : payments.length === 0 ? (
						<p className="text-sm text-muted-foreground">No successful payments yet.</p>
					) : (
						<ul className="divide-y">
							{payments.map((row) => (
								<li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
									<span className="text-muted-foreground">
										{new Date(row.createdAt).toLocaleString("en-US", {
											year: "numeric",
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
									<span>{row.provider}</span>
									<span>{row.status}</span>
									{row.licenseUserCount ? <span>{row.licenseUserCount} users</span> : null}
									{row.licensePeriod ? <span>{row.licensePeriod}</span> : null}
									{row.agreementVersion ? <span>{row.agreementVersion}</span> : null}
									<span className="font-medium">{formatAmount(row.amountMinor, row.currency)}</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			{testPayments.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Test payments</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="divide-y">
							{testPayments.map((row) => (
								<li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
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
									<span className="font-medium">{formatAmount(row.amountMinor, row.currency)}</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
