import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import { getAllDailyEntries, getAllDateEntries, runWithRepoContext, computeDailyAutoFieldsByDate } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * Daily entry record with parsed YAML body
 */
interface DailyEntryRecord {
  itemName: string;
  loca?: string;
  body?: Record<string, unknown>;
}

/**
 * Date entry record with parsed YAML body
 */
interface DateEntryRecord {
  itemName: string;
  loca?: string;
  body?: Record<string, unknown>;
}

/**
 * Parse YAML string to object
 */
function parseYaml(str: string): Record<string, unknown> | null {
  try {
    const result = yaml.load(str);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/views
 *
 * Retrieves all date entries and daily entries from Content Provider.
 *
 * Flow:
 * 1. Call chad-dba.getAllDateEntries()
 * 2. Call chad-dba.getAllDailyEntries()
 * 3. Parse YAML bodies in dashboard layer
 * 4. Return combined result with debug info
 *
 * Dates and Daily are fetched with INDEPENDENT try/catch blocks (mirroring
 * how Reports errors are already kept separate below) — previously a single
 * try/catch wrapped both calls, so a failure in either one discarded BOTH
 * result sets, even though `dba`'s getAllDateEntries/getAllDailyEntries
 * always throw independently of each other. That, combined with those two
 * functions silently swallowing every error (including CP timeouts) into an
 * empty array, is what made the Daily Tracker view intermittently show "no
 * data" on a slow/large repo: a `getAllDailyEntries` timeout looked
 * identical to "the folder is genuinely empty", with no visible error at
 * all. Both `dba` functions now propagate real errors instead of hiding
 * them (see their docstrings), and this route no longer conflates the two
 * independent fetches into one failure domain.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "NOT_AUTHENTICATED", dateEntries: [], dailyEntries: [] },
      { status: 401 }
    );
  }

  // Build response object with debug info
  const debugResponse: Record<string, unknown> = {
    event: "get-views",
    endpoint: "/api/views",
    frontend: {
      requested: true,
    },
    backend: {
      endpointCalled: true,
      repoGuid: user.repoGuid,
    },
    cpFlow: {
      called: true,
      functions: ["getAllDateEntries", "getAllDailyEntries"],
      calls: [] as Array<{ function: string; result: string }>,
    },
  };
  const cpCalls = (debugResponse.cpFlow as { calls: Array<{ function: string; result: string }> }).calls;

  // Get date entries — failure here does not affect daily entries below.
  let dateEntries: DateEntryRecord[] = [];
  let dateEntriesError: string | undefined;
  try {
    console.log("[dashboard] Getting date entries...");
    const dateEntriesRaw = await runWithRepoContext(user, () => getAllDateEntries());
    cpCalls.push({ function: "getAllDateEntries", result: `Found ${dateEntriesRaw.length} entries` });
    console.log("[dashboard] Date entries:", dateEntriesRaw.length);

    // Parse YAML bodies in dashboard layer. entry.body is a raw YAML string
    // (see DateEntryItem in dba). `loca` (Story 62, additive) lets the
    // Views/Dates table call the PATCH /api/forms/date-entry update route
    // without a second fetch.
    dateEntries = dateEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      loca: entry.loca,
      body: entry.body ? (parseYaml(entry.body as string) || undefined) : undefined,
    }));
  } catch (error) {
    console.error("[dashboard] Error fetching date entries:", error);
    dateEntriesError = error instanceof Error ? error.message : "Unknown error";
    cpCalls.push({ function: "getAllDateEntries", result: `Failed: ${dateEntriesError}` });
  }

  // Get daily entries — failure here does not affect date entries above.
  let dailyEntries: DailyEntryRecord[] = [];
  let dailyEntriesError: string | undefined;
  try {
    console.log("[dashboard] Getting daily entries...");
    const dailyEntriesRaw = await runWithRepoContext(user, () => getAllDailyEntries());
    cpCalls.push({ function: "getAllDailyEntries", result: `Found ${dailyEntriesRaw.length} entries` });
    console.log("[dashboard] Daily entries:", dailyEntriesRaw.length);

    dailyEntries = dailyEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      loca: entry.loca,
      body: entry.body ? (parseYaml(entry.body as string) || undefined) : undefined,
    }));
  } catch (error) {
    console.error("[dashboard] Error fetching daily entries:", error);
    dailyEntriesError = error instanceof Error ? error.message : "Unknown error";
    cpCalls.push({ function: "getAllDailyEntries", result: `Failed: ${dailyEntriesError}` });
  }

  // Compute "— AUTO" columns (PULLS/CLOSES/QUALITY D/P/QUALITY C) for the
  // Tracker view from whatever date entries were actually fetched — see
  // computeDailyAutoFieldsByDate in dba for the rule. If date entries failed
  // to load, this just yields no matches (auto fields stay blank), it does
  // not block daily entries from rendering.
  const autoByDate = computeDailyAutoFieldsByDate(
    dateEntries.map((e) => e.body || {})
  );
  for (const entry of dailyEntries) {
    const date = String(entry.body?.["DATE"] ?? "").trim();
    const auto = autoByDate.get(date);
    entry.body = {
      ...entry.body,
      "PULLS AUTO": auto?.pullsAuto ?? "",
      "CLOSES AUTO": auto?.closesAuto ?? "",
      "QUALITY DP AUTO": auto?.qualityDpAuto ?? "",
      "QUALITY C AUTO": auto?.qualityCAuto ?? "",
    };
  }

  // Debug: log first few entries
  if (dailyEntries.length > 0) {
    console.log("[dashboard] First daily entry:", {
      itemName: dailyEntries[0].itemName,
      bodyKeys: dailyEntries[0].body ? Object.keys(dailyEntries[0].body) : [],
    });
  }

  if (dateEntriesError) {
    debugResponse.error = { message: dateEntriesError, source: "getAllDateEntries" };
  } else if (dailyEntriesError) {
    debugResponse.error = { message: dailyEntriesError, source: "getAllDailyEntries" };
  }

  return NextResponse.json({
    success: true,
    dateEntries,
    dailyEntries,
    dateEntriesError,
    dailyEntriesError,
    debug: debugResponse,
  });
}