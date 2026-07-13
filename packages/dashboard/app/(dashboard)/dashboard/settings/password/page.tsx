"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { toast } from "sonner";

export default function PasswordSettingsPage() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [details, setDetails] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setDetails("");

		if (!current || !next || !confirm) {
			setError("Wypełnij wszystkie pola.");
			return;
		}
		if (next !== confirm) {
			setError("Nowe hasła nie są takie same.");
			return;
		}
		if (next.length < 4) {
			setError("Nowe hasło jest za krótkie.");
			return;
		}

		setSaving(true);
		try {
			const res = await fetch("/api/auth/change-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					currentPassword: current,
					newPassword: next,
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setError(data.error || "Nie udało się zmienić hasła.");
				if (data.debug) setDetails(JSON.stringify(data.debug, null, 2));
				return;
			}
			toast.success("Hasło zostało zmienione.");
			setCurrent("");
			setNext("");
			setConfirm("");
		} catch (err) {
			setError("Wystąpił błąd podczas zmiany hasła.");
			setDetails(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Password</h3>
				<p className="text-sm text-muted-foreground">
					Zmień swoje hasło. Podaj obecne hasło, a następnie dwukrotnie nowe.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="max-w-md space-y-4">
				<div className="space-y-2">
					<Label htmlFor="current-password">Obecne hasło</Label>
					<Input
						id="current-password"
						type="password"
						autoComplete="current-password"
						value={current}
						onChange={(e) => setCurrent(e.target.value)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-password">Nowe hasło</Label>
					<Input
						id="new-password"
						type="password"
						autoComplete="new-password"
						value={next}
						onChange={(e) => setNext(e.target.value)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="confirm-password">Powtórz nowe hasło</Label>
					<Input
						id="confirm-password"
						type="password"
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
					/>
				</div>

				<Button type="submit" disabled={saving}>
					{saving ? "Zmieniam..." : "Change"}
				</Button>

				<ErrorBox message={error} details={details} />
			</form>
		</div>
	);
}
