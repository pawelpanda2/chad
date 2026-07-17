import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import {
  saveDateEntry,
  updateDateEntry,
  getAllDateEntries,
  generateEntryName,
  runWithRepoContext,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/forms/date-entry
 *
 * Lists all date entries for the Dates view. Each entry's YAML body is
 * parsed into its raw field keys (DATA, ŹRÓDŁO, NAZWA, ...) exactly as
 * saved by the POST handler below — no renaming/reshaping.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const entries = await runWithRepoContext(user, () => getAllDateEntries());
    const rows = entries.map((entry) => {
      let fields: Record<string, unknown> = {};
      if (entry.body) {
        try {
          fields = (yaml.load(entry.body) as Record<string, unknown>) || {};
        } catch {
          fields = {};
        }
      }
      return { itemName: entry.itemName, loca: entry.loca, fields };
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
 * POST /api/forms/date-entry
 * 
 * Saves a date entry form record to Content Provider under views/dates.
 * Uses chad-dba functions for all Content Provider operations.
 * 
 * Flow:
 * 1. Read session from cookie (for debug info only)
 * 2. Get existing date entries to generate unique name
 * 3. Generate unique item name based on date (YY-MM-DD, YY-MM-DDb, etc.)
 * 4. Convert payload to YAML body
 * 5. Call chad-dba.saveDateEntry(itemName, bodyYaml)
 * 6. Return result with debug info
 */
export async function POST(request: Request) {
  const payload = await request.json();

  const user = await getCurrentUserFromCookies();

  // Build response object with debug info
  const debugResponse: Record<string, unknown> = {
    event: "date-entry-form-submit",
    endpoint: "/api/forms/date-entry",
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
      function: "saveDateEntry",
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
  const dateStr = payload.DATA as string || payload.data as string;
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
      const existingEntries = await getAllDateEntries();
      const existingNames = existingEntries.map(e => e.itemName);

      // Step 2: Generate unique item name
      const itemName = generateEntryName(existingNames, dateStr);

      // Step 3: Convert payload to YAML body
      const bodyYaml = yaml.dump(payload);

      // Step 4: Save to Content Provider using chad-dba
      return await saveDateEntry(itemName, bodyYaml);
    });
    const itemName = result.itemName;
    
    debugResponse.cpFlow = {
      called: true,
      function: "saveDateEntry",
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
        path: "views/dates",
        loca: result.loca,
        debug: debugResponse,
      });
    } else {
      debugResponse.error = {
        message: "Failed to save date entry",
        type: "CP_ERROR",
      };
      
      return NextResponse.json({
        success: false,
        error: "Failed to save date entry",
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

/**
 * PATCH /api/forms/date-entry
 *
 * Updates an existing date entry's fields in place, identified by its real
 * `loca` — never by `DATA`, never via `generateEntryName`/`saveDateEntry`
 * on update. Added alongside the existing POST (still create-only,
 * unchanged), same shape as `PATCH /api/forms/daily-entry` (Story 62
 * Round 8 — DATES gets edit-mode parity with DAILY TRACKER).
 *
 * Body: { loca: string, fields: Record<string, unknown> } — `fields` is
 * the full new set of fields (already merged with the previous body by
 * the caller). Date Entries have no computed "— AUTO" columns, so unlike
 * the daily-entry PATCH, nothing needs stripping here.
 */
export async function PATCH(request: Request) {
  const payload = await request.json();
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const loca = payload.loca as string | undefined;
  const fields = payload.fields as Record<string, unknown> | undefined;

  if (!loca || typeof loca !== "string") {
    return NextResponse.json({ success: false, error: "Missing loca" }, { status: 400 });
  }
  if (!fields || typeof fields !== "object") {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  try {
    await runWithRepoContext(user, async () => {
      const bodyYaml = yaml.dump(fields);
      await updateDateEntry(loca, bodyYaml);
    });

    return NextResponse.json({ success: true, loca });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}