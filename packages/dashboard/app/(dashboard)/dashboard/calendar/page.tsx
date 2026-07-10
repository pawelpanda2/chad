"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Calendar as CalendarIcon,
	Clock,
	MapPin,
	Users,
} from "lucide-react";

const events = [
	{
		id: 1,
		title: "Team Meeting",
		date: "2024-03-20",
		time: "10:00 AM",
		duration: "1 hour",
		location: "Conference Room A",
		attendees: ["John Doe", "Jane Smith", "Bob Johnson"],
		type: "Meeting",
	},
	{
		id: 2,
		title: "Client Presentation",
		date: "2024-03-21",
		time: "2:00 PM",
		duration: "2 hours",
		location: "Virtual Meeting",
		attendees: ["Alice Brown", "Charlie Wilson"],
		type: "Presentation",
	},
	{
		id: 3,
		title: "Project Deadline",
		date: "2024-03-25",
		time: "5:00 PM",
		duration: "All day",
		location: "Office",
		attendees: ["David Lee", "Emma Davis"],
		type: "Deadline",
	},
	{
		id: 4,
		title: "Lunch with Client",
		date: "2024-03-22",
		time: "12:00 PM",
		duration: "1 hour",
		location: "Restaurant Downtown",
		attendees: ["Frank Miller"],
		type: "Meeting",
	},
];

export default function CalendarPage() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Calendar</h2>
					<p className="text-muted-foreground">
						Manage your schedule and upcoming events.
					</p>
				</div>
				<Button className="flex items-center gap-2">
					<Plus className="h-4 w-4" />
					New Event
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Calendar View */}
				<div className="lg:col-span-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<CalendarIcon className="h-5 w-5" />
								March 2024
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="h-[400px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
								<div className="text-center">
									<CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
									<p className="text-muted-foreground">
										Calendar view placeholder
									</p>
									<p className="text-sm text-muted-foreground">
										Interactive calendar component would go here
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Upcoming Events */}
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Upcoming Events</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{events.map((event, index) => (
								<div
									key={`${event.id}-${index}`}
									className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<h4 className="font-medium text-sm">{event.title}</h4>
											<div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
												<Clock className="h-3 w-3" />
												<span>{event.time}</span>
												<span>•</span>
												<span>{event.duration}</span>
											</div>
											<div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
												<MapPin className="h-3 w-3" />
												<span>{event.location}</span>
											</div>
											<div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
												<Users className="h-3 w-3" />
												<span>{event.attendees.length} attendees</span>
											</div>
										</div>
										<Badge
											variant={
												event.type === "Meeting"
													? "default"
													: event.type === "Presentation"
														? "secondary"
														: "outline"
											}
											className="text-xs"
										>
											{event.type}
										</Badge>
									</div>
								</div>
							))}
						</CardContent>
					</Card>

					{/* Quick Actions */}
					<Card>
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<Button
								variant="outline"
								size="sm"
								className="w-full justify-start"
							>
								<Plus className="h-4 w-4 mr-2" />
								Add Event
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="w-full justify-start"
							>
								<CalendarIcon className="h-4 w-4 mr-2" />
								View All Events
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="w-full justify-start"
							>
								<Users className="h-4 w-4 mr-2" />
								Share Calendar
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
