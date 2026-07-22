"use client";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, FRAME_SECTION_SPACE_Y_CLASS, SAVE_FRAME_PADDING_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { VoiceRecordingPanel } from "@/components/shared/voice-recording-panel";
import { ErrorBox } from "@/components/shared/error-box";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, X, CheckCircle2, AlertCircle } from "lucide-react";

// ============================================================================
// Constants & Mappings
// ============================================================================

const MIN_SAVE_INDICATOR_MS = 450;

// Both Daily Entry and Date Entry now have a real, permanent Mongo delete
// (deleteDailyEntry/deleteDateEntry in packages/dba — the Content
// Provider's own Delete is still a confirmed empty stub, but that backend
// is no longer in the delete path for either form, see each function's own
// doc comment). One of these words is picked at random each time the
// confirmation dialog opens, so the user must actually read and retype it
// rather than muscle-memory a fixed word (Story 62 Round 8).
const CLEAR_CONFIRM_WORDS = ["DELETE", "CONFIRM", "CLEAR", "WYCZYSC", "USUN", "PERMANENT"];

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

  // ADD DAILY ENTRY doubles as an editor for an existing entry when
  // reached with ?editLoca=<loca> (Story 62 Round 8 — DAILY TRACKER's
  // "Open Raw" row click navigates here instead of opening a modal).
  const editLoca = searchParams.get("editLoca");
  const [editEntryStatus, setEditEntryStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

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

  // When reached via ?editLoca=..., fetch that entry's real saved fields
  // and prefill the form instead of the blank-today defaults above — the
  // same raw field keys the PATCH/POST payload already uses, so no
  // reshaping needed beyond the label/key mapping `dailyRows` also uses.
  useEffect(() => {
    if (!editLoca || selectedForm !== "add_action") {
      return;
    }
    let cancelled = false;
    setEditEntryStatus("loading");
    fetch("/api/forms/daily-entry")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const entry = (data.entries || []).find((e: { loca?: string }) => e.loca === editLoca);
        if (!entry) {
          setEditEntryStatus("error");
          return;
        }
        const f: Record<string, unknown> = entry.fields || {};
        const asStr = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));
        setAddActionData({
          date: asStr(f["DATE"], getTodayDate()),
          state: asStr(f["STATE"]),
          trainingTime: asStr(f["TRAINING TIME"]),
          verbalExercises: asStr(f["VERBAL EXERCISES"], "NIE"),
          infield: asStr(f["INFIELD"], "NIE"),
          theory: asStr(f["THEORY"], "NIE"),
          fieldReview: asStr(f["FIELD REVIEW"], "NIE"),
          actionTime: asStr(f["ACTION TIME"]),
          outings: asStr(f["OUTINGS"]),
          approaches: asStr(f["APPROACHES"]),
          longInteractions: asStr(f["LONG INTERACTIONS"]),
          numbers: asStr(f["NUMBERS"]),
          firstMessages: asStr(f["FIRST MESSAGES"]),
          responses: asStr(f["RESPONSES"]),
          datesSetUp: asStr(f["DATES SET UP"]),
          dates: asStr(f["DATES"]),
        });
        setEditEntryStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setEditEntryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editLoca, selectedForm]);

  // Same prefill pattern as above, for ADD DATE's edit mode.
  useEffect(() => {
    if (!editLoca || selectedForm !== "date_entry") {
      return;
    }
    let cancelled = false;
    setEditEntryStatus("loading");
    fetch("/api/forms/date-entry")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const entry = (data.entries || []).find((e: { loca?: string }) => e.loca === editLoca);
        if (!entry) {
          setEditEntryStatus("error");
          return;
        }
        const f: Record<string, unknown> = entry.fields || {};
        const asStr = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));
        setDateEntryData({
          data: asStr(f["DATA"], getTodayDate()),
          zrodlo: asStr(f["ŹRÓDŁO"]),
          nazwa: asStr(f["NAZWA"]),
          link: asStr(f["LINK"]),
          pull: asStr(f["PULL"], "FALSE"),
          close: asStr(f["CLOSE"], "NIE"),
          jakosc: asStr(f["JAKOŚĆ"]),
        });
        setEditEntryStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setEditEntryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editLoca, selectedForm]);

  // "Clear" confirmation dialog (edit mode only) — see CLEAR_CONFIRM_WORDS.
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmWord, setClearConfirmWord] = useState("");
  const [clearConfirmInput, setClearConfirmInput] = useState("");
  const [clearing, setClearing] = useState(false);

  const openClearDialog = useCallback(() => {
    setClearConfirmWord(CLEAR_CONFIRM_WORDS[Math.floor(Math.random() * CLEAR_CONFIRM_WORDS.length)]);
    setClearConfirmInput("");
    setClearDialogOpen(true);
  }, []);

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

  // Real deletion for both Daily Entries (DELETE /api/forms/daily-entry)
  // and Date Entries (DELETE /api/forms/date-entry, Story 78 — before this,
  // Dates had no real delete and this button only PATCH-blanked the
  // entry's fields, leaving an empty row behind; see deleteDateEntry's own
  // doc comment in packages/dba). One of CLEAR_CONFIRM_WORDS is picked at
  // random each time the confirmation dialog opens, so the user must
  // actually read and retype it rather than muscle-memory a fixed word
  // (Story 62 Round 8).
  const handleClearEntry = useCallback(async () => {
    if (!editLoca || clearConfirmInput.trim() !== clearConfirmWord) return;
    setClearing(true);
    try {
      const isDateForm = selectedForm === "date_entry";
      const endpoint = isDateForm ? "/api/forms/date-entry" : "/api/forms/daily-entry";
      const response = await fetch(`${endpoint}?loca=${encodeURIComponent(editLoca)}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Unknown error");
      toast.success("Entry deleted");
      setClearDialogOpen(false);
      router.push(isDateForm ? "/dashboard/views?view=dates" : "/dashboard/views?view=tracker");
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setClearing(false);
    }
  }, [editLoca, clearConfirmInput, clearConfirmWord, selectedForm, router]);

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
    const startedAt = Date.now();
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
        method: editLoca ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editLoca ? { loca: editLoca, fields: payload } : payload),
      });
      const result = await response.json();
      if (result.success) {
        // Minimum visible "Saving..." duration so a very fast round trip
        // still reads as a smooth transition instead of an instant flash.
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SAVE_INDICATOR_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SAVE_INDICATOR_MS - elapsed));
        }
        const successMessage = editLoca ? "Saved changes!" : `Saved as "${result.itemName}"!`;
        setSubmitResult({ type: "success", message: successMessage });
        toast.success(editLoca ? "Daily entry updated!" : `Daily entry saved as "${result.itemName}"!`);
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
    const startedAt = Date.now();
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
        method: editLoca ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editLoca ? { loca: editLoca, fields: payload } : payload),
      });
      const result = await response.json();
      if (result.success) {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SAVE_INDICATOR_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SAVE_INDICATOR_MS - elapsed));
        }
        const successMessage = editLoca ? "Saved changes!" : `Saved as "${result.itemName}"!`;
        setSubmitResult({ type: "success", message: successMessage });
        toast.success(editLoca ? "Date entry updated!" : `Date entry saved as "${result.itemName}"!`);
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
      <DashboardPageShell title="Forms">
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
        contentClassName={FRAME_SECTION_GAP_CLASS}
        upLevel={{ onClick: handleFormBack }}
        title="Add Report"
      >
        <ErrorBox message={reportError} className="shrink-0" />

        {/* Inner frame: Create (or its locked Generated name placeholder)
            first, then Generated name — both left-aligned, top of the
            frame (Story 62 standard: save/create controls at the top,
            grouped with the generated name). */}
        <div className={cn("shrink-0 rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
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
        contentClassName={FRAME_SECTION_GAP_CLASS}
        upLevel={{ onClick: handleFormBack }}
        title="Add Action"
      >
            <form onSubmit={handleActionSubmit} className={FRAME_SECTION_SPACE_Y_CLASS}>
              {/* Top frame: Save + generated name, left-aligned (Story 62
                  standard — save controls live at the top, grouped with the
                  generated name when one exists). Inner frames left-anchor
                  to a 500px default width rather than stretching full-width. */}
              <div className={cn("flex max-w-[500px] flex-wrap items-center gap-3 rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
                <Input value={actionData.actionTitle} readOnly className="bg-muted font-mono w-[200px]" />
              </div>

              {/* Second frame: the rest of the fields. */}
              <div className="max-w-[500px] space-y-3 rounded-lg border bg-muted/10 p-4">
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

    const isEditingEntry = !!editLoca;
    const entryStillLoading = isEditingEntry && editEntryStatus === "loading";
    const entryLoadFailed = isEditingEntry && editEntryStatus === "error";

    return (
      <DashboardPageShell
        contentClassName={FRAME_SECTION_GAP_CLASS}
        upLevel={{ onClick: isEditingEntry ? () => router.push("/dashboard/views?view=tracker") : handleFormBack }}
        title={isEditingEntry ? "Edit Daily Entry" : "Add Daily Entry"}
      >
            {entryLoadFailed && (
              <ErrorBox message="Could not load this entry — it may have been changed or removed. Go back and try again." />
            )}
            <form onSubmit={handleAddActionSubmit} className={FRAME_SECTION_SPACE_Y_CLASS}>
              {/* Save lives in its own top frame — Story 62 standard: save
                  controls always live at the top, inside the main frame,
                  even when there's no generated-name field to group it with.
                  Delete (edit mode only) lives here too — real deletion via
                  the Mongo backend (Story 72 follow-up), unlike the old
                  Content-Provider-only "blank the fields" workaround Date
                  Entries below still use. */}
              <div className={cn("flex flex-wrap items-center gap-3 max-w-[460px] rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
                <Button type="submit" disabled={isSubmitting || entryStillLoading}>
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
                {isEditingEntry && (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={entryStillLoading}
                      onClick={openClearDialog}
                      title="Permanently deletes this Daily Entry"
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/dashboard/views?view=tracker")}
                    >
                      Full View
                    </Button>
                  </>
                )}
                {entryStillLoading && (
                  <span className="text-sm text-muted-foreground">Loading entry...</span>
                )}
                {submitResult && (
                  <span className={`flex items-center gap-1 text-sm ${submitResult.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {submitResult.type === "success" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                    {submitResult.message}
                  </span>
                )}
              </div>

              {/* Inner frame holds the form itself — no duplicate title row
                  inside (the shell's own `title` above is the only title).
                  Narrowed to ~80% of the previous max-width per feedback. */}
              <div className="max-w-[460px] rounded-lg border bg-muted/10 p-2">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {dailyRows.map((row) => (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap border bg-muted/60 px-3 py-2 font-semibold">{row.label}</td>
                        <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                          {row.type === "date" && (
                            <Input
                              type="date"
                              value={addActionData[row.key]}
                              onChange={(e) => setAddActionData({ ...addActionData, [row.key]: e.target.value })}
                              disabled={entryStillLoading}
                              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                            />
                          )}
                          {row.type === "yesno" && (
                            <select
                              value={addActionData[row.key]}
                              onChange={(e) => setAddActionData({ ...addActionData, [row.key]: e.target.value })}
                              disabled={entryStillLoading}
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
                              disabled={entryStillLoading}
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

            {/* Delete confirmation — retype a randomly-picked word so this
                can't be triggered by muscle memory (Story 62 Round 8). Real
                deletion via the Mongo backend — the row is actually removed,
                not blanked. */}
            <Dialog open={clearDialogOpen} onOpenChange={(open) => !clearing && setClearDialogOpen(open)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this entry?</DialogTitle>
                  <DialogDescription>
                    This permanently removes this Daily Entry. This can&apos;t be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-sm">
                    Type <span className="font-mono font-bold">{clearConfirmWord}</span> to confirm.
                  </p>
                  <Input
                    value={clearConfirmInput}
                    onChange={(e) => setClearConfirmInput(e.target.value)}
                    placeholder={clearConfirmWord}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleClearEntry}
                    disabled={clearing || clearConfirmInput.trim() !== clearConfirmWord}
                  >
                    {clearing ? "Deleting..." : "Delete entry"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Date Entry Form
  // ============================================================================

  if (selectedForm === "date_entry") {
    const isEditingDateEntry = !!editLoca;
    const dateEntryStillLoading = isEditingDateEntry && editEntryStatus === "loading";
    const dateEntryLoadFailed = isEditingDateEntry && editEntryStatus === "error";

    return (
      <DashboardPageShell
        contentClassName={FRAME_SECTION_GAP_CLASS}
        upLevel={{ onClick: isEditingDateEntry ? () => router.push("/dashboard/views?view=dates") : handleFormBack }}
        title={isEditingDateEntry ? "Edit Date" : "Add Date"}
      >
            {dateEntryLoadFailed && (
              <ErrorBox message="Could not load this entry — it may have been changed or removed. Go back and try again." />
            )}
            <form onSubmit={handleDateEntrySubmit} className={FRAME_SECTION_SPACE_Y_CLASS}>
              <div className={cn("flex flex-wrap items-center gap-3 max-w-[460px] rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
                <Button type="submit" disabled={isSubmitting || dateEntryStillLoading}>
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
                {isEditingDateEntry && (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={dateEntryStillLoading}
                      onClick={openClearDialog}
                      title="Permanently deletes this Date Entry"
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/dashboard/views?view=dates")}
                    >
                      Full View
                    </Button>
                  </>
                )}
                {dateEntryStillLoading && (
                  <span className="text-sm text-muted-foreground">Loading entry...</span>
                )}
                {submitResult && (
                  <span className={`flex items-center gap-1 text-sm ${submitResult.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {submitResult.type === "success" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                    {submitResult.message}
                  </span>
                )}
              </div>
              <div className="max-w-xl rounded-lg border bg-muted/10 p-2">
              <table className="w-full border-collapse text-sm">
                <tbody>
                <tr>
                  <td className="whitespace-nowrap border bg-muted/60 px-3 py-2 font-semibold">DATA</td>
                  <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                    <Input
                      type="date"
                      value={dateEntryData.data}
                      onChange={e => setDateEntryData({ ...dateEntryData, data: e.target.value })}
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
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
                      disabled={dateEntryStillLoading}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                      placeholder="e.g. 8,0"
                    />
                  </td>
                </tr>
                </tbody>
              </table>
              </div>
            </form>

            {/* Delete confirmation — same shared flow as ADD DAILY ENTRY's
                edit mode (Story 62 Round 8; real delete since Story 78). */}
            <Dialog open={clearDialogOpen} onOpenChange={(open) => !clearing && setClearDialogOpen(open)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this entry?</DialogTitle>
                  <DialogDescription>
                    This permanently removes this Date Entry. This can&apos;t be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-sm">
                    Type <span className="font-mono font-bold">{clearConfirmWord}</span> to confirm.
                  </p>
                  <Input
                    value={clearConfirmInput}
                    onChange={(e) => setClearConfirmInput(e.target.value)}
                    placeholder={clearConfirmWord}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleClearEntry}
                    disabled={clearing || clearConfirmInput.trim() !== clearConfirmWord}
                  >
                    {clearing ? "Deleting..." : "Delete entry"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Lead Form
  // ============================================================================

  return (
    <DashboardPageShell
      contentClassName={FRAME_SECTION_GAP_CLASS}
      upLevel={{ onClick: handleFormBack }}
      title="Add Lead"
    >
          <form onSubmit={handleLeadSubmit} className={FRAME_SECTION_SPACE_Y_CLASS}>

            {/* Top frame: Save + generated name, left-aligned (Story 62
                standard). Generated name shown as a greyed, locked input,
                same as ADD ACTION's Title field — not a plain span. */}
            <div className={cn("flex max-w-[500px] flex-wrap items-end gap-3 rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
              <Button type="submit" disabled={isSubmitting || !isLeadFormValid}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={leadNamePreview} readOnly className="bg-muted font-mono w-[260px]" />
              </div>
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