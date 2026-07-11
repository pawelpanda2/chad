import { NextResponse } from 'next/server';
import { saveActionForm, type CpCallTrace } from '@/app/api/flow/cp-flow';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * POST /api/forms/action
 *
 * Saves an action form record to Content Provider.
 *
 * Flow:
 * 1. Resolve current user (repoGuid + username) from session cookie
 * 2. Call cp-flow.saveActionForm(repoGuid, payload)
 * 3. Return result with full debug trace
 */
export async function POST(request: Request) {
  const payload = await request.json();

  // Build response object with full debug trace
  const debugResponse: Record<string, unknown> = {
    event: "action-form-submit",
    endpoint: "/api/forms/action",
    frontend: {
      submitStarted: true,
      payload: payload,
    },
    backend: {
      endpointCalled: true,
    },
    cpFlow: {
      called: false,
      function: "saveActionForm",
      calls: [] as CpCallTrace[],
    },
  };

  const user = await getCurrentUserFromCookies();

  (debugResponse.backend as Record<string, unknown>).userGuid = user?.repoGuid ?? null;
  (debugResponse.backend as Record<string, unknown>).username = user?.username ?? null;

  if (!user) {
    debugResponse.error = {
      message: "No session found",
      type: "NOT_AUTHENTICATED",
    };
    debugResponse.cpFlow = {
      called: false,
      reason: "No session cookie found, or session id doesn't match a known user",
    };

    return NextResponse.json({
      success: false,
      error: "Not authenticated",
      debug: debugResponse,
    }, { status: 401 });
  }

  // Call cp-flow saveActionForm
  try {
    const result = await saveActionForm(user.repoGuid, payload);
    
    debugResponse.cpFlow = {
      called: true,
      function: "saveActionForm",
      result: { success: result.success },
      calls: result.cpCalls,
    };

    if (result.success) {
      return NextResponse.json({
        success: true,
        debug: debugResponse,
      });
    } else {
      debugResponse.error = {
        message: result.error,
        type: "CP_ERROR",
      };
      
      return NextResponse.json({
        success: false,
        error: result.error,
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