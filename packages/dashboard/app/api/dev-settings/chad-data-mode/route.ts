import { NextResponse } from "next/server";
import { getChadDataMode, isOfflineReadonlyBackupMode } from "dba";

/** GET /api/dev-settings/chad-data-mode — runtime mode for UI banner/guards. */
export async function GET() {
  return NextResponse.json({
    mode: getChadDataMode(),
    offlineReadonlyBackup: isOfflineReadonlyBackupMode(),
    writeForbidden: isOfflineReadonlyBackupMode(),
  });
}
