import { redirect } from "next/navigation";

export default function LegacyKnowledgeV1ExampleRedirectPage() {
  redirect("/dashboard/admin/examples/knowledge-v1");
}
