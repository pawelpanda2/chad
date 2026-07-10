"use client";

import { useState, useEffect } from "react";
import { getLogs, subscribe, clearLogs, formatDuration, formatTimestamp, type LogEntry } from "@/lib/devLogger";

function getResultBadge(entry: LogEntry): string {
  if (entry.errorMessage) return "ERROR";
  if (entry.responseStatus === null) return "PENDING";
  
  // Check for empty result
  if (entry.parsedResponse && typeof entry.parsedResponse === 'object') {
    const resp = entry.parsedResponse as { success?: boolean; result?: string };
    if (resp.success === true && resp.result === "") {
      return "EMPTY_RESULT";
    }
  }
  
  if (entry.responseOk) return "OK";
  return "FAIL";
}

function getResultColor(entry: LogEntry): string {
  const badge = getResultBadge(entry);
  switch (badge) {
    case "OK": return "bg-green-100 border-green-400 text-green-800";
    case "EMPTY_RESULT": return "bg-yellow-100 border-yellow-400 text-yellow-800";
    case "ERROR": return "bg-red-100 border-red-400 text-red-800";
    case "PENDING": return "bg-blue-100 border-blue-400 text-blue-800";
    default: return "bg-gray-100 border-gray-400 text-gray-800";
  }
}

function getStatusText(entry: LogEntry): string {
  if (entry.errorMessage) return `ERROR: ${entry.errorMessage}`;
  if (entry.responseStatus === null) return "PENDING";
  
  const badge = getResultBadge(entry);
  if (badge === "EMPTY_RESULT") {
    return `${entry.responseStatus} OK but result is empty string`;
  }
  
  return `${entry.responseStatus} ${entry.responseOk ? "OK" : "FAIL"}`;
}

function getInterpretation(entry: LogEntry): string | null {
  if (!entry.parsedResponse) return null;
  
  const resp = entry.parsedResponse as { success?: boolean; result?: string; error?: { message?: string } };
  
  if (resp.success === true && resp.result === "") {
    return "Backend returned success=true but result is empty string. This usually means the item was not found (repo/loca doesn't exist).";
  }
  
  if (resp.success === true && resp.result) {
    return "Backend returned valid data.";
  }
  
  if (resp.success === false) {
    return `Backend returned error: ${resp.error?.message || 'Unknown error'}`;
  }
  
  return null;
}

export function DeveloperLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLogs(getLogs());
    const unsubscribe = subscribe((newLogs) => setLogs(newLogs));
    return unsubscribe;
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mt-8 border-t-2 border-gray-300 pt-4 bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">
          Developer API Logs <span className="text-sm font-normal text-gray-500">({logs.length} requests)</span>
        </h2>
        <button
          onClick={clearLogs}
          className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded border border-gray-300"
        >
          Clear All
        </button>
      </div>

      {/* Config Info */}
      <div className="mb-4 p-3 bg-white rounded border border-gray-200 text-sm font-mono">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">API URL:</span>{" "}
            <span className="text-blue-600">{process.env.NEXT_PUBLIC_CONTENT_API_URL || "http://localhost:12024"}</span>
          </div>
          <div>
            <span className="text-gray-500">Mocks:</span>{" "}
            <span className={process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? "text-red-600" : "text-green-600"}>
              {process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {logs.length === 0 && (
          <div className="text-gray-500 text-sm italic text-center py-4">
            No API calls yet. Select a repo and loca, then click GO.
          </div>
        )}

        {logs.map((entry) => {
          const badge = getResultBadge(entry);
          const isExpanded = expandedLogs.has(entry.id);
          
          return (
            <div
              key={entry.id}
              className={`border-l-4 p-3 rounded bg-white shadow-sm ${getResultColor(entry)}`}
            >
              {/* Header - always visible */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(entry.id)}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="font-semibold text-sm bg-gray-100 px-2 py-0.5 rounded">
                    {entry.sourceFunction}
                  </span>
                  <span className="text-xs font-mono text-gray-600">
                    {entry.method} {entry.url}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500">
                    {formatDuration(entry.durationMs)}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    badge === "OK" ? "bg-green-200 text-green-800" :
                    badge === "EMPTY_RESULT" ? "bg-yellow-200 text-yellow-800" :
                    badge === "ERROR" ? "bg-red-200 text-red-800" :
                    "bg-blue-200 text-blue-800"
                  }`}>
                    {badge}
                  </span>
                  <span className="text-xs text-gray-400">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {/* Interpretation */}
              {isExpanded && getInterpretation(entry) && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <strong>Interpretation:</strong> {getInterpretation(entry)}
                </div>
              )}

              {/* Details - expandable */}
              {isExpanded && (
                <div className="mt-3 space-y-3 text-xs">
                  {/* Request Args */}
                  <div>
                    <div className="font-semibold mb-1 text-gray-700">Request Args:</div>
                    <pre className="bg-gray-100 p-2 rounded border border-gray-300 overflow-x-auto">
                      {JSON.stringify(entry.requestArgs, null, 2)}
                    </pre>
                  </div>

                  {/* Request Body */}
                  {entry.requestBody && (
                    <div>
                      <div className="font-semibold mb-1 text-gray-700">Request Body:</div>
                      <pre className="bg-gray-100 p-2 rounded border border-gray-300 overflow-x-auto">
                        {JSON.stringify(entry.requestBody, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Response Status */}
                  {entry.responseStatus !== null && (
                    <div>
                      <div className="font-semibold mb-1 text-gray-700">Response Status:</div>
                      <span className={`px-2 py-0.5 rounded text-sm ${
                        entry.responseOk ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {entry.responseStatus} {entry.responseOk ? "OK" : "FAIL"}
                      </span>
                    </div>
                  )}

                  {/* Raw Response */}
                  {entry.rawResponseText && (
                    <div>
                      <div className="font-semibold mb-1 text-gray-700">
                        Raw Response ({entry.rawResponseText.length} chars):
                      </div>
                      <pre className="bg-gray-100 p-2 rounded border border-gray-300 overflow-x-auto max-h-48 overflow-y-auto text-xs">
                        {entry.rawResponseText.length > 3000
                          ? entry.rawResponseText.substring(0, 3000) + "\n... (truncated)"
                          : entry.rawResponseText}
                      </pre>
                    </div>
                  )}

                  {/* Parsed Response */}
                  {entry.parsedResponse !== undefined && (
                    <div>
                      <div className="font-semibold mb-1 text-gray-700">Parsed Response:</div>
                      <pre className="bg-gray-100 p-2 rounded border border-gray-300 overflow-x-auto max-h-48 overflow-y-auto text-xs">
                        {JSON.stringify(entry.parsedResponse as Record<string, unknown>, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {entry.errorMessage && (
                    <div>
                      <div className="font-semibold mb-1 text-red-600">Error:</div>
                      <div className="bg-red-50 p-2 rounded border border-red-200 text-red-800">
                        {entry.errorMessage}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}