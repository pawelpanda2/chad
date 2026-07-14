import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import {
  saveDailyEntry,
  getAllDailyEntries,
  getAllDateEntries,
  generateEntryName,
  runWithRepoContext,
  computeDailyAutoFieldsByDate,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

function parseYaml(body: string | undefined): Record<string, unknown> {
  if (!body) return {};
  try {
    return (yaml.load(body) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

/**
 * GET /api/forms/daily-entry
 *
 * Lists all daily entries for the Tracker view. Each entry's YAML body is
 * parsed into its raw field keys (DATE, STATE, TRAINING TIME, ...) exactly
 * as saved by the POST handler below — no renaming/reshaping. Also fetches
 * every Date Entry record to compute the "— AUTO" columns (PULLS, CLOSES,
 * QUALITY D/P, QUALITY C) — see computeDailyAutoFieldsByDate in dba for
 * the exact rule. Matched to each daily entry by its DATE field against
 * date entries' DATA field (same calendar day).
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { dailyEntries, autoByDate } = await runWithRepoContext(user, async () => {
      const [daily, dates] = await Promise.all([getAllDailyEntries(), getAllDateEntries()]);
      const dateFields = dates.map((d) => parseYaml(d.body));
      return { dailyEntries: daily, autoByDate: computeDailyAutoFieldsByDate(dateFields) };
    });

    const rows = dailyEntries.map((entry) => {
      const fields = parseYaml(entry.body);
      const date = String(fields["DATE"] ?? "").trim();
      const auto = autoByDate.get(date);
      const fieldsWithAuto = {
        ...fields,
        "PULLS AUTO": auto?.pullsAuto ?? "",
        "CLOSES AUTO": auto?.closesAuto ?? "",
        "QUALITY DP AUTO": auto?.qualityDpAuto ?? "",
        "QUALITY C AUTO": auto?.qualityCAuto ?? "",
      };
      return { itemName: entry.itemName, loca: entry.loca, fields: fieldsWithAuto };
    });
    return NextResponse.json({ entries: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms/daily-entry
 * 
 * Saves a daily entry form record to Content Provider under views/daily.
 * Uses chad-dba functions for all Content Provider operations.
 * 
 * Flow:
 * 1. Read session from cookie (for debug info only)
 * 2. Get existing daily entries to generate unique name
 * 3. Generate unique item name based on date (YY-MM-DD, YY-MM-DDb, etc.)
 * 4. Convert payload to YAML body
 * 5. Call chad-dba.saveDailyEntry(itemName, bodyYaml)
 * 6. Return result with debug info
 */
export async function POST(request: Request) {
  const payload = await request.json();

  const user = await getCurrentUserFromCookies();

  // Build response object with debug info
  const debugResponse: Record<string, unknown> = {
    event: "daily-entry-form-submit",
    endpoint: "/api/forms/daily-entry",
    frontend: {
      submitStarted: true,
      payload: payload,
    },
    backend: {
      endpointCalled: true,
      repoGuid: user?.repoGuid ?? null,
      username: user?.username ?? null,
    },
    cpFlow: {
      called: false,
      function: "saveDailyEntry",
    },
  };

  if (!user) {
    debugResponse.error = {
      message: "No session found",
      type: "NOT_AUTHENTICATED",
    };

    return NextResponse.json({
      success: false,
      error: "Not authenticated",
      debug: debugResponse,
    }, { status: 401 });
  }

  // Get date from payload
  const dateStr = payload.DATE as string || payload.date as string;
  if (!dateStr) {
    debugResponse.error = {
      message: "Missing date in payload",
      type: "MISSING_DATE",
    };
    return NextResponse.json({
      success: false,
      error: "Missing date in payload",
      debug: debugResponse,
    }, { status: 400 });
  }

  try {
    const result = await runWithRepoContext(user, async () => {
      // Step 1: Get existing entries to generate unique name
      const existingEntries = await getAllDailyEntries();
      const existingNames = existingEntries.map(e => e.itemName);

      // Step 2: Generate unique item name
      const itemName = generateEntryName(existingNames, dateStr);

      // Step 3: Convert payload to YAML body
      const bodyYaml = yaml.dump(payload);

      // Step 4: Save to Content Provider using chad-dba
      return await saveDailyEntry(itemName, bodyYaml);
    });
    const itemName = result.itemName;
    
    debugResponse.cpFlow = {
      called: true,
      function: "saveDailyEntry",
      result: { 
        success: result.success, 
        itemName: result.itemName,
        loca: result.loca 
      },
    };

    if (result.success) {
      return NextResponse.json({
        success: true,
        itemName,
        path: "views/daily",
        loca: result.loca,
        debug: debugResponse,
      });
    } else {
      debugResponse.error = {
        message: "Failed to save daily entry",
        type: "CP_ERROR",
      };
      
      return NextResponse.json({
        success: false,
        error: "Failed to save daily entry",
        debug: debugResponse,
      }, { status: 500 });
    }
  } catch (error) {
    debugResponse.error = {
      message: error instanceof Error ? error.message : "Unknown error",
      type: error instanceof Error ? error.name : "Unknown",
    };
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      debug: debugResponse,
    }, { status: 500 });
  }
}