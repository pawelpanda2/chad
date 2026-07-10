/**
 * API Endpoint: Statuses Dashboard Data
 *
 * GET /api/statuses?range=-10|1-20|1,2,3
 *
 * Returns leads with their status information.
 * Supports range filtering:
 * - range=-10: last 10 newest leads
 * - range=1-20: leads 1 to 20
 * - range=1,2,3: specific leads
 * - no range: all leads
 *
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 *
 * Dev Panel Integration:
 * This endpoint uses traceAndExecute to collect Content Provider request traces
 * and includes them in the response for Dev Panel logging.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStatusesDashboardList, getTracesFromError, traceAndExecute } from "dba";

/**
 * GET /api/statuses?range=...
 * Returns leads with status information, sorted newest first.
 * Includes _traces array with Content Provider request details for Dev Panel.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || undefined;

  console.log(`[/api/statuses] GET called, range=${range ?? "(none)"}`);
  console.log(`[/api/statuses] Calling getStatusesDashboardList...`);

  try {
    // Use traceAndExecute to collect all Content Provider traces
    const { data: leads, _traces } = await traceAndExecute(async () => {
      return await getStatusesDashboardList(range);
    });

    console.log(`[/api/statuses] Success: returned ${leads.length} leads, ${_traces.length} traces`);
    
    // Return data with traces for Dev Panel
    // Keep leads as an array, add _traces as a separate property
    return NextResponse.json({
      leads,
      _traces,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const traces = getTracesFromError(error);
    console.error(`[/api/statuses] ERROR: ${errorMsg}`);
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
        _traces: traces,
      },
      { status: 500 }
    );
  }
}
