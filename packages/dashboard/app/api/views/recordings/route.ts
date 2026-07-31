import { NextResponse } from "next/server";
import { listAudioRecordings, listAudioRecordingDrafts, runWithRepoContext } from "dba";
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
    const [recordings, drafts] = await runWithRepoContext(user, async () => {
      const saved = await listAudioRecordings();
      // Draft listing failure must not hide the saved list (e.g. a draft
      // directory that an SMB dropout made temporarily unreadable).
      const draftItems = await listAudioRecordingDrafts().catch((error) => {
        console.error("Error fetching recording drafts:", error);
        return [];
      });
      return [saved, draftItems] as const;
    });
    return NextResponse.json({ success: true, recordings, drafts });
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
