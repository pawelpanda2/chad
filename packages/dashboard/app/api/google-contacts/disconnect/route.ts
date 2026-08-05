import { NextResponse } from "next/server";
import { clearGoogleContactsTokens, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/** POST /api/google-contacts/disconnect — clears stored refresh token for current user. */
export async function POST() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  try {
    await runWithRepoContext(user, () => clearGoogleContactsTokens());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[google-contacts/disconnect]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
