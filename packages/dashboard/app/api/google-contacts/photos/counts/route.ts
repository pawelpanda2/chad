/**
 * GET /api/google-contacts/photos/counts — `{ [resourceName]: count }` for
 * every contact of the current user that has at least one CHAD-local
 * photo. One directory scan, used by the Google Contacts list to show a
 * "N photos" badge without an N+1 request per contact.
 */
import { NextResponse } from "next/server";
import { ContactPhotoError, listContactPhotoCounts, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const counts = await runWithRepoContext(user, () => listContactPhotoCounts());
    return NextResponse.json({ success: true, counts });
  } catch (error) {
    if (error instanceof ContactPhotoError && error.code === "NOT_CONFIGURED") {
      // Not configured yet on this environment — treat as "no photos" rather than an error banner.
      return NextResponse.json({ success: true, counts: {} });
    }
    console.error("[google-contacts photos counts GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not load photo counts" }, { status: 500 });
  }
}
