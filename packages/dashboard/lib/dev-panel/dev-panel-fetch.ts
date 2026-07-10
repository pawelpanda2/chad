'use client';

import { useDevPanelStore, type DevPanelError, type DevPanelRequest } from './dev-panel-store';

/**
 * Trace data structure for server-side Content Provider requests
 * This matches the RequestTrace interface from chad-dba
 */
export interface ServerTrace {
  traceId: string;
  timestamp: string;
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
}

/**
 * Frontend fetch wrapper that intercepts requests to /api/* routes
 * and logs them to the Dev Panel store.
 * 
 * This wrapper is used on the client side to capture:
 * - Request details (method, url, body, args)
 * - Response details (status, body)
 * - Errors (network errors, server errors)
 * - Server-side traces (Content Provider requests made by API routes)
 * 
 * Usage:
 * ```ts
 * const devFetch = useDevFetch(fetch);
 * const response = await devFetch('/api/statuses');
 * ```
 */

export interface DevFetchOptions extends RequestInit {
  /** Optional label for the request (e.g., worker name, method name) */
  devLabel?: string;
  /** Optional request arguments for debugging */
  devArgs?: string[];
  /** Whether to extract and log server-side traces from response */
  extractServerTrace?: boolean;
}

function extractServerTracesFromResponseBody(
  responseBody: string,
  addRequest: (request: Omit<DevPanelRequest, 'id' | 'timestamp'>) => void,
  addError: (error: Omit<DevPanelError, 'id' | 'timestamp'>) => void
) {
  try {
    const json = JSON.parse(responseBody);

    if (json._traces && Array.isArray(json._traces)) {
      for (const trace of json._traces as ServerTrace[]) {
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
              traceId: trace.traceId,
              worker: trace.worker,
              method: trace.method,
              args: trace.args,
            }, null, 2),
          });
        }
      }
    }

    if (json.cpCalls && Array.isArray(json.cpCalls)) {
      for (const cpCall of json.cpCalls) {
        if (cpCall.args && cpCall.args.length >= 3) {
          const worker = cpCall.args[1] || 'unknown';
          const method = cpCall.args[2] || 'unknown';
          const isSuccess = !cpCall.error;

          addRequest({
            method: `${worker}.${method}`,
            url: `${process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055'}/invoke`,
            requestBody: JSON.stringify(cpCall.args),
            responseBody: cpCall.rawResponse || '',
            statusCode: isSuccess ? 200 : 500,
            statusText: isSuccess ? 'OK' : 'Error',
            durationMs: 0,
            source: 'server',
          });

          if (cpCall.error) {
            addError({
              source: 'Content Provider',
              message: cpCall.error,
              rawError: cpCall.rawResponse,
              context: JSON.stringify({
                step: cpCall.step,
                args: cpCall.args,
              }, null, 2),
            });
          }
        }
      }
    }
  } catch {
    // Response is not JSON or parsing failed.
  }
}

export function useDevFetch(originalFetch: typeof fetch) {
  const store = useDevPanelStore();

  return async function devFetch(
    input: string | URL | Request,
    init?: DevFetchOptions
  ): Promise<Response> {
    const startTime = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    const requestBody = init?.body ? String(init.body) : undefined;
    const label = init?.devLabel;
    const args = init?.devArgs;
    const extractServerTrace = init?.extractServerTrace !== false; // Default to true

    // Build a descriptive method/worker string
    const methodWorker = label || `${method} ${url}`;

    try {
      // Make the actual fetch call
      const response = await originalFetch(input, init);
      const durationMs = Math.round(performance.now() - startTime);

      // Clone the response to read the body without consuming it
      const clonedResponse = response.clone();
      let responseBody: string | undefined;
      
      try {
        responseBody = await clonedResponse.text();
      } catch {
        responseBody = '(unable to read response body)';
      }

      // Extract server-side traces from response body (for API routes that include trace data)
      if (extractServerTrace && responseBody) {
        extractServerTracesFromResponseBody(responseBody, store.addRequest, store.addError);
      }

      // Log the client-side request to the API route
      store.addRequest({
        method: methodWorker,
        url,
        requestBody: args ? `[${args.join(', ')}]` : requestBody,
        responseBody,
        statusCode: response.status,
        statusText: response.statusText,
        durationMs,
        source: 'client',
      });

      // If the response is an error, also log it as an error
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorSource: DevPanelError['source'] = 'Next.js';
        const rawError = responseBody;

        // Try to parse the error response
        try {
          const errorJson = JSON.parse(responseBody || '{}');
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
          if (errorJson.source) {
            errorSource = errorJson.source as DevPanelError['source'];
          }
        } catch {
          // Not JSON, use the raw text
        }

        store.addError({
          source: errorSource,
          message: errorMessage,
          rawError,
          requestId: store.requestCount,
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log the failed request
      store.addRequest({
        method: methodWorker,
        url,
        requestBody: args ? `[${args.join(', ')}]` : requestBody,
        durationMs,
        error: errorMessage,
        source: 'client',
      });

      // Log as an error
      store.addError({
        source: 'Next.js',
        message: `Fetch error: ${errorMessage}`,
        stackTrace: error instanceof Error ? error.stack : undefined,
        context: JSON.stringify({ method, url, args }, null, 2),
      });

      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Simple fetch wrapper that can be used without React hooks.
 * Use this for non-React contexts or when you need a standalone fetch.
 */
export function createDevFetch(
  originalFetch: typeof fetch,
  addRequest: (request: Omit<DevPanelRequest, 'id' | 'timestamp'>) => void,
  addError: (error: Omit<DevPanelError, 'id' | 'timestamp'>) => void
) {
  return async function devFetch(
    input: string | URL | Request,
    init?: DevFetchOptions
  ): Promise<Response> {
    const startTime = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    const requestBody = init?.body ? String(init.body) : undefined;
    const label = init?.devLabel;
    const args = init?.devArgs;
    const extractServerTrace = init?.extractServerTrace !== false;

    const methodWorker = label || `${method} ${url}`;

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.round(performance.now() - startTime);

      const clonedResponse = response.clone();
      let responseBody: string | undefined;
      
      try {
        responseBody = await clonedResponse.text();
      } catch {
        responseBody = '(unable to read response body)';
      }

      if (extractServerTrace && responseBody) {
        extractServerTracesFromResponseBody(responseBody, addRequest, addError);
      }

      addRequest({
        method: methodWorker,
        url,
        requestBody: args ? `[${args.join(', ')}]` : requestBody,
        responseBody,
        statusCode: response.status,
        statusText: response.statusText,
        durationMs,
        source: 'client',
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorSource: DevPanelError['source'] = 'Next.js';
        const rawError = responseBody;

        try {
          const errorJson = JSON.parse(responseBody || '{}');
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
          if (errorJson.source) {
            errorSource = errorJson.source as DevPanelError['source'];
          }
        } catch {
          // Not JSON
        }

        addError({
          source: errorSource,
          message: errorMessage,
          rawError,
          requestId: -1,
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : String(error);

      addRequest({
        method: methodWorker,
        url,
        requestBody: args ? `[${args.join(', ')}]` : requestBody,
        durationMs,
        error: errorMessage,
        source: 'client',
      });

      addError({
        source: 'Next.js',
        message: `Fetch error: ${errorMessage}`,
        stackTrace: error instanceof Error ? error.stack : undefined,
        context: JSON.stringify({ method, url, args }, null, 2),
      });

      throw error;
    }
  };
}