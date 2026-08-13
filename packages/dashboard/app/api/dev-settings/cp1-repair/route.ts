/**
 * Local Mac only: read cp_1 repair status / request host watchdog repair.
 * No sudo, no shell, no mount — only writes `.runtime/cp1-repair/request`
 * (bind-mounted from the host). Action is fixed: repair-cp1.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requestLocalCp1Repair } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

function assertLocalOnly(): NextResponse | null {
  if (process.env.CHAD_ENVIRONMENT !== "local") {
    return NextResponse.json({ error: "DISABLED_OUTSIDE_LOCAL" }, { status: 403 });
  }
  return null;
}

function runtimeRoot(): string {
  const pref = process.env.DEV_DB_SOURCE_PREF_PATH?.trim();
  if (pref) return pref.replace(/\/[^/]+$/, "");
  return process.env.CHAD_RUNTIME_DIR?.trim() || "/app/runtime";
}

export async function GET() {
  const denied = assertLocalOnly();
  if (denied) return denied;
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const statusPath = join(runtimeRoot(), "cp1-repair", "status.json");
  try {
    const raw = await readFile(statusPath, "utf8");
    return NextResponse.json({ success: true, status: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ success: true, status: null });
  }
}

export async function POST() {
  const denied = assertLocalOnly();
  if (denied) return denied;
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Fixed action only — no command/path/host from the client.
  requestLocalCp1Repair("dashboard-api");
  return NextResponse.json({
    success: true,
    action: "repair-cp1",
    message: "Storage unavailable — repairing…",
  });
}
