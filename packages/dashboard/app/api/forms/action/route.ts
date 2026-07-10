import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { saveActionForm, resolveRepoKey, type CpCallTrace } from '@/app/api/flow/cp-flow';

/**
 * POST /api/forms/action
 * 
 * Saves an action form record to Content Provider.
 * 
 * Flow:
 * 1. Read session from cookie
 * 2. Resolve repoKey from session.username
 * 3. Call cp-flow.saveActionForm(session, payload)
 * 4. Return result with full debug trace
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

  // Get session from cookie
  let session: { user?: { id?: string; username?: string } } | null = null;
  let sessionRaw = "";
  
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (sessionCookie) {
      sessionRaw = sessionCookie.value;
      const [userId] = sessionCookie.value.split(':');
      session = { user: { id: userId, username: userId } };
    }
  } catch {
    // Session read failed
  }

  (debugResponse.backend as Record<string, unknown>).sessionRaw = sessionRaw;
  (debugResponse.backend as Record<string, unknown>).sessionParsed = session;

  if (!session) {
    debugResponse.error = {
      message: "No session found",
      type: "NOT_AUTHENTICATED",
    };
    debugResponse.cpFlow = {
      called: false,
      reason: "No session cookie found",
    };
    
    return NextResponse.json({
      success: false,
      error: "Not authenticated",
      debug: debugResponse,
    }, { status: 401 });
  }

  // Resolve repoKey from session
  const repoInfo = await resolveRepoKey(session);
  
  (debugResponse.backend as Record<string, unknown>).userGuid = repoInfo.sessionUserGuid;
  (debugResponse.backend as Record<string, unknown>).username = repoInfo.sessionUsername;
  (debugResponse.backend as Record<string, unknown>).repoKey = repoInfo.repoKey;
  (debugResponse.backend as Record<string, unknown>).repoKeySource = repoInfo.repoKeySource;

  if (!repoInfo.repoKey) {
    debugResponse.error = {
      message: "Could not resolve repo key from session",
      type: "REPO_KEY_NOT_RESOLVED",
    };
    debugResponse.cpFlow = {
      called: false,
      reason: "repoKey missing - session has no username",
    };
    
    return NextResponse.json({
      success: false,
      error: "Could not resolve user repository",
      debug: debugResponse,
    }, { status: 400 });
  }

  // Call cp-flow saveActionForm
  try {
    const result = await saveActionForm(session, payload);
    
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