"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Folder, Search, MoreHorizontal, Calendar, User, MapPin, Phone, Instagram } from "lucide-react";

interface Outing {
	id: number;
	title: string;
	date: string;
	type: string;
	location: string | null;
	description: string;
	createdAt: string;
	_count: { leads: number };
}

interface Lead {
	id: number;
	name: string;
	age: number | null;
	source: string;
	phone: string | null;
	instagram: string | null;
	facebook: string | null;
	whatsappName: string | null;
	shortDescription: string | null;
	status: string;
	notes: string | null;
	outingId: number | null;
	createdAt: string;
	outing: { id: number; title: string; date: string; type: string } | null;
}

const getStatusColor = (status: string) => {
	const colors: Record<string, string> = {
		new: "bg-green-500",
		texting: "bg-blue-500",
		invited: "bg-yellow-500",
		date_planned: "bg-purple-500",
		met: "bg-pink-500",
		cold: "bg-gray-500",
		rejected: "bg-red-500",
		archived: "bg-slate-500",
	};
	return colors[status] || "bg-gray-500";
};

const getTypeLabel = (type: string) => {
	const labels: Record<string, string> = {
		daygame: "Daygame",
		club: "Club",
		date: "Date",
		party: "Party",
		event: "Event",
		other: "Other",
	};
	return labels[type] || type;
};

const getLeadSourceLabel = (source: string) => {
	const labels: Record<string, string> = {
		daygame: "Daygame",
		club: "Club",
		tinder: "Tinder",
		instagram: "Instagram",
		facebook: "Facebook",
		whatsapp: "WhatsApp",
		party: "Party",
		other: "Other",
	};
	return labels[source] || source;
};

export default function DataLibPage() {
	const [outings, setOutings] = useState<Outing[]>([]);
	const [leads, setLeads] = useState<Lead[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		fetchData();
	}, []);

	const fetchData = async () => {
		try {
			const [outingsRes, leadsRes] = await Promise.all([
				fetch("/api/outings"),
				fetch("/api/leads"),
			]);
			
			if (!outingsRes.ok) {
				throw new Error(`Failed to fetch outings: ${outingsRes.status}`);
			}
			if (!leadsRes.ok) {
				throw new Error(`Failed to fetch leads: ${leadsRes.status}`);
			}
			
			const outingsData = await outingsRes.json();
			const leadsData = await leadsRes.json();
			
			// Handle error responses from API
			if (Array.isArray(outingsData)) {
				setOutings(outingsData);
			} else {
				console.error("Invalid outings data:", outingsData);
				setOutings([]);
			}
			
			if (Array.isArray(leadsData)) {
				setLeads(leadsData);
			} else {
				console.error("Invalid leads data:", leadsData);
				setLeads([]);
			}
		} catch (error) {
			console.error("Error fetching data:", error);
			setOutings([]);
			setLeads([]);
		} finally {
			setLoading(false);
		}
	};

	const filteredOutings = outings.filter(o =>
		o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
		o.location?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredLeads = leads.filter(l =>
		l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		l.shortDescription?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	if (loading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">DataLib</h1>
					<p className="text-muted-foreground">Ładowanie danych...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">DataLib</h1>
				<p className="text-muted-foreground">
					Przeglądaj zebrane dane z wyjść i kontaktów
				</p>
			</div>

			<Tabs defaultValue="outings" className="space-y-6">
				<TabsList>
					<TabsTrigger value="outings">Wyjścia ({outings.length})</TabsTrigger>
					<TabsTrigger value="leads">Kontakty ({leads.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="outings">
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
						{/* Sidebar - Simple folders */}
						<div className="lg:col-span-1">
							<Card>
								<CardContent className="p-4">
									<h3 className="font-semibold mb-4">Foldery</h3>
									<div className="space-y-2">
										<div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 cursor-pointer">
											<div className="flex items-center gap-2">
												<Folder className="h-4 w-4 text-primary" />
												<span className="text-sm font-medium">Wyjścia</span>
											</div>
											<Badge variant="secondary" className="text-xs">
												{outings.length}
											</Badge>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Main content - Outings list */}
						<div className="lg:col-span-3">
							<Card>
								<CardContent className="p-6">
									<div className="flex items-center justify-between mb-4">
										<h3 className="font-semibold">Ostatnie wyjścia</h3>
										<div className="relative w-64">
											<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Szukaj wyjść..."
												className="pl-10"
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
											/>
										</div>
									</div>
									{filteredOutings.length === 0 ? (
										<p className="text-sm text-muted-foreground text-center py-8">
											Brak wyjść. Dodaj pierwsze wyjście w zakładce Forms!
										</p>
									) : (
										<div className="space-y-4">
									{filteredOutings.map((outing, index) => (
										<div key={`${outing.id}-${index}`}>
													<div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted cursor-pointer">
														<div className="flex items-center gap-3">
															<div className="p-2 rounded-lg bg-blue-100">
																<Calendar className="h-5 w-5 text-blue-600" />
															</div>
															<div>
																<p className="font-medium">{outing.title}</p>
																<div className="flex items-center gap-4 text-sm text-muted-foreground">
																	<span><Badge variant="outline" className="text-xs">{getTypeLabel(outing.type)}</Badge></span>
																	{outing.location && (
																		<span className="flex items-center gap-1">
																			<MapPin className="h-3 w-3" />{outing.location}
																		</span>
																	)}
																	<span className="flex items-center gap-1">
																		<User className="h-3 w-3" />{outing._count.leads} kontaktów
																	</span>
																	<span>{outing.date}</span>
																</div>
															</div>
														</div>
														<Button variant="ghost" size="icon">
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</div>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="leads">
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
						{/* Sidebar - Simple folders */}
						<div className="lg:col-span-1">
							<Card>
								<CardContent className="p-4">
									<h3 className="font-semibold mb-4">Foldery</h3>
									<div className="space-y-2">
										<div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 cursor-pointer">
											<div className="flex items-center gap-2">
												<Folder className="h-4 w-4 text-primary" />
												<span className="text-sm font-medium">Kontakty</span>
											</div>
											<Badge variant="secondary" className="text-xs">
												{leads.length}
											</Badge>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Main content - Leads list */}
						<div className="lg:col-span-3">
							<Card>
								<CardContent className="p-6">
									<div className="flex items-center justify-between mb-4">
										<h3 className="font-semibold">Wszystkie kontakty</h3>
										<div className="relative w-64">
											<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Szukaj kontaktów..."
												className="pl-10"
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
											/>
										</div>
									</div>
									{filteredLeads.length === 0 ? (
										<p className="text-sm text-muted-foreground text-center py-8">
											Brak kontaktów. Dodaj pierwszy kontakt w zakładce Forms!
										</p>
									) : (
										<div className="space-y-4">
									{filteredLeads.map((lead, index) => (
										<div key={`${lead.id}-${index}`}>
													<div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted cursor-pointer">
														<div className="flex items-center gap-3">
															<div className="p-2 rounded-lg bg-green-100">
																<User className="h-5 w-5 text-green-600" />
															</div>
															<div>
																<p className="font-medium">{lead.name}</p>
																<div className="flex items-center gap-4 text-sm text-muted-foreground">
																	<span><Badge className={`${getStatusColor(lead.status)} text-xs`}>{lead.status}</Badge></span>
																	<span>{getLeadSourceLabel(lead.source)}</span>
																	{lead.phone && (
																		<span className="flex items-center gap-1">
																			<Phone className="h-3 w-3" />{lead.phone}
																		</span>
																	)}
																	{lead.instagram && (
																		<span className="flex items-center gap-1">
																			<Instagram className="h-3 w-3" />{lead.instagram}
																		</span>
																	)}
																</div>
															</div>
														</div>
														<Button variant="ghost" size="icon">
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</div>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}