"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBox } from "@/components/shared/error-box";
import { SAVE_FRAME_PADDING_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";

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

function FieldTableRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<tr>
			<td className="w-px whitespace-nowrap border bg-muted/60 px-3 py-2 align-top font-semibold">{label}</td>
			<td className="border bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30">{children}</td>
		</tr>
	);
}

export default function SettingsPage() {
	const searchParams = useSearchParams();
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
		const requestedTab = searchParams.get("tab");
		if (requestedTab === "business" || requestedTab === "personal") {
			setTab(requestedTab);
		}
	}, [searchParams]);

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
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList aria-label="Account sections">
					<TabsTrigger value="personal">Personal</TabsTrigger>
					<TabsTrigger value="business">Business</TabsTrigger>
				</TabsList>
				<TabsContent value="personal" className="space-y-6">
					<Separator />
					<div className="max-w-[460px] rounded-lg border bg-muted/10">
						<div className={cn("flex w-fit flex-nowrap items-center gap-3 border-b", SAVE_FRAME_PADDING_CLASS)}>
							<Button type="submit" form="personal-profile-form">
								Save
							</Button>
						</div>
						<Form {...form}>
							<form id="personal-profile-form" onSubmit={form.handleSubmit(onSubmit)} className="p-2">
								<table className="w-full border-collapse text-sm">
									<tbody>
										<FormField
											control={form.control}
											name="username"
											render={({ field }) => (
												<FieldTableRow label="Username">
													<FormItem className="space-y-0">
														<FormControl>
															<Input
																placeholder="username"
																className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												</FieldTableRow>
											)}
										/>
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FieldTableRow label="Name">
													<FormItem className="space-y-0">
														<FormControl>
															<Input
																placeholder="John Doe"
																className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												</FieldTableRow>
											)}
										/>
										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FieldTableRow label="Email">
													<FormItem className="space-y-0">
														<FormControl>
															<Input
																placeholder="john.doe@example.com"
																className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												</FieldTableRow>
											)}
										/>
										<FormField
											control={form.control}
											name="bio"
											render={({ field }) => (
												<FieldTableRow label="Bio">
													<FormItem className="space-y-0">
														<FormControl>
															<Textarea
																placeholder="Tell us a little bit about yourself"
																className="min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-1"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												</FieldTableRow>
											)}
										/>
									</tbody>
								</table>
							</form>
						</Form>
					</div>
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
