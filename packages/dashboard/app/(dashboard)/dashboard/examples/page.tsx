import { redirect } from "next/navigation";

export default function LegacyExamplesRedirectPage() {
  redirect("/dashboard/admin/examples");
}
