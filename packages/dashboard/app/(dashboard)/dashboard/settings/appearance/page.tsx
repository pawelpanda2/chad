"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ThemeModeSelector } from "@/components/shared/theme-mode-selector";

export default function SettingsAppearancePage() {
	return (
		<div className="space-y-6">
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

			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
				</CardHeader>
				<CardContent>
					<ThemeModeSelector />
				</CardContent>
			</Card>
		</div>
	);
}
