"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorBox } from "@/components/shared/error-box";
import { Lock, User } from "lucide-react";

export default function LoginPage() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [debugInfo, setDebugInfo] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setDebugInfo("");
		setLoading(true);

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "Invalid credentials");
				// Show debug info if available
				if (data.debug) {
					setDebugInfo(JSON.stringify(data.debug, null, 2));
				}
				setLoading(false);
				return;
			}

			// Redirect to dashboard on success
			router.push("/dashboard");
		} catch (err) {
			setError("An error occurred during login");
			setDebugInfo(`Catch error: ${err instanceof Error ? err.message : String(err)}`);
			setLoading(false);
		}
	};

	return (
		// Reduced layout standard for (auth) pages (Story 62): no
		// sidebar/menu/Back/Forw/dashboard toolbar. Top-left corner (not
		// centered), one outer frame + one inner frame holding the form, same
		// rounding/~3px gap as the dashboard standard. The outer frame's height
		// is capped to the viewport (not forced to fill it) with its own
		// internal scrollbar if content ever grows taller — the page element
		// itself stays `overflow-hidden` so there is no uncontrolled global
		// document scroll.
		<div className="h-[100dvh] w-full overflow-hidden bg-background p-2">
			<div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border bg-card shadow-sm">
				<div className="p-[10px]">
					<div className="rounded-lg border bg-muted/10 p-6">
						<div className="mb-4 space-y-1">
							<h1 className="text-2xl font-bold">Personal Dashboard</h1>
							<p className="text-sm text-muted-foreground">Sign in to continue</p>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4" noValidate>
							<div className="space-y-2">
								<Label htmlFor="username">Username</Label>
								<div className="relative">
									<User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
									<Input
										id="username"
										name="username"
										type="text"
										inputMode="text"
										placeholder="Enter username (e.g. pawel, kamil, test)"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										className="pl-10"
										required
										autoComplete="username"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<div className="relative">
									<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
									<Input
										id="password"
										type="password"
										placeholder="Enter password (changeme)"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										className="pl-10"
										required
										autoComplete="current-password"
									/>
								</div>
							</div>

							<Button type="submit" className="w-full" disabled={loading}>
								{loading ? "Signing in..." : "Sign in"}
							</Button>
						</form>

						{/* Error indicator lives at the BOTTOM, below the form. */}
						<ErrorBox message={error} details={debugInfo} className="mt-4" />
					</div>
				</div>
			</div>
		</div>
	);
}