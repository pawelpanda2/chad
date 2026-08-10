"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ThemeModeSelector } from "@/components/shared/theme-mode-selector";

export default function DisplayPage() {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Display</h3>
				<p className="text-sm text-muted-foreground">
					Customize how the application looks and feels.
				</p>
			</div>
			<Separator />

			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>
						Choose your preferred theme for the application.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ThemeModeSelector />
				</CardContent>
			</Card>
		</div>
	);
}
