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
 * 1. Call chad-dba.getAllDateEntries() - uses SHARED_REPO_ID
 * 2. Call chad-dba.getAllDailyEntries() - uses IManyItemsWorker.GetList
 * 3. Parse YAML bodies in dashboard layer
 * 4. Return combined result with debug info
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
      called: false,
      functions: ["getAllDateEntries", "getAllDailyEntries"],
      calls: [] as Array<{ function: string; result: string }>,
    },
  };

  // Call chad-dba to get records
  try {
    const cpCalls: Array<{ function: string; result: string }> = [];

    // Get date entries
    console.log("[dashboard] Getting date entries...");
    const dateEntriesRaw = await runWithRepoContext(user, () => getAllDateEntries());
    cpCalls.push({
      function: "getAllDateEntries",
      result: `Found ${dateEntriesRaw.length} entries`,
    });
    console.log("[dashboard] Date entries:", dateEntriesRaw.length);

    // Get daily entries (uses IManyItemsWorker.GetList)
    console.log("[dashboard] Getting daily entries...");
    const dailyEntriesRaw = await runWithRepoContext(user, () => getAllDailyEntries());
    cpCalls.push({
      function: "getAllDailyEntries",
      result: `Found ${dailyEntriesRaw.length} entries`,
    });
    console.log("[dashboard] Daily entries:", dailyEntriesRaw.length);

    debugResponse.cpFlow = {
      called: true,
      functions: ["getAllDateEntries", "getAllDailyEntries"],
      calls: cpCalls,
    };

    // Parse YAML bodies in dashboard layer. Both entry.body values are raw
    // YAML strings (see DailyEntryItem/DateEntryItem in dba) — previously
    // dateEntriesRaw's body was cast straight to Record<string, unknown>
    // without parsing, which (combined with a since-fixed dba bug that
    // returned the wrong body entirely) meant Dates never actually showed
    // real field values. Both are parsed the same way now.
    // `loca` added (Story 62, additive field — existing consumers that
    // don't read it are unaffected) so the Views/Tracker table can call the
    // new PATCH /api/forms/daily-entry update route without a second fetch.
    const dateEntries: DateEntryRecord[] = dateEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      loca: entry.loca,
      body: entry.body ? (parseYaml(entry.body as string) || undefined) : undefined,
    }));

    const dailyEntries: DailyEntryRecord[] = dailyEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      loca: entry.loca,
      body: entry.body ? (parseYaml(entry.body as string) || undefined) : undefined,
    }));

    // Compute "— AUTO" columns (PULLS/CLOSES/QUALITY D/P/QUALITY C) for the
    // Tracker view from the same date entries just fetched — see
    // computeDailyAutoFieldsByDate in dba for the rule.
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

    return NextResponse.json({
      success: true,
      dateEntries,
      dailyEntries,
      debug: debugResponse,
    });
  } catch (error) {
    console.error("[dashboard] Error in GET /api/views:", error);
    debugResponse.error = {
      message: error instanceof Error ? error.message : "Unknown error",
      type: error instanceof Error ? error.name : "Unknown",
    };
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      dateEntries: [],
      dailyEntries: [],
      debug: debugResponse,
    }, { status: 500 });
  }
}