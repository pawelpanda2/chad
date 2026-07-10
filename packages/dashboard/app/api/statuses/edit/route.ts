/**
 * API Endpoint: Status Editor
 *
 * This endpoint provides data for the status editor.
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  getTracesFromError,
  getLeadStatusEditor, 
  saveLeadStatus, 
  createLeadStatus,
  traceAndExecute,
  type StatusFields 
} from "dba";

/**
 * GET /api/statuses/edit?leadKey=...
 * Returns the status data for editing.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadKey = searchParams.get("leadKey");

  if (!leadKey) {
    return NextResponse.json(
      { error: "Missing required parameter: leadKey" },
      { status: 400 }
    );
  }

  try {
    const { data, _traces } = await traceAndExecute(async () => {
      return await getLeadStatusEditor(leadKey);
    });

    if (!data) {
      return NextResponse.json(
        { error: "Lead not found", _traces },
        { status: 404 }
      );
    }
    return NextResponse.json({ ...data, _traces });
  } catch (error) {
    const traces = getTracesFromError(error);
    console.error(`Error fetching status for leadKey=${leadKey}:`, error);
    return NextResponse.json(
      { error: String(error), _traces: traces },
      { status: 500 }
    );
  }
}

/**
 * POST /api/statuses/edit
 * Saves the status content.
 *
 * Request body:
 * {
 *   "leadKey": "89",
 *   "fields": {
 *     "city": "Warszawa",
 *     "only-friends": false,
 *     "her-first-msg": true,
 *     "your-first-message": false,
 *     "writing-deadline": "2026-07-01",
 *     "priority-today": 5
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadKey, fields, createDefault } = body;

    if (!leadKey) {
      return NextResponse.json(
        { error: "Missing required parameter: leadKey" },
        { status: 400 }
      );
    }

    // Create default status if requested
    if (createDefault) {
      const { _traces } = await traceAndExecute(async () => {
        await createLeadStatus(leadKey);
        return { success: true };
      });
      return NextResponse.json({ success: true, created: true, _traces });
    }

    if (!fields) {
      return NextResponse.json(
        { error: "Missing required parameter: fields" },
        { status: 400 }
      );
    }

    // Validate and construct StatusFields from the request body
    // Note: We cannot use parseStatusFields here because it expects a YAML string,
    // not a JSON object. The fields from the request are already in the correct format.
    const statusFields: StatusFields = {
      city: String(fields.city ?? ""),
      "only-friends": Boolean(fields["only-friends"]),
      "her-first-msg": Boolean(fields["her-first-msg"]),
      "your-first-message": Boolean(fields["your-first-message"]),
      "writing-deadline": String(fields["writing-deadline"] ?? "2099-01-01"),
      "priority-today": Number(fields["priority-today"] ?? 0),
    };
    
    const { _traces } = await traceAndExecute(async () => {
      await saveLeadStatus(leadKey, statusFields);
      return { success: true };
    });

    return NextResponse.json({ success: true, _traces });
  } catch (error) {
    const traces = getTracesFromError(error);
    console.error("Error saving status:", error);
    return NextResponse.json(
      { error: String(error), _traces: traces },
      { status: 500 }
    );
  }
}