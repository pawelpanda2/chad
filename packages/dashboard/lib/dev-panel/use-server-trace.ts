'use client';

import { useDevPanelStore, type DevPanelRequest } from './dev-panel-store';

/**
 * Hook that processes trace data returned from server-side API calls.
 * 
 * When API routes call chad-dba functions, the trace data is embedded
 * in the response headers or as metadata. This hook provides a way
 * to extract and log that trace data to the Dev Panel.
 * 
 * Usage in API route responses:
 * - Include trace data in a custom header 'X-Request-Trace'
 * - Or include trace data in the response body under '_trace' property
 */

export function useServerTrace() {
  const { addRequest, addError } = useDevPanelStore();

  /**
   * Process a Response object and extract trace data
   * Call this after making fetch calls to API routes
   */
  const processResponse = async (response: Response) => {
    parseInt(response.headers.get('X-Request-Duration') || '0');
    const traceHeader = response.headers.get('X-Request-Trace');
    
    if (traceHeader) {
      try {
        const trace = JSON.parse(traceHeader);
        addRequest({
          method: `${trace.worker}.${trace.method}`,
          url: trace.endpoint,
          requestBody: trace.rawRequest,
          responseBody: trace.rawResponse,
          statusCode: trace.statusCode,
          statusText: trace.success ? 'OK' : 'Error',
          durationMs: trace.durationMs,
          source: 'server',
        });

        if (!trace.success && trace.error) {
          addError({
            source: 'chad-dba',
            message: trace.error,
            rawError: trace.rawResponse,
            context: JSON.stringify({
              worker: trace.worker,
              method: trace.method,
              args: trace.args,
            }, null, 2),
          });
        }
      } catch {
        // Trace header parsing failed, ignore
      }
    }
  };

  /**
   * Process trace data directly (for when trace is embedded in response body)
   */
  const processTrace = (trace: {
    worker: string;
    method: string;
    args: string[];
    endpoint: string;
    rawRequest: string;
    rawResponse: string;
    statusCode: number;
    durationMs: number;
    success: boolean;
    error?: string;
  }) => {
    addRequest({
      method: `${trace.worker}.${trace.method}`,
      url: trace.endpoint,
      requestBody: trace.rawRequest,
      responseBody: trace.rawResponse,
      statusCode: trace.statusCode,
      statusText: trace.success ? 'OK' : 'Error',
      durationMs: trace.durationMs,
      source: 'server',
    });

    if (!trace.success && trace.error) {
      addError({
        source: 'chad-dba',
        message: trace.error,
        rawError: trace.rawResponse,
        context: JSON.stringify({
          worker: trace.worker,
          method: trace.method,
          args: trace.args,
        }, null, 2),
      });
    }
  };

  return { processResponse, processTrace };
}

/**
 * Global trace listener setup
 * This sets up a window-level callback that chad-dba can call
 * when running in a browser context (for development/testing)
 */
let traceCallbackRegistered = false;

export function setupGlobalTraceListener(addRequest: (req: Omit<DevPanelRequest, 'id' | 'timestamp'>) => void) {
  if (typeof window === 'undefined') return;
  if (traceCallbackRegistered) return;
  
  // Set up a global function that chad-dba's trace module can call
  (window as unknown as Record<string, unknown>).__CHAD_DBA_TRACE__ = (traceData: unknown) => {
    const trace = traceData as {
      worker: string;
      method: string;
      endpoint: string;
      rawRequest: string;
      rawResponse: string;
      statusCode: number;
      durationMs: number;
      success: boolean;
    };
    addRequest({
      method: `${trace.worker}.${trace.method}`,
      url: trace.endpoint,
      requestBody: trace.rawRequest,
      responseBody: trace.rawResponse,
      statusCode: trace.statusCode,
      statusText: trace.success ? 'OK' : 'Error',
      durationMs: trace.durationMs,
      source: 'server',
    });
  };
  
  traceCallbackRegistered = true;
}