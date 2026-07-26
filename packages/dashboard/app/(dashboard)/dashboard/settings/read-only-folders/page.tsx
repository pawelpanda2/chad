"use client";

import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ErrorBox } from "@/components/shared/error-box";
import { RefreshCw, Lock } from "lucide-react";

interface ReadOnlyFolderRow {
	name: string;
	address: string;
	managedBy: string;
	reason: string;
	status: "read-only";
}

/**
 * Settings -> Read-only folders — lists the CP folders that are actually
 * owned by a dedicated Dashboard table (Daily Tracker/Dates/Leads) and are
 * therefore read-only from the generic Folders browser (see `dba`'s
 * `system-folders.ts` / `assertNotSystemFolderWrite`, enforced server-side
 * on every Folders write — this page is purely informational).
 */
export default function ReadOnlyFoldersPage() {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [rows, setRows] = useState<ReadOnlyFolderRow[]>([]);

	useEffect(() => {
		fetch("/api/settings/read-only-folders")
			.then(async (res) => {
				const json = (await res.json()) as { success: boolean; data?: ReadOnlyFolderRow[]; error?: string };
				if (!json.success || !json.data) throw new Error(json.error || "Failed to load read-only folders");
				setRows(json.data);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
			.finally(() => setIsLoading(false));
	}, []);

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Read-only folders</h3>
				<p className="text-sm text-muted-foreground">
					These folders are managed by their own dedicated Dashboard page — editing them from the
					generic Folders browser is blocked.
				</p>
			</div>
			<Separator />

			{isLoading && (
				<div className="flex items-center justify-center py-8">
					<RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			)}

			{error && <ErrorBox message={error} />}

			{!isLoading && !error && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Lock className="h-4 w-4" />
							Managed folders
						</CardTitle>
						<CardDescription>
							{rows.length} folder{rows.length === 1 ? "" : "s"} protected from Folders-GUI writes.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Folder</TableHead>
									<TableHead>Managed by</TableHead>
									<TableHead>Reason</TableHead>
									<TableHead className="text-right">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.address}>
										<TableCell className="font-mono text-xs">{row.address}</TableCell>
										<TableCell className="font-medium">{row.managedBy}</TableCell>
										<TableCell className="text-sm text-muted-foreground">{row.reason}</TableCell>
										<TableCell className="text-right">
											<Badge variant="outline">read-only</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
