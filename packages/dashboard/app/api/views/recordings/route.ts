import { NextResponse } from "next/server";
import { listAudioRecordings, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated", recordings: [] },
      { status: 401 },
    );
  }

  try {
    const recordings = await runWithRepoContext(user, () => listAudioRecordings());
    return NextResponse.json({ success: true, recordings });
  } catch (error) {
    console.error("Error fetching recordings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        recordings: [],
      },
      { status: 500 },
    );
  }
}
