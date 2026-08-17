"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
	kind: "real" | "test";
	provider: string;
	planId: string | null;
	licenseActivatedAt: string | null;
}

interface UserOption {
	id: string;
	username: string;
}

interface LicensePlan {
	id: string;
	userCount: number;
	amountMinor: number;
	currency: string;
	licensePeriod: string;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export default function AdminPaymentsPage() {
	const [tab, setTab] = useState("history");
	const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
	const [users, setUsers] = useState<UserOption[]>([]);
	const [plans, setPlans] = useState<LicensePlan[]>([]);
	const [filterUser, setFilterUser] = useState<string>("all");
	const [testUser, setTestUser] = useState<string>("");
	const [testPlan, setTestPlan] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState("");
	const [testMessage, setTestMessage] = useState("");

	useEffect(() => {
		fetch("/api/admin/users")
			.then((res) => res.json())
			.then((data) => {
				const list = Array.isArray(data) ? data : [];
				setUsers(
					list.map((u: { id: string; username: string }) => ({
						id: u.id,
						username: u.username,
					})),
				);
			})
			.catch(() => {
				/* filter options are best-effort; payments still load */
			});
	}, []);

	const loadPayments = useCallback(async (repoGuid: string) => {
		setLoading(true);
		setError("");
		try {
			const query = repoGuid === "all" ? "" : `?repoGuid=${encodeURIComponent(repoGuid)}`;
			const res = await fetch(`/api/admin/payments${query}`);
			const data = await res.json();
			if (!data.success) {
				setError(data.error || "Failed to load payments");
				setPayments([]);
				return;
			}
			setPayments(data.payments);
			if (Array.isArray(data.plans)) {
				setPlans(data.plans);
				setTestPlan((current) => current || data.plans[0]?.id || "");
			}
			if (data.currentUser?.repoGuid) {
				setTestUser((current) => current || data.currentUser.repoGuid);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load payments");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadPayments(filterUser);
	}, [filterUser, loadPayments]);

	const handleCreateTest = async () => {
		setError("");
		setTestMessage("");
		setCreating(true);
		try {
			const res = await fetch("/api/admin/payments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetRepoGuid: testUser, planId: testPlan }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error || "Failed to create test payment");
				return;
			}
			setTestMessage("TEST payment recorded. No card was charged.");
			await loadPayments(filterUser);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create test payment");
		} finally {
			setCreating(false);
		}
	};

	return (
		<DashboardPageShell
			contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")}
			title="Admin — Payments"
		>
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList aria-label="Payments">
					<TabsTrigger value="history">History</TabsTrigger>
					<TabsTrigger value="test">Test</TabsTrigger>
				</TabsList>
				<TabsContent value="history" className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Select value={filterUser} onValueChange={setFilterUser}>
							<SelectTrigger className="w-[220px]">
								<SelectValue placeholder="All users" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All users</SelectItem>
								{users.map((u) => (
									<SelectItem key={u.id} value={u.id}>
										{u.username}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<ErrorBox message={error || null} />
					{loading ? (
						<p className="py-4 text-sm text-muted-foreground">Loading payments...</p>
					) : (
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
											<TableHead>Kind</TableHead>
											<TableHead>Provider</TableHead>
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
													<Badge variant={p.kind === "test" ? "secondary" : "default"}>
														{p.kind === "test" ? "TEST" : "real"}
													</Badge>
												</TableCell>
												<TableCell>{p.provider}</TableCell>
												<TableCell>
													<Badge variant="secondary">{p.stripeMode ?? "—"}</Badge>
												</TableCell>
												<TableCell>{p.chadEnvironment ?? "—"}</TableCell>
												<TableCell className="font-mono text-xs">{p.id}</TableCell>
												<TableCell className="font-mono text-xs">
													{p.paymentIntentId ?? "—"}
												</TableCell>
												<TableCell>
													<Badge variant={p.status === "completed" ? "default" : "secondary"}>
														{p.status}
													</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</div>
					)}
				</TabsContent>
				<TabsContent value="test" className="space-y-3">
					<p className="text-sm text-muted-foreground">
						This creates a TEST payment record. It does not charge a card or call Stripe/Revolut.
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Select value={testUser} onValueChange={setTestUser}>
							<SelectTrigger className="w-[220px]">
								<SelectValue placeholder="User" />
							</SelectTrigger>
							<SelectContent>
								{users.map((u) => (
									<SelectItem key={u.id} value={u.id}>
										{u.username}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={testPlan} onValueChange={setTestPlan}>
							<SelectTrigger className="w-[280px]">
								<SelectValue placeholder="Plan" />
							</SelectTrigger>
							<SelectContent>
								{plans.map((plan) => (
									<SelectItem key={plan.id} value={plan.id}>
										{plan.userCount} users · {formatAmount(plan.amountMinor, plan.currency)} · {plan.licensePeriod}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button onClick={() => void handleCreateTest()} disabled={creating || !testUser || !testPlan}>
							{creating ? "Creating..." : "Create test payment"}
						</Button>
					</div>
					<ErrorBox message={error || null} />
					{testMessage ? <p className="text-sm">{testMessage}</p> : null}
				</TabsContent>
			</Tabs>
		</DashboardPageShell>
	);
}
