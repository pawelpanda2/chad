"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, Info, Loader2, Copy, Check } from "lucide-react";

export interface DebugResult {
  type: "success" | "error" | "warning" | "info" | "loading";
  title: string;
  message?: string;
  timestamp?: string;
  httpStatus?: number;
  data?: Record<string, unknown>;
  rawResponse?: string;
  requestPayload?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

interface DebugResultBoxProps {
  result: DebugResult | null;
  onClose?: () => void;
}

export function DebugResultBox({ result, onClose }: DebugResultBoxProps) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-600" />,
    error: <XCircle className="h-5 w-5 text-red-600" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    info: <Info className="h-5 w-5 text-blue-600" />,
    loading: <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />,
  };

  const bgColors = {
    success: "bg-green-50 border-green-200",
    error: "bg-red-50 border-red-200",
    warning: "bg-yellow-50 border-yellow-200",
    info: "bg-blue-50 border-blue-200",
    loading: "bg-blue-50 border-blue-200",
  };

  const handleCopy = async () => {
    const text = JSON.stringify(result.data || result, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={`border ${bgColors[result.type]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icons[result.type]}
            <CardTitle className="text-base font-semibold">
              {result.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {result.httpStatus && (
              <Badge variant={result.httpStatus >= 400 ? "destructive" : "secondary"}>
                HTTP {result.httpStatus}
              </Badge>
            )}
            {result.timestamp && (
              <span className="text-xs text-muted-foreground font-mono">
                {new Date(result.timestamp).toLocaleTimeString()}
              </span>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                ×
              </Button>
            )}
          </div>
        </div>
        {result.message && (
          <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {result.data && Object.keys(result.data).length > 0 && (
          <div className="relative">
            <pre className="bg-background border rounded-md p-3 text-xs font-mono overflow-auto max-h-64">
              {JSON.stringify(result.data, null, 2)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? (
                <><Check className="h-3 w-3 mr-1" />Copied</>
              ) : (
                <><Copy className="h-3 w-3 mr-1" />Copy</>
              )}
            </Button>
          </div>
        )}
        {result.rawResponse && (
          <div>
            <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Raw Response:</h4>
            <pre className="bg-background border rounded-md p-3 text-xs font-mono overflow-auto max-h-32">
              {result.rawResponse}
            </pre>
          </div>
        )}
        {result.requestPayload && (
          <div>
            <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Request Payload:</h4>
            <pre className="bg-background border rounded-md p-3 text-xs font-mono overflow-auto max-h-32">
              {JSON.stringify(result.requestPayload, null, 2)}
            </pre>
          </div>
        )}
        {result.error && (
          <div>
            <h4 className="text-xs font-semibold mb-1 text-red-600">Error:</h4>
            <pre className="bg-red-50 border border-red-200 rounded-md p-3 text-xs font-mono text-red-800 overflow-auto max-h-32">
              {result.error}
            </pre>
          </div>
        )}
        {result.stack && (
          <div>
            <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Stack:</h4>
            <pre className="bg-background border rounded-md p-3 text-xs font-mono overflow-auto max-h-32">
              {result.stack}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}