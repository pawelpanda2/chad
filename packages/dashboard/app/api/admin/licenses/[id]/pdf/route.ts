import { getLicenseAgreementPdfForAdmin, LicenseCommerceError } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return new Response(JSON.stringify({ error: "NOT_AUTHORIZED" }), { status: 403 });
  }

  const { id } = await params;

  try {
    const { pdf, filename, hash } = await getLicenseAgreementPdfForAdmin(id);
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Agreement-Pdf-Hash": hash,
      },
    });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      const status = error.code === "acceptance_not_found" ? 404 : 400;
      return new Response(JSON.stringify({ error: error.message, code: error.code }), { status });
    }
    console.error("[admin/licenses/[id]/pdf]", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "Failed to generate PDF" }), { status: 500 });
  }
}
