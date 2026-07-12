import { redirect } from "next/navigation";

// The "Dashboard" template landing (revenue/stats demo) was removed from the
// menu and the app. /dashboard is still the post-login landing target
// (app/page.tsx and the login redirect both point here), so instead of a 404
// it now redirects to the first real working tab.
export default function DashboardIndexPage() {
	redirect("/dashboard/statuses");
}
