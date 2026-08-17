"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBox } from "@/components/shared/error-box";

const profileFormSchema = z.object({
	username: z.string().min(2).max(30),
	name: z.string().min(2).max(100),
	email: z.string().email(),
	bio: z.string().max(500),
});

const businessFormSchema = z.object({
	legalBusinessName: z.string().min(1, "Company / legal name is required"),
	country: z.string().min(1, "Country is required"),
	filingId: z.string().optional(),
	businessAddress: z.string().optional(),
	city: z.string().optional(),
	postalCode: z.string().optional(),
	businessEmail: z.string().email().optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type BusinessFormValues = z.infer<typeof businessFormSchema>;

const defaultValues: Partial<ProfileFormValues> = {
	bio: "I own a computer.",
};

export default function SettingsPage() {
	const [tab, setTab] = useState("personal");
	const [businessError, setBusinessError] = useState("");
	const [businessLoading, setBusinessLoading] = useState(true);

	const form = useForm<ProfileFormValues>({
		resolver: zodResolver(profileFormSchema),
		defaultValues,
		mode: "onChange",
	});

	const businessForm = useForm<BusinessFormValues>({
		resolver: zodResolver(businessFormSchema),
		defaultValues: {
			legalBusinessName: "",
			country: "Poland",
			filingId: "",
			businessAddress: "",
			city: "",
			postalCode: "",
			businessEmail: "",
		},
	});

	useEffect(() => {
		fetch("/api/settings/account/business")
			.then((res) => res.json())
			.then((data) => {
				if (data.success && data.profile) {
					businessForm.reset({
						legalBusinessName: data.profile.legalBusinessName ?? "",
						country: data.profile.country ?? "Poland",
						filingId: data.profile.filingId ?? "",
						businessAddress: data.profile.businessAddress ?? "",
						city: data.profile.city ?? "",
						postalCode: data.profile.postalCode ?? "",
						businessEmail: data.profile.businessEmail ?? "",
					});
				}
			})
			.catch(() => {
				/* optional profile */
			})
			.finally(() => setBusinessLoading(false));
	}, [businessForm]);

	function onSubmit(data: ProfileFormValues) {
		console.log("Profile data:", data);
		toast.success("Profile updated successfully!", {
			description: "Your profile has been updated.",
		});
	}

	async function onBusinessSubmit(data: BusinessFormValues) {
		setBusinessError("");
		const res = await fetch("/api/settings/account/business", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		const json = await res.json();
		if (!res.ok || !json.success) {
			setBusinessError(json.error || "Could not save business details.");
			return;
		}
		toast.success("Business details saved.");
	}

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Account</h3>
				<p className="text-sm text-muted-foreground">
					Personal profile and business details used for license purchases.
				</p>
			</div>
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList aria-label="Account sections">
					<TabsTrigger value="personal">Personal</TabsTrigger>
					<TabsTrigger value="business">Business</TabsTrigger>
				</TabsList>
				<TabsContent value="personal" className="space-y-6">
					<Separator />
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
							<div className="flex items-center gap-6">
								<Avatar className="h-20 w-20">
									<AvatarImage src="/avatars/01.png" alt="@username" />
									<AvatarFallback>JD</AvatarFallback>
								</Avatar>
								<div className="space-y-2">
									<Label htmlFor="picture">Profile Picture</Label>
									<Button variant="outline" size="sm" className="w-fit" type="button">
										<Camera className="mr-2 h-4 w-4" />
										Change Picture
									</Button>
								</div>
							</div>
							<div className="grid gap-6 md:grid-cols-2">
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder="username" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="John Doe" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input placeholder="john.doe@example.com" {...field} />
										</FormControl>
										<FormDescription>Login and purchase verification email (read from account).</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="bio"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Bio</FormLabel>
										<FormControl>
											<Textarea placeholder="Tell us a little bit about yourself" className="resize-none" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit">Update profile</Button>
						</form>
					</Form>
				</TabsContent>
				<TabsContent value="business" className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Required for B2B license purchase. Company name appears in the License Agreement declaration.{" "}
						<Link href="/dashboard/settings/payments" className="underline underline-offset-4">
							Payments
						</Link>
					</p>
					{businessLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : (
						<Form {...businessForm}>
							<form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-4">
								<FormField
									control={businessForm.control}
									name="legalBusinessName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Company / Legal name</FormLabel>
											<FormControl>
												<Input placeholder="ACME Sp. z o.o." {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={businessForm.control}
									name="filingId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Tax ID / NIP</FormLabel>
											<FormControl>
												<Input placeholder="Optional" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={businessForm.control}
									name="country"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Country</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={businessForm.control}
									name="businessAddress"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Address</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={businessForm.control}
										name="city"
										render={({ field }) => (
											<FormItem>
												<FormLabel>City</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={businessForm.control}
										name="postalCode"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Postal code</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={businessForm.control}
									name="businessEmail"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Business email</FormLabel>
											<FormControl>
												<Input placeholder="Optional — if different from login email" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<ErrorBox message={businessError || null} />
								<Button type="submit">Save business details</Button>
							</form>
						</Form>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
