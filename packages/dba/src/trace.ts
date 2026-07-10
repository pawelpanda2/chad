/**
 * Request Trace Types for Dev Panel Integration
 * 
 * This module provides types and utilities for tracing requests
 * from chad-dba to the Content Provider, enabling debugging in the Dev Panel.
 */

/**
 * Trace information for a single request to Content Provider
 */
export interface RequestTrace {
  /** Unique trace ID */
  traceId: string;
  /** Timestamp when the request was made */
  timestamp: string;
  /** Worker/Service name (e.g., IRepoService, IItemWorker) */
  worker: string;
  /** Method name (e.g., GetByNames, PostParentItem) */
  method: string;
  /** Arguments passed to /invoke */
  args: string[];
  /** Full endpoint URL */
  endpoint: string;
  /** Raw request JSON body */
  rawRequest: string;
  /** Raw response JSON body */
  rawResponse: string;
  /** HTTP status code */
  statusCode: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the request was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Callback function type for trace listeners
 */
export type TraceCallback = (trace: RequestTrace) => void;

/**
 * Global trace listeners registry
 * This allows the Dev Panel to register a callback to receive traces
 */
let traceCallbacks: TraceCallback[] = [];

/**
 * Register a callback to receive request traces
 * This should be called from the client-side Dev Panel integration
 */
export function registerTraceCallback(callback: TraceCallback): void {
  traceCallbacks.push(callback);
}

/**
 * Unregister a trace callback
 */
export function unregisterTraceCallback(callback: TraceCallback): void {
  traceCallbacks = traceCallbacks.filter(cb => cb !== callback);
}

/**
 * Notify all registered callbacks with a trace
 */
function notifyCallbacks(trace: RequestTrace): void {
  for (const callback of traceCallbacks) {
    try {
      callback(trace);
    } catch (error) {
      // Silently ignore errors in callbacks to prevent breaking the main flow
      console.error('[chad-dba] Error in trace callback:', error);
    }
  }
}

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a trace object from request/response data
 */
export function createTrace(options: {
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
}): RequestTrace {
  return {
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
    worker: options.worker,
    method: options.method,
    args: options.args,
    endpoint: options.endpoint,
    rawRequest: options.rawRequest,
    rawResponse: options.rawResponse,
    statusCode: options.statusCode,
    durationMs: options.durationMs,
    success: options.success,
    error: options.error,
  };
}

/**
 * Emit a trace to all registered callbacks
 */
export function emitTrace(trace: RequestTrace): void {
  notifyCallbacks(trace);
}

/**
 * Parse worker and method from args array
 * Args format: [service, worker, method, ...rest]
 */
export function parseWorkerMethod(args: string[]): { worker: string; method: string } {
  if (args.length >= 3) {
    return { worker: args[1], method: args[2] };
  }
  if (args.length >= 2) {
    return { worker: args[0], method: args[1] };
  }
  return { worker: 'unknown', method: 'unknown' };
}