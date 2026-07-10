"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
	Shield,
	Lock,
	Eye,
	AlertTriangle,
	CheckCircle,
	Clock,
	MapPin,
	Smartphone,
} from "lucide-react";

const securityEvents = [
	{
		id: 1,
		type: "Login",
		description: "Successful login from New York, NY",
		time: "2 minutes ago",
		status: "success",
		icon: CheckCircle,
	},
	{
		id: 2,
		type: "Failed Login",
		description: "Failed login attempt from unknown location",
		time: "1 hour ago",
		status: "warning",
		icon: AlertTriangle,
	},
	{
		id: 3,
		type: "Password Change",
		description: "Password changed successfully",
		time: "3 hours ago",
		status: "success",
		icon: Lock,
	},
	{
		id: 4,
		type: "New Device",
		description: "New device logged in from San Francisco, CA",
		time: "1 day ago",
		status: "info",
		icon: Smartphone,
	},
];

const activeSessions = [
	{
		id: 1,
		device: "MacBook Pro",
		location: "New York, NY",
		ip: "192.168.1.100",
		lastActive: "2 minutes ago",
		current: true,
	},
	{
		id: 2,
		device: "iPhone 15",
		location: "San Francisco, CA",
		ip: "10.0.0.50",
		lastActive: "1 hour ago",
		current: false,
	},
	{
		id: 3,
		device: "Windows PC",
		location: "London, UK",
		ip: "172.16.0.25",
		lastActive: "3 days ago",
		current: false,
	},
];

export default function SecurityPage() {
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-3xl font-bold tracking-tight">Security</h2>
				<p className="text-muted-foreground">
					Manage your account security and monitor activity.
				</p>
			</div>

			{/* Security Overview */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Security Score
						</CardTitle>
						<Shield className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">95/100</div>
						<p className="text-xs text-muted-foreground">
							Excellent security posture
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Active Sessions
						</CardTitle>
						<Eye className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">3</div>
						<p className="text-xs text-muted-foreground">
							Across different devices
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Last Login</CardTitle>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">2 min ago</div>
						<p className="text-xs text-muted-foreground">From New York, NY</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Threats Blocked
						</CardTitle>
						<AlertTriangle className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">12</div>
						<p className="text-xs text-muted-foreground">This month</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Security Settings */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-5 w-5" />
							Security Settings
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Two-Factor Authentication</Label>
								<p className="text-sm text-muted-foreground">
									Add an extra layer of security to your account
								</p>
							</div>
							<Switch defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Login Notifications</Label>
								<p className="text-sm text-muted-foreground">
									Get notified of new login attempts
								</p>
							</div>
							<Switch defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Session Timeout</Label>
								<p className="text-sm text-muted-foreground">
									Automatically log out after inactivity
								</p>
							</div>
							<Switch />
						</div>
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Location Tracking</Label>
								<p className="text-sm text-muted-foreground">
									Track login locations for security
								</p>
							</div>
							<Switch defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Password History</Label>
								<p className="text-sm text-muted-foreground">
									Prevent reuse of recent passwords
								</p>
							</div>
							<Switch defaultChecked />
						</div>
					</CardContent>
				</Card>

				{/* Security Events */}
				<Card>
					<CardHeader>
						<CardTitle>Recent Security Events</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{securityEvents.map((event, index) => {
								const Icon = event.icon;
								return (
									<div
										key={`${event.id}-${index}`}
										className="flex items-center gap-3 p-3 border rounded-lg"
									>
										<Icon
											className={cn(
												"h-5 w-5",
												event.status === "success"
													? "text-green-600"
													: event.status === "warning"
														? "text-yellow-600"
														: "text-blue-600",
											)}
										/>
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<h4 className="font-medium text-sm">{event.type}</h4>
												<Badge
													variant={
														event.status === "success"
															? "default"
															: event.status === "warning"
																? "secondary"
																: "outline"
													}
													className="text-xs"
												>
													{event.status}
												</Badge>
											</div>
											<p className="text-sm text-muted-foreground">
												{event.description}
											</p>
											<p className="text-xs text-muted-foreground">
												{event.time}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Active Sessions */}
			<Card>
				<CardHeader>
					<CardTitle>Active Sessions</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{activeSessions.map((session, index) => (
							<div
								key={`${session.id}-${index}`}
								className="flex items-center justify-between p-4 border rounded-lg"
							>
								<div className="flex items-center gap-4">
									<div className="p-2 bg-gray-100 rounded-lg">
										<Smartphone className="h-5 w-5 text-gray-600" />
									</div>
									<div>
										<h4 className="font-medium">{session.device}</h4>
										<div className="flex items-center gap-4 text-sm text-muted-foreground">
											<span className="flex items-center gap-1">
												<MapPin className="h-3 w-3" />
												{session.location}
											</span>
											<span>IP: {session.ip}</span>
											<span>Last active: {session.lastActive}</span>
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2">
									{session.current && (
										<Badge variant="default" className="text-xs">
											Current
										</Badge>
									)}
									<Button variant="outline" size="sm">
										Revoke
									</Button>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function cn(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}
