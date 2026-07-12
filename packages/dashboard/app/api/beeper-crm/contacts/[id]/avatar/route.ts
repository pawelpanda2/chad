/**
 * GET /api/beeper-crm/contacts/[id]/avatar
 *
 * Serves the contact's avatar. Kept as a separate endpoint (not inlined
 * into the list/detail JSON) because avatars are stored as base64 data URIs
 * directly in MongoDB — inlining them in the contacts list response would
 * multiply payload size across hundreds of contacts.
 */
import { NextResponse } from "next/server";
import { getBeeperContactAvatar } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const avatarURL = await getBeeperContactAvatar(id);
  if (!avatarURL) {
    return new NextResponse(null, { status: 404 });
  }

  const dataUriMatch = avatarURL.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    const [, contentType, base64] = dataUriMatch;
    return new NextResponse(Buffer.from(base64, "base64"), {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  }

  // Not a data URI — a plain external URL (e.g. from a future Google
  // Contacts sync). Redirect rather than proxy.
  return NextResponse.redirect(avatarURL);
}
