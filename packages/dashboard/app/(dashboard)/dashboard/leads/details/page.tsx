"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getNormalizedContactLink, getSafeReturnTo } from "@/lib/lead-links";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  User,
  MessageCircle,
  Plus,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ============================================================================
// Types
// ============================================================================

interface LeadContactInfo {
  name?: string | string[];
  phone?: string | string[];
  instagram?: string | string[];
  facebook?: string | string[];
  linkedin?: string | string[];
  website?: string | string[];
  www?: string | string[];
  email?: string | string[];
  whatsapp?: string | string[];
  telegram?: string | string[];
  age?: string | string[];
  [key: string]: string | string[] | undefined;
}

interface MsgWorkoutItem {
  physicalKey: string;
  logicalName: string;
  loca: string;
}

interface LeadDetailsData {
  leadKey: string;
  leadName: string;
  loca: string;
  contacts: LeadContactInfo | null;
  contactsError?: string;
  msgWorkouts: MsgWorkoutItem[];
  msgWorkoutsError?: string;
  msgWorkoutsNotFound: boolean;
}

// ============================================================================
// Contact field display configuration
// ============================================================================

const CONTACT_FIELD_CONFIG: Array<{
  key: string;
  label: string;
}> = [
  { key: "instagram", label: "Instagram" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" },
  { key: "facebook", label: "Facebook" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "www", label: "WWW" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
];

function toContactValues(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => v.trim()).filter(Boolean);
  }
  return value
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function getContactDisplayText(contactKey: string, value: string): string {
  // Return the original value as-is - do not shorten URLs
  return value;
}

function getContactLabel(key: string): string {
  const fromConfig = CONTACT_FIELD_CONFIG.find((field) => field.key === key);
  if (fromConfig) {
    return fromConfig.label;
  }
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderContactValue(contactKey: string, value: string) {
  const normalizedLink = getNormalizedContactLink(contactKey, value);

  if (!normalizedLink) {
    return <span className="text-sm font-medium">{getContactDisplayText(contactKey, value)}</span>;
  }

  return (
    <Link
      href={normalizedLink.href}
      className="text-sm font-medium text-primary underline underline-offset-4"
      target="_blank"
      rel="noopener noreferrer"
    >
      {getContactDisplayText(contactKey, value)}
    </Link>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function LeadDetailsPage() {
  return (
    <Suspense fallback={null}>
      <LeadDetailsPageContent />
    </Suspense>
  );
}

function LeadDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get lead info from URL query params
  const leadName = searchParams.get("leadName");
  const leadLoca = searchParams.get("leadLoca");
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));

  // State
  const [details, setDetails] = useState<LeadDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState<string>("-5");

  /** Load lead details */
  const loadDetails = useCallback(async () => {
    if (!leadName || !leadLoca) {
      setError("Missing lead information");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `/api/leads-dashboard/details?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setDetails(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load lead details";
      setError(errorMsg);
      console.error("Error loading lead details:", err);
    } finally {
      setLoading(false);
    }
  }, [leadName, leadLoca]);

  // Load details on mount
  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  /** Go back to leads list */
  const handleBack = () => {
    router.push(returnTo || "/dashboard/views?view=leads");
  };

  /** Extract item number from loca (last segment) */
  function getItemNumber(loca: string): string {
    const segments = loca.split("/");
    return segments[segments.length - 1] || "";
  }

  /** Apply limit filter to workouts (preserves Content Provider order) */
  function getFilteredWorkouts(workouts: MsgWorkoutItem[]): MsgWorkoutItem[] {
    // Parse limit value
    const limitValue = parseInt(limitInput, 10);

    // If invalid or 0/NaN, show all (preserve Content Provider order)
    if (isNaN(limitValue) || limitValue === 0) {
      return workouts;
    }

    const absLimit = Math.abs(limitValue);

    if (limitValue > 0) {
      // Positive: show first N
      return workouts.slice(0, absLimit);
    } else {
      // Negative: show last N
      return workouts.slice(-absLimit);
    }
  }

  /** Create a new msg workout for the current lead */
  const handleCreateWorkout = useCallback(async () => {
    if (!leadName || !leadLoca) return;

    setCreatingWorkout(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/leads-dashboard/msg-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leadName, leadLoca }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create: ${response.status}`);
      }

      // Refresh the list only - do not navigate to the new workout
      await loadDetails();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create workout";
      setCreateError(errorMsg);
      console.error("Error creating workout:", err);
    } finally {
      setCreatingWorkout(false);
    }
  }, [leadName, leadLoca, loadDetails]);

  // ========================================================================
  // Render
  // ========================================================================

  if (!leadName || !leadLoca) {
    return (
      <div className="-m-[22px] flex min-h-[calc(100dvh-4rem-20px)] flex-col gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
            <AlertCircle className="h-6 w-6" />
            <span>Missing lead information</span>
            <button
              onClick={handleBack}
              className="text-sm text-primary hover:underline mt-2"
            >
              Go back to leads
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="-m-[22px] flex min-h-[calc(100dvh-4rem-20px)] flex-col gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </button>
        </div>
        <Card className="flex-1 gap-0 overflow-hidden py-0">
          <CardContent className="flex items-center justify-center h-full p-[10px]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading lead details...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="-m-[22px] flex min-h-[calc(100dvh-4rem-20px)] flex-col gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </button>
        </div>
        <Card className="flex-1 gap-0 overflow-hidden py-0">
          <CardContent className="flex items-center justify-center h-full p-[10px]">
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
              <AlertCircle className="h-6 w-6" />
              <span>{error || "Lead not found"}</span>
              <button
                onClick={loadDetails}
                className="text-sm text-primary hover:underline mt-2"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="-m-[22px] flex min-h-[calc(100dvh-4rem-20px)] flex-col gap-[10px]">
      {/* Header */}
      <div className="flex items-center gap-[10px]">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </button>
      </div>

      {/* Lead Header Card */}
      <Card className="gap-0 py-0">
        <CardContent className="px-[14px] py-[12px]">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold leading-tight truncate">{details.leadName}</h1>
                {details.loca && (
                  <>
                    <span className="text-muted-foreground flex-shrink-0">·</span>
                    <span className="text-xs text-muted-foreground truncate">{details.loca}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Card */}
      <Card className="gap-0 py-0">
        <CardContent className="px-[14px] py-[10px]">
          <h2 className="text-sm font-semibold mb-2">Contacts</h2>

          {details.contactsError ? (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{details.contactsError}</span>
            </div>
          ) : !details.contacts ? (
            <div className="text-sm text-muted-foreground">No contacts</div>
          ) : (
            <div className="space-y-1.5">
              {(() => {
                const orderedKeys = CONTACT_FIELD_CONFIG.map((c) => c.key).filter((key) => {
                  const values = toContactValues(details.contacts?.[key]);
                  return values.length > 0;
                });

                const extraKeys = Object.keys(details.contacts)
                  .filter((key) => !CONTACT_FIELD_CONFIG.some((c) => c.key === key))
                  .filter((key) => toContactValues(details.contacts?.[key]).length > 0)
                  .sort();

                const keysToRender = [...orderedKeys, ...extraKeys];

                if (keysToRender.length === 0) {
                  return <div className="text-sm text-muted-foreground">No contacts</div>;
                }

                return keysToRender.map((key) => {
                  const values = toContactValues(details.contacts?.[key]);
                  if (values.length === 0) return null;

                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{getContactLabel(key)}:</span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        {values.map((value, index) => (
                          <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
                            {renderContactValue(key, value)}
                            {index < values.length - 1 && <span className="text-muted-foreground">•</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Msg Workouts Card */}
      <Card className="flex-1 gap-0 overflow-hidden py-0">
        <CardContent className="px-[14px] py-[10px]">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold">Msg workouts</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateWorkout}
              disabled={creatingWorkout}
              className="h-7 gap-1 px-2"
            >
              {creatingWorkout ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              New
            </Button>
            <Input
              type="text"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="h-7 w-16 text-center text-sm"
              placeholder="-5"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadDetails}
              className="h-7 gap-1 px-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {createError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg text-xs mb-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {details.msgWorkoutsError ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{details.msgWorkoutsError}</span>
            </div>
          ) : details.msgWorkoutsNotFound || details.msgWorkouts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No msg workouts</div>
          ) : (
            <div className="space-y-1">
              {(() => {
                const filteredWorkouts = getFilteredWorkouts(details.msgWorkouts);
                return filteredWorkouts.map((workout) => {
                  const itemNumber = getItemNumber(workout.loca);
                  return (
                    <div
                      key={workout.physicalKey}
                      className="flex items-center gap-2 text-sm py-1 px-2"
                    >
                      <span className="text-muted-foreground flex-shrink-0 w-12 text-right font-mono text-xs">
                        {itemNumber} ·
                      </span>
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <Link
                        href={`/dashboard/leads/msg-workout?leadName=${encodeURIComponent(details.leadName)}&leadLoca=${encodeURIComponent(details.loca)}&workoutName=${encodeURIComponent(workout.logicalName)}&workoutLoca=${encodeURIComponent(workout.loca)}`}
                        className="truncate hover:text-primary transition-colors"
                      >
                        {workout.logicalName}
                      </Link>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}