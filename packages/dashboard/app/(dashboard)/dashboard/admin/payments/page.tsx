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
import { Input } from "@/components/ui/input";
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
	kind: "user_payment" | "admin_test";
	provider: string;
}

interface UserOption {
	id: string;
	username: string;
}

function formatAmount(amountMinor: number, currency: string): string {
	return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function kindLabel(kind: string): string {
	if (kind === "admin_test") return "admin_test";
	if (kind === "user_payment") return "user_payment";
	return kind;
}

export default function AdminPaymentsPage() {
	const [tab, setTab] = useState("history");
	const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
	const [users, setUsers] = useState<UserOption[]>([]);
	const [filterUser, setFilterUser] = useState<string>("all");
	const [testUser, setTestUser] = useState<string>("");
	const [testAmount, setTestAmount] = useState("30.00");
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState("");

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
				/* filter options are best-effort */
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
		setCreating(true);
		try {
			const res = await fetch("/api/admin/payments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetRepoGuid: testUser, amountMajor: testAmount }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error || "Failed to start test payment");
				return;
			}
			if (data.url) {
				window.location.href = data.url;
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start test payment");
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
													<Badge variant={p.kind === "admin_test" ? "secondary" : "default"}>
														{kindLabel(p.kind)}
													</Badge>
												</TableCell>
												<TableCell>{p.provider}</TableCell>
												<TableCell>
													<Badge variant="secondary">{p.stripeMode ?? "—"}</Badge>
												</TableCell>
												<TableCell>{p.chadEnvironment ?? "—"}</TableCell>
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
						Stripe Sandbox checkout for a selected user. Records payment_kind=admin_test, stripe_mode=test.
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
						<Input
							className="w-[120px]"
							value={testAmount}
							onChange={(e) => setTestAmount(e.target.value)}
							aria-label="Amount PLN"
						/>
						<span className="text-sm text-muted-foreground">PLN</span>
						<Button onClick={() => void handleCreateTest()} disabled={creating || !testUser}>
							{creating ? "Starting..." : "Start test payment"}
						</Button>
					</div>
					<ErrorBox message={error || null} />
				</TabsContent>
			</Tabs>
		</DashboardPageShell>
	);
}
