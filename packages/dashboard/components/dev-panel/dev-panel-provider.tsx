'use client';

import React from 'react';
import { DevPanelStoreProvider, useDevPanelStore } from '@/lib/dev-panel/dev-panel-store';
import { createDevFetch } from '@/lib/dev-panel/dev-panel-fetch';
import { DevPanel } from './dev-panel';

/**
 * Inner component that sets up global error handlers.
 * Must be used inside DevPanelStoreProvider.
 */
function DevPanelErrorHandlers() {
  const { addError, addRequest } = useDevPanelStore();
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (originalFetchRef.current) return;

    const nativeFetch = window.fetch.bind(window);
    originalFetchRef.current = nativeFetch;
    const devFetch = createDevFetch(nativeFetch, addRequest, addError);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isApiRequest = url.startsWith('/api/') || url.includes('/api/');

      if (!isApiRequest) {
        return nativeFetch(input, init);
      }

      return devFetch(input, init);
    }) as typeof fetch;

    return () => {
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
        originalFetchRef.current = null;
      }
    };
  }, [addError, addRequest]);

  React.useEffect(() => {
    // Handle window.onerror
    const originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      addError({
        source: 'UI',
        message: typeof message === 'string' ? message : String(message),
        stackTrace: error?.stack || (source ? `${source}:${lineno}:${colno}` : undefined),
        context: JSON.stringify({ source, lineno, colno }, null, 2),
      });

      if (originalOnError) {
        // eslint-disable-next-line prefer-rest-params
        return originalOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    // Handle unhandled promise rejections
    const originalOnUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = function (event: PromiseRejectionEvent) {
      const error = event.reason;
      addError({
        source: 'Next.js',
        message: error?.message || String(error) || 'Unhandled promise rejection',
        stackTrace: error?.stack,
        context: JSON.stringify({
          type: event.type,
          reason: error?.toString(),
        }, null, 2),
      });

      if (originalOnUnhandledRejection) {
        // eslint-disable-next-line prefer-rest-params
        (originalOnUnhandledRejection as (ev: PromiseRejectionEvent) => void)(event);
      }
    };

    return () => {
      const win = window as Window & WindowEventHandlers;
      win.onerror = originalOnError as OnErrorEventHandler | null;
      win.onunhandledrejection = originalOnUnhandledRejection as ((ev: PromiseRejectionEvent) => void) | null;
    };
  }, [addError]);

  return null;
}

/**
 * Client-side provider for the Dev Panel.
 * This component wraps the application with the DevPanelStoreProvider
 * and sets up global error handlers.
 */
export function DevPanelProvider({ children }: { children: React.ReactNode }) {
  return (
    <DevPanelStoreProvider>
      <DevPanelErrorHandlers />
      {children}
      <DevPanel />
    </DevPanelStoreProvider>
  );
}
