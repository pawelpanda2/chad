"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, FileText, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

interface ActionRecord {
  recordKey: string;
  body?: Record<string, unknown>;
}

interface LeadRecord {
  recordKey: string;
  body?: Record<string, unknown>;
}

interface CpCallTrace {
  step: string;
  args: string[];
  rawRequest: Record<string, unknown>;
  rawResponse: string;
  parsedResponse: Record<string, unknown> | null;
  parseError: string | null;
  error: string | null;
}

interface FolderData {
  userGuid: string;
  username?: string;
  repoKey?: string;
  actionRecords?: ActionRecord[];
  leadRecords?: LeadRecord[];
  cpCalls?: CpCallTrace[];
  error?: string;
  details?: string;
  debug?: {
    CONTENT_PROVIDER_API_URL: string;
    sessionDebug?: { hasCookie: boolean; cookieValue?: string; parsedUserId?: string };
  };
}

// Expanded record detail component
function RecordDetail({ recordKey, body }: { recordKey: string; body?: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  
  const getSummary = () => {
    if (!body) return null;
    if (body.formName === 'action') {
      return `${body.actionTitle || recordKey} | ${(body.actionTypeLabel || body.actionType) as string} | ${(body.actionStartTime || '—') as string}`;
    }
    if (body.formName === 'lead') {
      return `${body.name || recordKey} | ${(body.source || '—') as string} | ${(body.status || '—') as string}`;
    }
    return recordKey;
  };

  return (
    <div className="border rounded-md bg-muted/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-mono text-sm">{recordKey}</span>
        <span className="text-sm text-muted-foreground flex-1 text-right">{getSummary()}</span>
      </button>
      {expanded && body && (
        <div className="p-3 border-t bg-background">
          <pre className="text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
            {JSON.stringify(body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Developer logs section
function DeveloperLogs({ data }: { data: FolderData }) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">Developer logs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Session & Config Info */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Session & Config</h4>
          <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-auto max-h-48">
            {JSON.stringify({
              userGuid: data.userGuid,
              username: data.username,
              repoKey: data.repoKey,
              apiUrl: data.debug?.CONTENT_PROVIDER_API_URL,
              sessionDebug: data.debug?.sessionDebug,
            }, null, 2)}
          </pre>
        </div>

        {/* CP Calls */}
        {data.cpCalls && data.cpCalls.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">
              Content Provider Calls ({data.cpCalls.length})
            </h4>
            <div className="space-y-2">
              {data.cpCalls.map((call, index) => (
                <Card key={index} className={call.error ? "bg-red-50 border-red-200" : ""}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                      <span className="text-xs font-semibold">{call.step}</span>
                      {call.error && <Badge variant="destructive" className="text-xs">ERROR</Badge>}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Args:</div>
                      <pre className="bg-muted p-2 rounded text-xs font-mono overflow-auto">
                        {JSON.stringify(call.args)}
                      </pre>
                    </div>
                    {call.rawResponse && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Raw Response:</div>
                        <pre className="bg-muted p-2 rounded text-xs font-mono overflow-auto max-h-32 whitespace-pre-wrap break-all">
                          {call.rawResponse}
                        </pre>
                      </div>
                    )}
                    {call.parsedResponse && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Parsed Response:</div>
                        <pre className="bg-muted p-2 rounded text-xs font-mono overflow-auto max-h-32">
                          {JSON.stringify(call.parsedResponse, null, 2)}
                        </pre>
                      </div>
                    )}
                    {call.error && (
                      <div className="text-xs text-red-600">
                        <div className="text-muted-foreground">Error:</div>
                        <pre className="bg-red-50 p-2 rounded">{call.error}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FoldersPage() {
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/folders");
      const result = await res.json();
      setData(result);
    } catch (error) {
      setData({
        error: "Failed to fetch data",
        details: error instanceof Error ? error.message : "Unknown error",
        debug: {
          CONTENT_PROVIDER_API_URL: process.env.CONTENT_PROVIDER_API_URL || "not set",
        },
      } as unknown as FolderData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Folders</h2>
          <p className="text-muted-foreground">Przeglądanie struktury Content Provider</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Ładowanie...</div>
        </div>
      </div>
    );
  }

  const actionCount = data?.actionRecords?.length || 0;
  const leadCount = data?.leadRecords?.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Folders</h2>
          <p className="text-muted-foreground">Przeglądanie struktury Content Provider</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 ml-auto">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {data?.error ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{data.details || data.error}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Forms folder tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            forms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Actions folder */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">actions</h3>
              <Badge variant="secondary" className="ml-2">{actionCount}</Badge>
            </div>
            {actionCount > 0 ? (
              <div className="space-y-2 pl-6">
                {data?.actionRecords?.map((record, index) => (
                  <RecordDetail key={`${record.recordKey}-${index}`} recordKey={record.recordKey} body={record.body} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic pl-6">No action records found</p>
            )}
          </div>

          {/* Leads folder */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">leads</h3>
              <Badge variant="secondary" className="ml-2">{leadCount}</Badge>
            </div>
            {leadCount > 0 ? (
              <div className="space-y-2 pl-6">
                {data?.leadRecords?.map((record, index) => (
                  <RecordDetail key={`${record.recordKey}-${index}`} recordKey={record.recordKey} body={record.body} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic pl-6">No lead records found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Developer logs - always shown */}
      {data && <DeveloperLogs data={data} />}
    </div>
  );
}
