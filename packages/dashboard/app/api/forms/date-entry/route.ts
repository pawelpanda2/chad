import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as yaml from 'js-yaml';
import { 
  saveDateEntry, 
  getAllDateEntries, 
  generateEntryName,
  SHARED_REPO_ID 
} from 'dba';

/**
 * POST /api/forms/date-entry
 * 
 * Saves a date entry form record to Content Provider under actions/dates.
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
      repoGuid: SHARED_REPO_ID,
      repoGuidSource: "chad-dba/SHARED_REPO_ID",
    },
    cpFlow: {
      called: false,
      function: "saveDateEntry",
    },
  };

  // Get session from cookie (for debug info only)
  let sessionRaw = "";
  let userId = "";
  
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (sessionCookie) {
      sessionRaw = sessionCookie.value;
      const [id] = sessionCookie.value.split(':');
      userId = id;
    }
  } catch {
    // Session read failed
  }

  (debugResponse.backend as Record<string, unknown>).sessionRaw = sessionRaw;
  (debugResponse.backend as Record<string, unknown>).userId = userId;

  if (!sessionRaw) {
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
    // Step 1: Get existing entries to generate unique name
    const existingEntries = await getAllDateEntries();
    const existingNames = existingEntries.map(e => e.itemName);
    
    // Step 2: Generate unique item name
    const itemName = generateEntryName(existingNames, dateStr);
    
    // Step 3: Convert payload to YAML body
    const bodyYaml = yaml.dump(payload);
    
    // Step 4: Save to Content Provider using chad-dba
    const result = await saveDateEntry(itemName, bodyYaml);
    
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
        path: "actions/dates",
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