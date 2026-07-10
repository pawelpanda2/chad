# Dev Panel - Developer Debugging Interface

## Overview

The Dev Panel is a developer debugging interface inspired by the Content Provider Blazor project's DevErrorPanel. It provides a floating panel on the right side of the dashboard that captures and displays HTTP requests, errors, and frontend exceptions.

The panel now supports **real request logging** from `chad-dba` to the Content Provider, showing all CP API calls made by server-side API routes.

## Source Pattern

This feature was ported from the Content Provider Blazor project (`front_blazor/BlazorApp/Components/DevErrorPanel.razor`), adapting the Blazor/C# implementation to Next.js/React/TypeScript.

## Architecture

The Dev Panel follows a hybrid architecture that captures both client-side and server-side requests:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    DevPanelProvider                          │ │
│  │  ┌─────────────────────────────────────────────────────────┐│ │
│  │  │              DevPanelStoreContext                        ││ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││ │
│  │  │  │   Requests   │  │    Errors    │  │   UI State   │  ││ │
│  │  │  │   (max 100)  │  │   (max 200)  │  │  (expanded)  │  ││ │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐│ │
│  │  │              DevFetch Wrapper                            ││ │
│  │  │  • Intercepts fetch calls to /api/*                      ││ │
│  │  • Extracts _traces from response body                      ││ │
│  │  • Logs both client requests and server traces              ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Server (API Routes)                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    API Route Handler                         │ │
│  │  1. Create TraceCollector                                    │ │
│  │  2. Register collector with chad-dba                         │ │
│  │  3. Execute chad-dba functions                               │ │
│  │  4. Collector gathers all CP request traces                  │ │
│  │  5. Return { data, _traces: [...] }                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      chad-dba                                │ │
│  │  • invokeContentProvider() emits traces                      │ │
│  │  • Each CP call creates a RequestTrace                       │ │
│  │  • Traces include: worker, method, args, raw request/response│ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Content Provider                           │ │
│  │  • /invoke endpoint                                          │ │
│  │  • Returns JSON responses                                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

### chad-dashboard
```
chad-dashboard/
├── lib/dev-panel/
│   ├── dev-panel-store.tsx      # React Context store
│   ├── dev-panel-fetch.ts        # Fetch wrapper with trace extraction
│   └── use-server-trace.ts       # Hook for processing server traces
├── components/dev-panel/
│   ├── dev-panel.tsx             # Main UI component
│   ├── dev-panel.css             # VS Code-inspired styles
│   ├── dev-panel-provider.tsx    # Client-side provider wrapper
│   └── index.ts                  # Exports
└── app/
    └── layout.tsx                # Integration point
```

### chad-dba
```
chad-dba/
└── src/
    ├── client.ts                 # invokeContentProvider with tracing
    ├── trace.ts                  # RequestTrace types and callbacks
    ├── trace-collector.ts        # TraceCollector for server-side collection
    └── index.ts                  # Exports all modules
```

## Components

### 1. DevPanelStore (Context)
**Location:** `lib/dev-panel/dev-panel-store.tsx`

Central state management for the Dev Panel:
- **Requests**: Stores up to 100 recent HTTP requests
- **Errors**: Stores up to 200 recent errors
- **UI State**: Panel expanded/collapsed, active tab

### 2. DevPanel UI
**Location:** `components/dev-panel/dev-panel.tsx`

Main visual component with:
- Floating handle (right side, 50% height)
- Slide-in panel (75vw width, max 900px)
- Two tabs: Requests, Errors
- Expandable request/response details
- Clear functionality

### 3. DevFetch Wrapper
**Location:** `lib/dev-panel/dev-panel-fetch.ts`

Client-side fetch wrapper that:
- Captures request method, URL, body, args
- Measures response time
- Logs response status and body
- **Extracts `_traces` from response body** (server-side CP requests)
- **Extracts `cpCalls` from response body** (cp-flow.ts based routes)
- Captures network errors and server errors

### 4. Trace Module (chad-dba)
**Location:** `src/trace.ts` (in chad-dba)

Provides:
- `RequestTrace` interface for CP request data
- `registerTraceCallback()` / `unregisterTraceCallback()` for trace listeners
- `emitTrace()` to notify listeners of new traces
- `parseWorkerMethod()` to extract worker/method from args

### 5. Trace Collector (chad-dba)
**Location:** `src/trace-collector.ts` (in chad-dba)

Provides:
- `TraceCollector` class for gathering traces during execution
- `traceAndExecute()` wrapper for automatic trace collection
- `withTraceCollector()` for AsyncLocalStorage-based collection

## Request Logging Flow

### Server-Side (API Route → Content Provider)

```
1. API Route Handler
   └─> traceAndExecute(async () => {
         return await getStatusesDashboardList(range);
       })
            │
2. TraceCollector Created & Registered
   └─> registerTraceCallback(collector.callback)
            │
3. chad-dba Functions Execute
   └─> GetAllLeads()
   └─> chad_GetLeadsStatuses()
   └─> etc.
            │
4. invokeContentProvider() Called
   └─> Fetch to CP /invoke endpoint
   └─> Create RequestTrace with:
       • worker (e.g., IItemWorker)
       • method (e.g., GetByNames)
       • args (full args array)
       • rawRequest (JSON stringified args)
       • rawResponse (JSON response body)
       • statusCode
       • durationMs
       • success/error status
   └─> emitTrace(trace)
            │
5. TraceCollector Receives Trace
   └─> Push to traces array
            │
6. Response Returned
   └─> { data: [...], _traces: [trace1, trace2, ...] }
```

### Client-Side (Dev Panel Logging)

```
1. Client Fetch to API Route
   └─> devFetch('/api/statuses')
            │
2. DevFetch Wrapper Intercepts
   └─> Execute original fetch
   └─> Read response body
            │
3. Extract Server Traces
   └─> Parse JSON response
   └─> Check for _traces array
   └─> Check for cpCalls array
            │
4. Log Each Trace to DevPanelStore
   └─> addRequest({
         method: "IItemWorker.GetByNames",
         url: "http://localhost:5055/invoke",
         requestBody: trace.rawRequest,
         responseBody: trace.rawResponse,
         statusCode: trace.statusCode,
         durationMs: trace.durationMs,
         source: "server"
       })
            │
5. Log Errors if Failed
   └─> addError({
         source: "chad-dba",
         message: trace.error,
         rawError: trace.rawResponse
       })
```

## Error Sources

The Dev Panel categorizes errors by source:

| Source | Description | Examples |
|--------|-------------|----------|
| `Content Provider` | Errors from CP API | Invalid loca, auth errors |
| `chad-dba` | Errors from data access layer | Parse errors, validation |
| `Next.js` | Server/API route errors | 500 responses, fetch failures |
| `UI` | Frontend JavaScript errors | React errors, event handlers |

## Usage

### Basic Integration (Already Done)

The Dev Panel is integrated in `app/layout.tsx`:

```tsx
import { DevPanelProvider } from "@/components/dev-panel/dev-panel-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DevPanelProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </DevPanelProvider>
      </body>
    </html>
  );
}
```

### Adding Trace Support to API Routes

To enable request logging for an API route:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { someChadDbaFunction, traceAndExecute } from "chad-dba";

export async function GET(request: NextRequest) {
  try {
    // Wrap your chad-dba call with traceAndExecute
    const { data: result, _traces } = await traceAndExecute(async () => {
      return await someChadDbaFunction();
    });

    // Return data with traces for Dev Panel
    return NextResponse.json({
      ...result,
      _traces,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Using DevFetch in Components

For components that make API calls:

```tsx
'use client';

import { useDevFetch } from '@/lib/dev-panel/dev-panel-fetch';

export function MyComponent() {
  const devFetch = useDevFetch(fetch);
  
  const loadData = async () => {
    const response = await devFetch('/api/statuses', {
      devLabel: 'getStatusesDashboardList',
      devArgs: [range]
    });
    // Response already has traces extracted automatically
  };
}
```

### Manual Error Logging

To manually log errors to the Dev Panel:

```tsx
'use client';

import { useDevPanelStore } from '@/lib/dev-panel/dev-panel-store';

export function MyComponent() {
  const { addError } = useDevPanelStore();
  
  const handleError = (error: Error) => {
    addError({
      source: 'UI',
      message: error.message,
      stackTrace: error.stack,
      context: JSON.stringify({ component: 'MyComponent' }, null, 2)
    });
  };
}
```

## Trace Data Structure

Each trace in the `_traces` array contains:

```typescript
interface RequestTrace {
  traceId: string;           // Unique ID (timestamp-random)
  timestamp: string;         // ISO timestamp
  worker: string;            // e.g., "IItemWorker"
  method: string;            // e.g., "GetByNames"
  args: string[];            // Full args sent to /invoke
  endpoint: string;          // CP API URL
  rawRequest: string;        // JSON stringified args
  rawResponse: string;       // Raw JSON response from CP
  statusCode: number;        // HTTP status code
  durationMs: number;        // Request duration
  success: boolean;          // Whether request succeeded
  error?: string;            // Error message if failed
}
```

## Edge Cases & Limitations

### 1. Routes Using cp-flow.ts

Routes that use `app/api/flow/cp-flow.ts` (like forms, folders) have their own trace mechanism (`cpCalls`). The DevFetch wrapper automatically extracts these as well.

### 2. Routes Without Trace Support

API routes that don't use `traceAndExecute` will still show their client-side request in the Dev Panel, but won't show the individual Content Provider calls.

### 3. Memory Limits
- Requests: max 100 entries
- Errors: max 200 entries

Old entries are automatically removed when limits are reached.

### 4. Response Body Truncation
Response bodies are truncated to 1000 characters in the summary view. Click "Show full" to see the complete response.

### 5. Production Use
The Dev Panel is always active. For production deployment, consider:
- Adding an environment variable check to disable it
- Restricting access to authenticated admin users
- Moving to a separate debug build

## Testing

### Manual Test Checklist

1. **Panel Visibility**
   - [ ] Floating handle visible on right side at middle height
   - [ ] Handle shows error badge when errors exist
   - [ ] Clicking handle opens panel
   - [ ] Panel slides in from right

2. **Requests Tab - Server Traces**
   - [ ] Navigate to dashboard page that calls `/api/statuses`
   - [ ] Requests appear in the Requests tab
   - [ ] Each request shows: ID, timestamp, worker.method, endpoint, duration
   - [ ] Expand request to see:
     - [ ] Raw request JSON (args array)
     - [ ] Raw response JSON (full CP response)
     - [ ] Worker name (e.g., IItemWorker)
     - [ ] Method name (e.g., GetByNames)
     - [ ] Duration in ms

3. **Errors Tab**
   - [ ] Trigger an API error (e.g., stop Content Provider)
   - [ ] Error appears in Errors tab
   - [ ] Error shows: source (chad-dba), message, timestamp
   - [ ] Raw error JSON expandable

4. **Global Error Handling**
   - [ ] Trigger a JavaScript error in console: `throw new Error('test')`
   - [ ] Error captured in Errors tab with source "UI"
   - [ ] Trigger unhandled rejection: `Promise.reject('test')`
   - [ ] Rejection captured in Errors tab

5. **Clear Functionality**
   - [ ] Clear button removes all entries
   - [ ] Panel remains functional after clearing

## Future Enhancements

1. **Filtering**: Add filters by source, status, time range
2. **Export**: Export logs as JSON for debugging
3. **Performance**: Add performance metrics (TTFB, DOM ready, etc.)
4. **Search**: Search through requests and errors
5. **Persistence**: Optional localStorage persistence across refreshes
6. **Auto-trace All Routes**: Middleware to automatically wrap all API routes with trace collection