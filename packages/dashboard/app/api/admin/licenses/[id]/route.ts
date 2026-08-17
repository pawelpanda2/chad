import { NextResponse } from "next/server";
import { getLicenseDetailForAdmin, LicenseCommerceError } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const license = await getLicenseDetailForAdmin(id);
    return NextResponse.json({ success: true, license });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      const status = error.code === "acceptance_not_found" ? 404 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    console.error("[admin/licenses/[id]]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load license" }, { status: 500 });
  }
}
