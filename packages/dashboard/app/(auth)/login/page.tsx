"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Lock, User } from "lucide-react";

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
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl font-bold text-center">
						Personal Dashboard
					</CardTitle>
					<CardDescription className="text-center">
						Sign in to continue
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								<div className="font-bold mb-2">{error}</div>
								{debugInfo && (
									<pre className="text-xs bg-black/10 p-2 rounded mt-2 overflow-auto whitespace-pre-wrap">
										{debugInfo}
									</pre>
								)}
							</AlertDescription>
						</Alert>
					)}

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
				</CardContent>
			</Card>
		</div>
	);
}