import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentsCancelPage() {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Payment</h3>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<XCircle className="h-5 w-5 text-muted-foreground" />
						Payment cancelled
					</CardTitle>
					<CardDescription>
						No payment was made. You can start a new payment with any amount
						whenever you&apos;re ready.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild variant="outline">
						<Link href="/dashboard/settings/payments">Back to Payments</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
