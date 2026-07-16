"use client";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { VoiceRecordingPanel } from "@/components/shared/voice-recording-panel";
import { ErrorBox } from "@/components/shared/error-box";
import { toast } from "sonner";
import { Plus, X, CheckCircle2, AlertCircle } from "lucide-react";

// ============================================================================
// Constants & Mappings
// ============================================================================

const APPROACH_KINDS = [
  { value: "p", label: "Daygame" },
  { value: "n", label: "Nightgame" },
  { value: "t", label: "Tinder" },
  { value: "s", label: "Organized event" },
  { value: "z", label: "Friends" },
  { value: "w", label: "Her initiative" },
];

const CONTACT_TYPES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "number", label: "Number" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
];

// Map contact type to second letter of code
const CONTACT_TO_LETTER: Record<string, string> = {
  number: "n",
  whatsapp: "w",
  instagram: "i",
  facebook: "f",
  telegram: "t",
};

// ============================================================================
// Types
// ============================================================================

interface ContactLine {
  id: string;
  type: string;
  value: string;
}

interface LeadFormData {
  meetingDay: string;
  approachKind: string;
  name: string;
  surname: string;
  postfix: string;
}

interface ActionFormData {
  actionType: "dg" | "ng";
  optionalTitleSuffix: string;
  actionDate: string;
  actionTitle: string;
  actionStartTime: string;
  city: string;
  notes: string;
}

interface AddActionFormData {
  date: string;
  state: string;
  trainingTime: string;
  verbalExercises: string;
  infield: string;
  theory: string;
  fieldReview: string;
  actionTime: string;
  outings: string;
  approaches: string;
  longInteractions: string;
  numbers: string;
  firstMessages: string;
  responses: string;
  datesSetUp: string;
  dates: string;
}

interface DateEntryFormData {
  data: string;
  zrodlo: string;
  nazwa: string;
  link: string;
  pull: string;
  close: string;
  jakosc: string;
}

type FormType = null | "action" | "lead" | "add_action" | "date_entry" | "reports";

// ============================================================================
// Helper Functions
// ============================================================================

function formatMeetingDay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "";
  return `${parts[0].slice(-2)}-${parts[1]}-${parts[2]}`;
}

function getSecondLetter(contacts: ContactLine[]): string {
  // Get first non-empty contact and map to letter
  const firstContact = contacts.find(c => c.type && c.value.trim());
  if (firstContact && CONTACT_TO_LETTER[firstContact.type]) {
    return CONTACT_TO_LETTER[firstContact.type];
  }
  return "x"; // default: no contact
}

function generateLeadNamePreview(data: LeadFormData, contacts: ContactLine[]): string {
  const formattedDate = formatMeetingDay(data.meetingDay);
  if (!formattedDate) return "";

  const firstLetter = data.approachKind || "x";
  const secondLetter = getSecondLetter(contacts);
  const code = `${firstLetter}${secondLetter}`;

  const parts: string[] = [formattedDate, code];

  if (data.name?.trim()) {
    parts.push(data.name.trim().replace(/\s+/g, "_"));
  }
  if (data.surname?.trim()) {
    parts.push(data.surname.trim().replace(/\s+/g, "_"));
  }
  if (data.postfix?.trim()) {
    parts.push(data.postfix.trim().replace(/\s+/g, "_"));
  }

  return parts.join("_");
}

function generateContactId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function buildContactsYaml(contacts: ContactLine[]): string {
  const grouped: Record<string, string[]> = {};
  for (const contact of contacts) {
    if (!contact.type || !contact.value.trim()) continue;
    if (!grouped[contact.type]) grouped[contact.type] = [];
    grouped[contact.type].push(contact.value.trim());
  }
  const lines: string[] = [];
  for (const [type, values] of Object.entries(grouped)) {
    if (values.length === 0) continue;
    lines.push(`${type}:`);
    for (const value of values) {
      lines.push(`  - ${value}`);
    }
  }
  return lines.join("\n");
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function generateActionDate(date: Date): string {
  return `${date.getFullYear().toString().slice(-2)}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function generateActionTitle(date: Date, actionType: 'dg' | 'ng', suffix?: string): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  let title = `${year}-${month}-${day}_${actionType}`;
  if (suffix?.trim()) title += `_${suffix.trim()}`;
  return title;
}

/**
 * Generates the Reports form's read-only display name: {YY-MM-DD}_{kind}_{suffix}.
 * Separate from generateActionTitle — that one belongs to the unrelated
 * "Actions" form and only supports the 2-value dg/ng union.
 */
function generateReportName(dateStr: string, kind: "dg" | "ng" | "op" | "other", suffix: string): string {
  const shortDate = dateStr.length === 10 ? dateStr.slice(2) : dateStr;
  let name = `${shortDate}_${kind}`;
  if (suffix.trim()) name += `_${suffix.trim()}`;
  return name;
}

// ============================================================================
// Main Component
// ============================================================================

export default function FormsPage() {
  return (
    <Suspense fallback={null}>
      <FormsPageContent />
    </Suspense>
  );
}

function FormsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for which form is selected, so
  // browser back/forward works correctly: forms menu -> a form -> (on save)
  // a view. Each transition uses router.push (a new history entry), never
  // replace, so back-navigation steps through each state in order.
  const formParam = searchParams.get("form");
  const selectedForm: FormType =
    formParam === "action" || formParam === "lead" || formParam === "add_action" || formParam === "date_entry" || formParam === "reports"
      ? formParam
      : null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Reports form state — two stages. Stage 1 (reportLoca === null): the
  // metadata panel is editable and the generated name recomputes live from
  // date/kind/suffix. Create locks the metadata and reveals stage 2: the
  // editor, saved via the same loca (never PostParentItem again) so
  // repeated saves never create duplicate reports under views/reports.
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [reportKind, setReportKind] = useState<"dg" | "ng" | "op" | "other">("dg");
  const [reportSuffix, setReportSuffix] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportLoca, setReportLoca] = useState<string | null>(null);
  const [reportItemName, setReportItemName] = useState<string | null>(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Generated name is only "live" before Create — once reportItemName is
  // set (Create succeeded), that locked, server-confirmed name is shown
  // instead, and date/kind/suffix can no longer change it (see prompt: the
  // generated name becomes the report's identity, not a display refreshed
  // on every keystroke).
  const generatedReportName = useMemo(
    () => generateReportName(reportDate, reportKind, reportSuffix),
    [reportDate, reportKind, reportSuffix]
  );
  const displayedReportName = reportItemName ?? generatedReportName;

  // Action form state
  const [actionData, setActionData] = useState<ActionFormData>({
    actionType: "dg",
    optionalTitleSuffix: "",
    actionDate: generateActionDate(new Date()),
    actionTitle: generateActionTitle(new Date(), "dg"),
    actionStartTime: formatTime(new Date()),
    city: "warszawa",
    notes: "",
  });

  // Lead form state
  const [leadData, setLeadData] = useState<LeadFormData>({
    meetingDay: getTodayDate(),
    approachKind: "",
    name: "",
    surname: "",
    postfix: "",
  });

  // Add Action form state (DAILY ENTRY)
  const [addActionData, setAddActionData] = useState<AddActionFormData>({
    date: getTodayDate(),
    state: "",
    trainingTime: "",
    verbalExercises: "NIE",
    infield: "NIE",
    theory: "NIE",
    fieldReview: "NIE",
    actionTime: "",
    outings: "",
    approaches: "",
    longInteractions: "",
    numbers: "",
    firstMessages: "",
    responses: "",
    datesSetUp: "",
    dates: "",
  });

  // Date Entry form state
  const [dateEntryData, setDateEntryData] = useState<DateEntryFormData>({
    data: getTodayDate(),
    zrodlo: "",
    nazwa: "",
    link: "",
    pull: "FALSE",
    close: "NIE",
    jakosc: "",
  });

  // Contacts state
  const [contacts, setContacts] = useState<ContactLine[]>([]);

  // Contact type selector for adding new contacts
  const [newContactType, setNewContactType] = useState<string>("number");

  // Generate lead name preview
  const leadNamePreview = useMemo(() => generateLeadNamePreview(leadData, contacts), [leadData, contacts]);

  // Check if lead form is valid for submission
  const isLeadFormValid = useMemo(() => {
    return leadData.meetingDay && leadData.approachKind && leadNamePreview;
  }, [leadData, leadNamePreview]);

  const addContact = useCallback(() => {
    if (!newContactType) return;
    setContacts(prev => [...prev, { id: generateContactId(), type: newContactType, value: "" }]);
  }, [newContactType]);

  const updateContact = useCallback((id: string, value: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, value } : c));
  }, []);

  const removeContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  const resetLeadForm = useCallback(() => {
    setLeadData({ meetingDay: getTodayDate(), approachKind: "", name: "", surname: "", postfix: "" });
    setContacts([]);
    setNewContactType("number");
    setSubmitResult(null);
  }, []);

  const resetActionForm = useCallback(() => {
    const now = new Date();
    setActionData({
      actionType: "dg",
      optionalTitleSuffix: "",
      actionDate: generateActionDate(now),
      actionTitle: generateActionTitle(now, "dg"),
      actionStartTime: formatTime(now),
      city: "warszawa",
      notes: "",
    });
  }, []);

  const resetAddActionForm = useCallback(() => {
    setAddActionData({
      date: getTodayDate(),
      state: "",
      trainingTime: "",
      verbalExercises: "NIE",
      infield: "NIE",
      theory: "NIE",
      fieldReview: "NIE",
      actionTime: "",
      outings: "",
      approaches: "",
      longInteractions: "",
      numbers: "",
      firstMessages: "",
      responses: "",
      datesSetUp: "",
      dates: "",
    });
  }, []);

  const resetDateEntryForm = useCallback(() => {
    setDateEntryData({
      data: getTodayDate(),
      zrodlo: "",
      nazwa: "",
      link: "",
      pull: "FALSE",
      close: "NIE",
      jakosc: "",
    });
  }, []);

  const resetReportsForm = useCallback(() => {
    setReportDate(getTodayDate());
    setReportKind("dg");
    setReportSuffix("");
    setReportContent("");
    setReportLoca(null);
    setReportItemName(null);
    setReportSaved(false);
    setReportError(null);
  }, []);

  const handleFormSelect = (form: FormType) => {
    if (form === "action") resetActionForm();
    else if (form === "lead") resetLeadForm();
    else if (form === "add_action") resetAddActionForm();
    else if (form === "date_entry") resetDateEntryForm();
    else if (form === "reports") resetReportsForm();
    router.push(`${pathname}?form=${form}`);
  };

  const handleFormBack = () => {
    router.push(pathname);
  };

  // Auto-generate action title when type, date, or suffix changes
  useEffect(() => {
    if (selectedForm === "action") {
      const title = generateActionTitle(
        new Date(actionData.actionDate.replace(/^(\d{2})-/, "20$1-")),
        actionData.actionType,
        actionData.optionalTitleSuffix
      );
      setActionData(prev => ({ ...prev, actionTitle: title }));
    }
  }, [actionData.actionDate, actionData.actionType, actionData.optionalTitleSuffix, selectedForm]);

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const now = new Date();
      const recordKey = `${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
      const payload = {
        recordKey,
        actionTitle: actionData.actionTitle,
        actionDate: actionData.actionDate,
        actionType: actionData.actionType,
        actionTypeLabel: actionData.actionType === "dg" ? "daygame" : "nightgame",
        optionalTitleSuffix: actionData.optionalTitleSuffix || undefined,
        actionStartTime: actionData.actionStartTime,
        actionStartDateTime: `${actionData.actionDate}T${actionData.actionStartTime}:00`,
        notes: actionData.notes || undefined,
        city: actionData.city,
      };
      const response = await fetch("/api/forms/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setSubmitResult({ type: "success", message: `Action "${actionData.actionTitle}" saved successfully!` });
        toast.success("Action saved successfully!");
        setTimeout(() => { setSubmitResult(null); resetActionForm(); router.push(pathname); }, 3000);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setSubmitResult({ type: "error", message: errorMsg });
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLeadFormValid) {
      toast.error("Please fill in Meeting Date and Source");
      return;
    }
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const leadName = generateLeadNamePreview(leadData, contacts);
      if (!leadName) throw new Error("Failed to generate lead name");
      const contactsYaml = buildContactsYaml(contacts);
      const payload = {
        leadName,
        meetingDay: leadData.meetingDay,
        approachKind: leadData.approachKind,
        name: leadData.name || undefined,
        surname: leadData.surname || undefined,
        postfix: leadData.postfix || undefined,
        contacts: contactsYaml || undefined,
      };
      const response = await fetch("/api/forms/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unknown error");
      setSubmitResult({ type: "success", message: `Lead "${leadName}" saved successfully!` });
      toast.success(`Lead "${leadName}" saved successfully!`);
      setTimeout(() => { setSubmitResult(null); resetLeadForm(); router.push(pathname); }, 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setSubmitResult({ type: "error", message: errorMsg });
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Build payload for daily entry
      const payload = {
        "DATE": addActionData.date,
        "STATE": addActionData.state,
        "TRAINING TIME": addActionData.trainingTime,
        "VERBAL EXERCISES": addActionData.verbalExercises,
        "INFIELD": addActionData.infield,
        "THEORY": addActionData.theory,
        "FIELD REVIEW": addActionData.fieldReview,
        "ACTION TIME": addActionData.actionTime,
        "OUTINGS": addActionData.outings,
        "APPROACHES": addActionData.approaches,
        "LONG INTERACTIONS": addActionData.longInteractions,
        "NUMBERS": addActionData.numbers,
        "FIRST MESSAGES": addActionData.firstMessages,
        "RESPONSES": addActionData.responses,
        "DATES SET UP": addActionData.datesSetUp,
        "DATES": addActionData.dates,
      };

      const response = await fetch("/api/forms/daily-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setSubmitResult({ 
          type: "success", 
          message: `DAILY ENTRY saved as "${result.itemName}"! Path: ${result.path || 'views/daily'}`
        });
        toast.success(`DAILY ENTRY saved as "${result.itemName}"!`);
        setTimeout(() => { setSubmitResult(null); resetAddActionForm(); router.push("/dashboard/views?view=tracker"); }, 1200);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setSubmitResult({ type: "error", message: errorMsg });
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Build payload for date entry
      const payload = {
        "DATA": dateEntryData.data,
        "ŹRÓDŁO": dateEntryData.zrodlo,
        "NAZWA": dateEntryData.nazwa,
        "LINK": dateEntryData.link,
        "PULL": dateEntryData.pull,
        "CLOSE": dateEntryData.close,
        "JAKOŚĆ": dateEntryData.jakosc,
      };

      const response = await fetch("/api/forms/date-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setSubmitResult({ 
          type: "success", 
          message: `DATE ENTRY saved as "${result.itemName}"! Path: ${result.path || 'views/dates'}`
        });
        toast.success(`DATE ENTRY saved as "${result.itemName}"!`);
        setTimeout(() => { setSubmitResult(null); resetDateEntryForm(); router.push("/dashboard/views?view=dates"); }, 1200);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setSubmitResult({ type: "error", message: errorMsg });
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportCreate = async () => {
    setReportSaving(true);
    setReportError(null);
    try {
      const response = await fetch("/api/forms/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "", itemName: generatedReportName }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      setReportLoca(result.loca);
      setReportItemName(result.itemName);
      toast.success(`Report "${result.itemName}" created`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setReportError(errorMsg);
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setReportSaving(false);
    }
  };

  /**
   * Updates the already-created report. Accepts an optional content
   * override so callers that just changed `reportContent` (e.g. Move, which
   * can't rely on the state update having landed yet) can save the exact
   * value they intend, without duplicating this function's POST logic.
   * Returns whether the save succeeded, so callers like Move can decide
   * whether it's safe to clear their own local state.
   */
  const handleReportSave = async (contentOverride?: string): Promise<boolean> => {
    if (!reportLoca) return false;
    const content = contentOverride ?? reportContent;
    setReportSaving(true);
    setReportError(null);
    try {
      const response = await fetch("/api/forms/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, loca: reportLoca }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      setReportSaved(true);
      toast.success("Report updated");
      setTimeout(() => setReportSaved(false), 3000);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setReportError(errorMsg);
      toast.error(`Error: ${errorMsg}`);
      return false;
    } finally {
      setReportSaving(false);
    }
  };

  const handleReportContentChange = (value: string) => {
    setReportContent(value);
    if (reportSaved) setReportSaved(false);
  };

  /** Move: append the recording panel's transcript to the report body and
   * save it immediately, through the same `handleReportSave` the Save
   * button uses — never a second, duplicated save path. */
  const handleReportVoiceMove = async (text: string): Promise<boolean> => {
    const combined = reportContent.trim() ? `${reportContent}\n${text}` : text;
    setReportContent(combined);
    return handleReportSave(combined);
  };

  // ============================================================================
  // Render: Form List View
  // ============================================================================

  if (!selectedForm) {
    return (
      <DashboardPageShell title="FORMS">
        {/*
          Fixed 4-column grid: buttons always sit on a 4-wide grid. A partial
          last row keeps each button at its column width and leaves the empty
          cells blank (like a table slot with no button) instead of stretching
          the remaining buttons across the row.
        */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleFormSelect("add_action")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">ADD DAILY ENTRY</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("date_entry")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">ADD DATE</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("lead")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">ADD LEAD</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("action")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">ADD ACTION</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("reports")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">ADD REPORT</span>
          </button>
        </div>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Reports Form
  // ============================================================================

  if (selectedForm === "reports") {
    const isReportCreated = reportLoca !== null;
    return (
      <DashboardPageShell
        scroll={!isReportCreated}
        padded={false}
        contentClassName="p-[3px] space-y-[3px]"
        upLevel={{ onClick: handleFormBack }}
        title="ADD REPORT"
      >
        <ErrorBox message={reportError} className="shrink-0" />

        {/* Inner frame: Create (or its locked Generated name placeholder)
            first, then Generated name — both left-aligned, top of the
            frame (Story 62 standard: save/create controls at the top,
            grouped with the generated name). */}
        <div className="shrink-0 rounded-lg border bg-muted/10 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {!isReportCreated && (
              <Button onClick={handleReportCreate} disabled={reportSaving}>
                {reportSaving ? "Creating..." : "Create"}
              </Button>
            )}
            <div className="space-y-1">
              <Label>Generated name</Label>
              <Input value={displayedReportName} readOnly className="bg-muted font-mono w-[320px]" />
            </div>
          </div>

          {/* Row 2: the rest of the metadata, locked once the report exists. */}
          <div className="mt-3 grid gap-3 md:grid-cols-[auto_auto_1fr] items-end">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                disabled={isReportCreated}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label>Report kind</Label>
              <Select
                value={reportKind}
                onValueChange={v => setReportKind(v as "dg" | "ng" | "op" | "other")}
                disabled={isReportCreated}
              >
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dg">Daygame</SelectItem>
                  <SelectItem value="ng">Nightgame</SelectItem>
                  <SelectItem value="op">Organized party</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rest of the name</Label>
              <Input
                placeholder="e.g. galeria mokotów"
                value={reportSuffix}
                onChange={e => setReportSuffix(e.target.value)}
                disabled={isReportCreated}
              />
            </div>
          </div>
        </div>

        <VoiceRecordingPanel
          reportCreated={isReportCreated}
          saving={reportSaving}
          onMove={handleReportVoiceMove}
        />

        {isReportCreated && (
          <TextEditorWithToolbar
            value={reportContent}
            onChange={handleReportContentChange}
            onSave={handleReportSave}
            saving={reportSaving}
            saved={reportSaved}
            placeholder="Write your report..."
            defaultTab="editor"
            className="h-full"
          />
        )}
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Action Form
  // ============================================================================

  if (selectedForm === "action") {
    return (
      <DashboardPageShell
        padded={false}
        contentClassName="p-[3px] space-y-[3px]"
        upLevel={{ onClick: handleFormBack }}
        title="ADD ACTION"
      >
            <form onSubmit={handleActionSubmit} className="space-y-[3px]">
              {/* Top frame: Save + generated name, left-aligned (Story 62
                  standard — save controls live at the top, grouped with the
                  generated name when one exists). */}
              <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/10 p-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
                <div className="space-y-1">
                  <Label>Title (auto-generated)</Label>
                  <Input value={actionData.actionTitle} readOnly className="bg-muted font-mono w-[200px]" />
                </div>
              </div>

              {/* Second frame: the rest of the fields. */}
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <div className="grid gap-3 md:grid-cols-3 items-end">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={actionData.actionType} onValueChange={v => setActionData({ ...actionData, actionType: v as "dg" | "ng" })}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dg">Daygame</SelectItem>
                        <SelectItem value="ng">Nightgame</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Suffix (optional)</Label>
                    <Input placeholder="e.g. gallery" value={actionData.optionalTitleSuffix} onChange={e => setActionData({ ...actionData, optionalTitleSuffix: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={actionData.actionDate} onChange={e => setActionData({ ...actionData, actionDate: e.target.value })} className="w-[160px]" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>City</Label>
                    <Select value={actionData.city} onValueChange={v => setActionData({ ...actionData, city: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warszawa">Warsaw</SelectItem>
                        <SelectItem value="krakow">Krakow</SelectItem>
                        <SelectItem value="wroclaw">Wroclaw</SelectItem>
                        <SelectItem value="gdansk">Gdansk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Start Time</Label>
                    <Input type="time" value={actionData.actionStartTime} onChange={e => setActionData({ ...actionData, actionStartTime: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input value={actionData.notes} onChange={e => setActionData({ ...actionData, notes: e.target.value })} placeholder="Optional notes..." />
                </div>
              </div>
            </form>
        {submitResult && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="text-sm">{submitResult.message}</span>
          </div>
        )}
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Daily Entry Form (formerly ADD ACTION)
  // ============================================================================

  if (selectedForm === "add_action") {
    const dailyRows: Array<{ label: string; key: keyof AddActionFormData; type: "date" | "text" | "yesno" }> = [
      { label: "DATE", key: "date", type: "date" },
      { label: "STATE", key: "state", type: "text" },
      { label: "TRAINING TIME", key: "trainingTime", type: "text" },
      { label: "VERBAL EXERCISES", key: "verbalExercises", type: "yesno" },
      { label: "INFIELD", key: "infield", type: "yesno" },
      { label: "THEORY", key: "theory", type: "yesno" },
      { label: "FIELD REVIEW", key: "fieldReview", type: "yesno" },
      { label: "ACTION TIME", key: "actionTime", type: "text" },
      { label: "OUTINGS", key: "outings", type: "text" },
      { label: "APPROACHES", key: "approaches", type: "text" },
      { label: "LONG INTERACTIONS", key: "longInteractions", type: "text" },
      { label: "NUMBERS", key: "numbers", type: "text" },
      { label: "FIRST MESSAGES", key: "firstMessages", type: "text" },
      { label: "RESPONSES", key: "responses", type: "text" },
      { label: "DATES SET UP", key: "datesSetUp", type: "text" },
      { label: "DATES", key: "dates", type: "text" },
    ];

    return (
      <DashboardPageShell
        padded={false}
        contentClassName="p-[3px] space-y-[3px]"
        upLevel={{ onClick: handleFormBack }}
        title="ADD DAILY ENTRY"
      >
            <form onSubmit={handleAddActionSubmit} className="space-y-[3px]">
              {/* Save is free-standing (no frame) at the top — this form has
                  no generated-name concept, per the Story 62 standard: save
                  controls always live at the top, framed together with a
                  generated name when one exists, otherwise free-standing. */}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>

              {/* Inner frame holds the form itself — no duplicate title row
                  inside (the shell's own `title` above is the only title). */}
              <div className="max-w-xl rounded-lg border bg-muted/10 p-2">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {dailyRows.map((row) => (
                      <tr key={row.key}>
                        <td className="border bg-muted/60 px-3 py-2 font-semibold w-1/2">{row.label}</td>
                        <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                          {row.type === "date" && (
                            <Input
                              type="date"
                              value={addActionData[row.key]}
                              onChange={(e) => setAddActionData({ ...addActionData, [row.key]: e.target.value })}
                              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                            />
                          )}
                          {row.type === "yesno" && (
                            <select
                              value={addActionData[row.key]}
                              onChange={(e) => setAddActionData({ ...addActionData, [row.key]: e.target.value })}
                              className="h-8 w-full rounded-md border-0 bg-transparent px-1 text-sm outline-none"
                            >
                              <option value="NIE">NIE</option>
                              <option value="TAK">TAK</option>
                            </select>
                          )}
                          {row.type === "text" && (
                            <Input
                              value={addActionData[row.key]}
                              onChange={(e) => setAddActionData({ ...addActionData, [row.key]: e.target.value })}
                              className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </form>
        {submitResult && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="text-sm">{submitResult.message}</span>
          </div>
        )}
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Date Entry Form
  // ============================================================================

  if (selectedForm === "date_entry") {
    return (
      <DashboardPageShell
        padded={false}
        contentClassName="p-[3px] space-y-[3px]"
        upLevel={{ onClick: handleFormBack }}
        title="ADD DATE"
      >
            <form onSubmit={handleDateEntrySubmit} className="space-y-[3px]">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
              <div className="max-w-xl rounded-lg border bg-muted/10 p-2">
              <table className="w-full border-collapse text-sm">
                <tbody>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold w-1/2">DATA</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      type="date"
                      value={dateEntryData.data}
                      onChange={e => setDateEntryData({ ...dateEntryData, data: e.target.value })}
                      className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">ŹRÓDŁO</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      value={dateEntryData.zrodlo}
                      onChange={e => setDateEntryData({ ...dateEntryData, zrodlo: e.target.value })}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">NAZWA</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      value={dateEntryData.nazwa}
                      onChange={e => setDateEntryData({ ...dateEntryData, nazwa: e.target.value })}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">LINK</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      value={dateEntryData.link}
                      onChange={e => setDateEntryData({ ...dateEntryData, link: e.target.value })}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">PULL</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={dateEntryData.pull === "TRUE"}
                      onChange={e => setDateEntryData({ ...dateEntryData, pull: e.target.checked ? "TRUE" : "FALSE" })}
                      className="h-4 w-4 rounded border-gray-400"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">CLOSE</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <select
                      value={dateEntryData.close}
                      onChange={e => setDateEntryData({ ...dateEntryData, close: e.target.value })}
                      className="h-8 w-full rounded-md border-0 bg-transparent px-1 text-sm outline-none"
                    >
                      <option value="NIE">NIE</option>
                      <option value="BLISKO">BLISKO</option>
                      <option value="TAK">TAK</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="border bg-muted/60 px-3 py-2 font-semibold">JAKOŚĆ</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      value={dateEntryData.jakosc}
                      onChange={e => setDateEntryData({ ...dateEntryData, jakosc: e.target.value })}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                      placeholder="e.g. 8,0"
                    />
                  </td>
                </tr>
                </tbody>
              </table>
              </div>
            </form>
        {submitResult && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="text-sm">{submitResult.message}</span>
          </div>
        )}
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Lead Form
  // ============================================================================

  return (
    <DashboardPageShell
      padded={false}
      contentClassName="p-[3px] space-y-[3px]"
      upLevel={{ onClick: handleFormBack }}
      title="ADD LEAD"
    >
          <form onSubmit={handleLeadSubmit} className="space-y-[3px]">

            {/* Top frame: Save + generated name, left-aligned (Story 62
                standard). */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/10 p-4">
              <Button type="submit" disabled={isSubmitting || !isLeadFormValid}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
              {leadNamePreview && (
                <span className="font-mono text-sm text-primary font-semibold">{leadNamePreview}</span>
              )}
            </div>

            {/* Lead Name/Id Section */}
            <div className="border-2 border-primary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-primary">Lead Name/Id</h3>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor="meetingDay" className="text-xs">Meeting Date *</Label>
                  <Input id="meetingDay" type="date" value={leadData.meetingDay} onChange={e => setLeadData({ ...leadData, meetingDay: e.target.value })} required className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="source" className="text-xs">Source *</Label>
                  <Select value={leadData.approachKind} onValueChange={v => setLeadData({ ...leadData, approachKind: v })} required>
                    <SelectTrigger id="source" className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {APPROACH_KINDS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Name</Label>
                  <Input id="name" placeholder="e.g. Ania" value={leadData.name} onChange={e => setLeadData({ ...leadData, name: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="surname" className="text-xs">Surname</Label>
                  <Input id="surname" placeholder="e.g. Styk" value={leadData.surname} onChange={e => setLeadData({ ...leadData, surname: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="postfix" className="text-xs">Postfix</Label>
                  <Input id="postfix" placeholder="e.g. redhead" value={leadData.postfix} onChange={e => setLeadData({ ...leadData, postfix: e.target.value })} className="h-8" />
                </div>
              </div>
            </div>

            {/* Contacts Section */}
            <div className="border-2 border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">Contacts</h3>
                <Select value={newContactType} onValueChange={setNewContactType}>
                  <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_TYPES.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addContact} className="h-8 gap-1 px-2">
                  <Plus className="h-3 w-3" />New
                </Button>
              </div>

              {contacts.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-2">
                  No contacts yet. Select type and click &quot;+ New&quot;.
                </div>
              ) : (
                <div className="space-y-1">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-[80px] truncate">{contact.type}</span>
                      <Input
                        placeholder="Value"
                        value={contact.value}
                        onChange={e => updateContact(contact.id, e.target.value)}
                        className="flex-1 h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContact(contact.id)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Result */}
            {submitResult && (
              <div className={`p-2 rounded-lg flex items-center gap-2 text-sm ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {submitResult.type === "success" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                <span>{submitResult.message}</span>
              </div>
            )}
          </form>
    </DashboardPageShell>
  );
}