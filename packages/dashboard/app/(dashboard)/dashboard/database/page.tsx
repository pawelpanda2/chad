"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Database,
	Plus,
	Download,
	Upload,
	RefreshCw,
	Settings,
	Eye,
	Edit,
	Trash2,
} from "lucide-react";

const databases = [
	{
		id: 1,
		name: "users_db",
		type: "PostgreSQL",
		size: "2.4 GB",
		tables: 15,
		status: "Active",
		lastBackup: "2 hours ago",
	},
	{
		id: 2,
		name: "analytics_db",
		type: "MySQL",
		size: "5.1 GB",
		tables: 28,
		status: "Active",
		lastBackup: "1 day ago",
	},
	{
		id: 3,
		name: "cache_db",
		type: "Redis",
		size: "856 MB",
		tables: 0,
		status: "Active",
		lastBackup: "6 hours ago",
	},
	{
		id: 4,
		name: "archive_db",
		type: "PostgreSQL",
		size: "12.3 GB",
		tables: 42,
		status: "Inactive",
		lastBackup: "1 week ago",
	},
];

export default function DatabasePage() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Database</h2>
					<p className="text-muted-foreground">
						Manage your databases and data operations.
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" className="flex items-center gap-2">
						<Upload className="h-4 w-4" />
						Import
					</Button>
					<Button className="flex items-center gap-2">
						<Plus className="h-4 w-4" />
						New Database
					</Button>
				</div>
			</div>

			{/* Database Stats */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Databases
						</CardTitle>
						<Database className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">4</div>
						<p className="text-xs text-muted-foreground">+1 from last month</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Size</CardTitle>
						<Database className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">20.6 GB</div>
						<p className="text-xs text-muted-foreground">
							+2.1 GB from last month
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Active Connections
						</CardTitle>
						<Database className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">127</div>
						<p className="text-xs text-muted-foreground">+12 from last hour</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Backup Status</CardTitle>
						<Database className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">Healthy</div>
						<p className="text-xs text-muted-foreground">
							Last backup: 2 hours ago
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Database List */}
			<Card>
				<CardHeader>
					<CardTitle>Databases</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{databases.map((db, index) => (
							<div
								key={`${db.id}-${index}`}
								className="flex items-center justify-between p-4 border rounded-lg"
							>
								<div className="flex items-center gap-4">
									<div className="p-2 bg-gray-100 rounded-lg">
										<Database className="h-6 w-6 text-gray-600" />
									</div>
									<div>
										<h4 className="font-medium">{db.name}</h4>
										<p className="text-sm text-muted-foreground">
											{db.type} • {db.tables} tables • {db.size}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-4">
									<Badge
										variant={db.status === "Active" ? "default" : "secondary"}
									>
										{db.status}
									</Badge>
									<span className="text-sm text-muted-foreground">
										Backup: {db.lastBackup}
									</span>
									<div className="flex items-center gap-2">
										<Button variant="ghost" size="icon">
											<Eye className="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="icon">
											<Edit className="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="icon">
											<Download className="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="icon">
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Quick Actions */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<RefreshCw className="h-5 w-5" />
							Backup
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							Create a backup of all your databases
						</p>
						<Button className="w-full">Create Backup</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Settings className="h-5 w-5" />
							Maintenance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							Run database maintenance tasks
						</p>
						<Button className="w-full">Run Maintenance</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Download className="h-5 w-5" />
							Export
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							Export database schemas and data
						</p>
						<Button className="w-full">Export Data</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
