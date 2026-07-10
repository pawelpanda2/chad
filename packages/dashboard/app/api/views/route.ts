import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import { getAllDailyEntries, getAllDateEntries, SHARED_REPO_ID } from 'dba';

/**
 * Daily entry record with parsed YAML body
 */
interface DailyEntryRecord {
  itemName: string;
  body?: Record<string, unknown>;
}

/**
 * Date entry record with parsed YAML body
 */
interface DateEntryRecord {
  itemName: string;
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
  // Build response object with debug info
  const debugResponse: Record<string, unknown> = {
    event: "get-views",
    endpoint: "/api/views",
    frontend: {
      requested: true,
    },
    backend: {
      endpointCalled: true,
      repoGuid: SHARED_REPO_ID,
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
    const dateEntriesRaw = await getAllDateEntries();
    cpCalls.push({
      function: "getAllDateEntries",
      result: `Found ${dateEntriesRaw.length} entries`,
    });
    console.log("[dashboard] Date entries:", dateEntriesRaw.length);

    // Get daily entries (uses IManyItemsWorker.GetList)
    console.log("[dashboard] Getting daily entries...");
    const dailyEntriesRaw = await getAllDailyEntries();
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

    // Parse YAML bodies in dashboard layer
    const dateEntries: DateEntryRecord[] = dateEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      body: entry.body as Record<string, unknown> | undefined,
    }));

    const dailyEntries: DailyEntryRecord[] = dailyEntriesRaw.map(entry => ({
      itemName: entry.itemName,
      body: entry.body ? (parseYaml(entry.body as string) || undefined) : undefined,
    }));

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