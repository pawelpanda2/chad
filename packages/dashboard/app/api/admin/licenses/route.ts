import { NextResponse } from "next/server";
import { getLicensesForAdmin, LicenseCommerceError } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  try {
    const licenses = await getLicensesForAdmin(500);
    return NextResponse.json({ success: true, licenses });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[admin/licenses]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load licenses", licenses: [] }, { status: 500 });
  }
}
