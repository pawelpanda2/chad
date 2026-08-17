"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface LicenseListRow {
	id: string;
	company: string;
	username: string;
	repoGuid: string;
	userCount: number;
	licensePeriod: string;
	amountMinor: number;
	currency: string;
	status: string;
	purchasedAt: string | null;
	agreementVersion: string;
	acceptedAt: string;
}

interface LicenseDetail extends LicenseListRow {
	verifiedEmail: string | null;
	emailVerifiedAt: string | null;
	paymentMethod: string | null;
	paymentKind: string | null;
	stripeMode: string | null;
	paymentStatus: string | null;
	checkoutSessionId: string | null;
	paymentIntentId: string | null;
	agreementTextHash: string;
	agreementRecordLogicalHash: string;
	acceptedBy: string;
	businessSnapshot: Record<string, unknown>;
	generatedAt: string;
	agreementPdfHash: string;
	licenseActivatedAt: string | null;
	planId: string;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function formatDate(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function userCountLabel(count: number): string {
	return count === 1 ? "1 user" : `${count} users`;
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
	return (
		<div className="space-y-0.5">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="break-all font-mono text-xs">{value?.trim() ? value : "—"}</dd>
		</div>
	);
}

export default function AdminLicensesPage() {
	const [licenses, setLicenses] = useState<LicenseListRow[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detail, setDetail] = useState<LicenseDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [error, setError] = useState("");

	const loadList = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/admin/licenses");
			const data = await res.json();
			if (!data.success) {
				setError(data.error || "Failed to load licenses");
				setLicenses([]);
				return;
			}
			setLicenses(data.licenses);
			setSelectedId((current) => current ?? data.licenses[0]?.id ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load licenses");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadList();
	}, [loadList]);

	useEffect(() => {
		if (!selectedId) {
			setDetail(null);
			return;
		}
		setDetailLoading(true);
		fetch(`/api/admin/licenses/${encodeURIComponent(selectedId)}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.success) setDetail(data.license);
				else setError(data.error || "Failed to load license details");
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load details"))
			.finally(() => setDetailLoading(false));
	}, [selectedId]);

	return (
		<DashboardPageShell
			contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")}
			title="Admin — Licenses"
		>
			<p className="text-sm text-muted-foreground">
				Read-only registry of purchased licenses. PDF and details come from the immutable acceptance snapshot.
			</p>
			<ErrorBox message={error || null} />

			<div className="flex min-h-[420px] gap-3">
				<div className="min-w-0 flex-1 overflow-auto rounded-lg border bg-muted/10">
					{loading ? (
						<p className="p-4 text-sm text-muted-foreground">Loading licenses...</p>
					) : licenses.length === 0 ? (
						<p className="p-8 text-center text-sm text-muted-foreground">No licenses yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Company</TableHead>
									<TableHead>User</TableHead>
									<TableHead>License</TableHead>
									<TableHead>Period</TableHead>
									<TableHead>Price</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Purchased</TableHead>
									<TableHead>Agreement</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{licenses.map((row) => (
									<TableRow
										key={row.id}
										className={cn("cursor-pointer", selectedId === row.id && "bg-accent/60")}
										onClick={() => setSelectedId(row.id)}
									>
										<TableCell className="max-w-[140px] truncate">{row.company}</TableCell>
										<TableCell>{row.username}</TableCell>
										<TableCell>{userCountLabel(row.userCount)}</TableCell>
										<TableCell>{row.licensePeriod}</TableCell>
										<TableCell>{formatAmount(row.amountMinor, row.currency)}</TableCell>
										<TableCell>
											<Badge variant="secondary">{row.status}</Badge>
										</TableCell>
										<TableCell className="whitespace-nowrap text-muted-foreground">
											{formatDate(row.purchasedAt ?? row.acceptedAt)}
										</TableCell>
										<TableCell>{row.agreementVersion}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>

				<div className="w-[340px] shrink-0 rounded-lg border bg-muted/10 p-3">
					{detailLoading ? (
						<p className="text-sm text-muted-foreground">Loading details...</p>
					) : !detail ? (
						<p className="text-sm text-muted-foreground">Select a license.</p>
					) : (
						<div className="space-y-3">
							<div className="flex items-start justify-between gap-2">
								<h3 className="text-sm font-medium">License details</h3>
								<Button size="sm" variant="outline" asChild>
									<a
										href={`/api/admin/licenses/${encodeURIComponent(detail.id)}/pdf`}
										target="_blank"
										rel="noopener noreferrer"
									>
										View agreement PDF
									</a>
								</Button>
							</div>
							<dl className="grid gap-2">
								<DetailField label="License ID" value={detail.id} />
								<DetailField label="Company / Legal name snapshot" value={detail.company} />
								<DetailField label="User" value={detail.username} />
								<DetailField label="Repo GUID" value={detail.repoGuid} />
								<DetailField label="Verified email" value={detail.verifiedEmail} />
								<DetailField label="email_verified_at" value={formatDate(detail.emailVerifiedAt)} />
								<DetailField label="License user count" value={userCountLabel(detail.userCount)} />
								<DetailField label="License period" value="1 month" />
								<DetailField
									label="Price"
									value={`${formatAmount(detail.amountMinor, detail.currency)}`}
								/>
								<DetailField label="Payment method" value={detail.paymentMethod} />
								<DetailField label="payment_kind" value={detail.paymentKind} />
								<DetailField label="stripe_mode" value={detail.stripeMode} />
								<DetailField label="Payment status" value={detail.paymentStatus} />
								<DetailField label="Checkout Session ID" value={detail.checkoutSessionId} />
								<DetailField label="PaymentIntent ID" value={detail.paymentIntentId} />
								<DetailField label="Agreement version" value={detail.agreementVersion} />
								<DetailField label="agreement_text_hash" value={detail.agreementTextHash} />
								<DetailField label="agreement_record_logical_hash" value={detail.agreementRecordLogicalHash} />
								<DetailField label="accepted_at" value={formatDate(detail.acceptedAt)} />
								<DetailField label="accepted_by" value={detail.acceptedBy} />
								<DetailField label="generated_at" value={formatDate(detail.generatedAt)} />
								<DetailField label="agreement_pdf_hash" value={detail.agreementPdfHash} />
							</dl>
							<div className="space-y-1">
								<p className="text-xs text-muted-foreground">Business snapshot at acceptance</p>
								<pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-[10px] whitespace-pre-wrap">
									{JSON.stringify(detail.businessSnapshot, null, 2)}
								</pre>
							</div>
						</div>
					)}
				</div>
			</div>
		</DashboardPageShell>
	);
}
