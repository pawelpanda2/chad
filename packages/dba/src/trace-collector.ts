/**
 * Trace Collector for Server-Side Request Logging
 * 
 * This module provides a way to collect traces during server-side execution
 * and return them to the client for Dev Panel logging.
 * 
 * Usage in API routes:
 * 1. Create a collector at the start of the request
 * 2. Register it as the active collector
 * 3. Execute chad-dba functions (traces will be collected)
 * 4. Unregister the collector
 * 5. Include collected traces in the response
 */

import { RequestTrace, registerTraceCallback, unregisterTraceCallback } from './trace.js';

export interface TracesCarrier {
  _traces?: RequestTrace[];
}

/**
 * A trace collector that gathers traces during a request
 */
export class TraceCollector {
  private traces: RequestTrace[] = [];
  private callback: (trace: RequestTrace) => void;
  private registered: boolean = false;

  constructor() {
    this.callback = (trace: RequestTrace) => {
      this.traces.push(trace);
    };
  }

  /**
   * Start collecting traces
   */
  start(): void {
    if (!this.registered) {
      registerTraceCallback(this.callback);
      this.registered = true;
    }
  }

  /**
   * Stop collecting traces
   */
  stop(): void {
    if (this.registered) {
      unregisterTraceCallback(this.callback);
      this.registered = false;
    }
  }

  /**
   * Get all collected traces
   */
  getTraces(): RequestTrace[] {
    return [...this.traces];
  }

  /**
   * Clear all collected traces
   */
  clear(): void {
    this.traces = [];
  }

  /**
   * Get traces and stop collecting
   */
  finish(): RequestTrace[] {
    this.stop();
    return this.getTraces();
  }
}

/**
 * Async context for trace collectors
 * Uses AsyncLocalStorage to maintain per-request state
 */
import { AsyncLocalStorage } from 'async_hooks';

const collectorStorage = new AsyncLocalStorage<TraceCollector>();

/**
 * Execute a function with a trace collector
 * The collector is automatically registered and unregistered
 */
export async function withTraceCollector<T>(
  fn: (collector: TraceCollector) => Promise<T>
): Promise<{ result: T; traces: RequestTrace[] }> {
  const collector = new TraceCollector();
  collector.start();

  try {
    const result = await collectorStorage.run(collector, () => fn(collector));
    return { result, traces: collector.finish() };
  } catch (error) {
    collector.stop();
    throw error;
  }
}

/**
 * Get the current trace collector from async context
 */
export function getCurrentCollector(): TraceCollector | undefined {
  return collectorStorage.getStore();
}

/**
 * Create a response wrapper that includes traces
 */
export interface TracedResponse<T> {
  data: T;
  _traces: RequestTrace[];
}

/**
 * Execute a function and return result with traces
 */
export async function traceAndExecute<T>(
  fn: () => Promise<T>
): Promise<TracedResponse<T>> {
  const collector = new TraceCollector();
  collector.start();

  try {
    const result = await fn();
    return {
      data: result,
      _traces: collector.finish(),
    };
  } catch (error) {
    const traces = collector.finish();
    if (error && typeof error === 'object') {
      (error as TracesCarrier)._traces = traces;
    }
    throw error;
  }
}

export function getTracesFromError(error: unknown): RequestTrace[] {
  if (!error || typeof error !== 'object') {
    return [];
  }

  const traces = (error as TracesCarrier)._traces;
  return Array.isArray(traces) ? traces : [];
}