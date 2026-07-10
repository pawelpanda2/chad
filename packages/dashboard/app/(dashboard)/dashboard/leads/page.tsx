"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { buildLeadDetailsHref, getLeadDetailsHref } from "@/lib/lead-links";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  User,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface LeadDashboardItem {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageContent />
    </Suspense>
  );
}

function LeadsPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // State
  const [leads, setLeads] = useState<LeadDashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load all leads */
  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/leads-dashboard");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setLeads(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load leads";
      setError(errorMsg);
      console.error("Error loading leads:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load leads on mount
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="-m-[22px] flex min-h-[calc(100dvh-4rem-20px)] flex-col gap-[10px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-[10px]">
        <h1 className="text-xl font-semibold">Leads</h1>
        <button
          onClick={loadLeads}
          disabled={loading}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            {leads.length} leads
          </span>
        )}
      </div>

      {/* Main Content */}
      <Card className="flex-1 gap-0 overflow-hidden py-0">
        <CardContent className="h-full p-[10px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading leads...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
                <AlertCircle className="h-6 w-6" />
                <span>{error}</span>
                <button
                  onClick={loadLeads}
                  className="text-sm text-primary hover:underline mt-2"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground text-center px-4">
                <User className="h-12 w-12 opacity-20" />
                <span className="text-sm">No leads found</span>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {leads.map((lead) => (
                <div
                  key={lead.leadKey}
                  className="flex items-center rounded-lg px-[10px] py-[10px] transition-colors group hover:bg-accent"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Link
                      href={getLeadDetailsHref(lead.leadName, lead.loca)}
                      className="flex flex-shrink-0 items-center gap-2 rounded-lg"
                      aria-label={`Open lead details for ${lead.leadName}`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {lead.leadKey}.
                      </span>
                    </Link>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-sm truncate select-text">
                        {lead.leadName}
                      </span>
                      <Link
                        href={buildLeadDetailsHref({
                          leadName: lead.leadName,
                          leadLoca: lead.loca,
                          returnTo,
                        })}
                        className="text-xs text-primary underline underline-offset-4"
                      >
                        info
                      </Link>
                      {lead.hasContacts ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Contacts
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No contacts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}