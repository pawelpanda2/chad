"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, CheckCircle2, AlertCircle } from "lucide-react";

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

type FormType = null | "action" | "lead" | "add_action" | "date_entry";

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

// ============================================================================
// Main Component
// ============================================================================

export default function FormsPage() {
  const [selectedForm, setSelectedForm] = useState<FormType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
    verbalExercises: "",
    infield: "",
    theory: "",
    fieldReview: "",
    actionTime: "",
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
      verbalExercises: "",
      infield: "",
      theory: "",
      fieldReview: "",
      actionTime: "",
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

  const handleFormSelect = (form: FormType) => {
    setSelectedForm(form);
    if (form === "action") resetActionForm();
    else if (form === "lead") resetLeadForm();
    else if (form === "add_action") resetAddActionForm();
    else if (form === "date_entry") resetDateEntryForm();
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
        setTimeout(() => { setSubmitResult(null); setSelectedForm(null); resetActionForm(); }, 3000);
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
      setTimeout(() => { setSubmitResult(null); setSelectedForm(null); resetLeadForm(); }, 3000);
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
          message: `DAILY ENTRY saved as "${result.itemName}"! Path: ${result.path || 'actions/daily'}` 
        });
        toast.success(`DAILY ENTRY saved as "${result.itemName}"!`);
        setTimeout(() => { setSubmitResult(null); setSelectedForm(null); resetAddActionForm(); }, 3000);
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
          message: `DATE ENTRY saved as "${result.itemName}"! Path: ${result.path || 'actions/dates'}` 
        });
        toast.success(`DATE ENTRY saved as "${result.itemName}"!`);
        setTimeout(() => { setSubmitResult(null); setSelectedForm(null); resetDateEntryForm(); }, 3000);
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

  // ============================================================================
  // Render: Form List View
  // ============================================================================

  if (!selectedForm) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Forms</h2>
          <p className="text-sm text-muted-foreground">Select a form to fill out</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleFormSelect("lead")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">Add Lead</span>
            <span className="text-xs text-muted-foreground mt-1">New contact</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("action")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">Actions</span>
            <span className="text-xs text-muted-foreground mt-1">Log session</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("add_action")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">DAILY ENTRY</span>
            <span className="text-xs text-muted-foreground mt-1">Daily log</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormSelect("date_entry")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[70px]"
          >
            <span className="font-semibold text-sm">DATE ENTRY</span>
            <span className="text-xs text-muted-foreground mt-1">Date log</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Action Form
  // ============================================================================

  if (selectedForm === "action") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedForm(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Action</h2>
            <span className="text-sm text-muted-foreground">Log your session</span>
          </div>
        </div>
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleActionSubmit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[auto_auto_1fr_auto] items-end">
                <div className="space-y-1">
                  <Label>Title (auto-generated)</Label>
                  <Input value={actionData.actionTitle} readOnly className="bg-muted font-mono w-[200px]" />
                </div>
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
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save to Content Provider"}
              </Button>
            </form>
          </CardContent>
        </Card>
        {submitResult && (
          <div className={`p-3 rounded-lg flex items-center gap-2 ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="text-sm">{submitResult.message}</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Render: Daily Entry Form (formerly ADD ACTION)
  // ============================================================================

  if (selectedForm === "add_action") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelectedForm(null)} className="gap-1 h-7 px-2">
            <ArrowLeft className="h-3 w-3" />Back
          </Button>
          <h2 className="text-lg font-bold">DAILY ENTRY</h2>
        </div>
        <Card>
          <CardContent className="p-2">
            <form onSubmit={handleAddActionSubmit} className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">DATE</Label>
                  <Input
                    type="date"
                    value={addActionData.date}
                    onChange={e => setAddActionData({ ...addActionData, date: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">STATE</Label>
                  <Input
                    value={addActionData.state}
                    onChange={e => setAddActionData({ ...addActionData, state: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">TRAINING TIME</Label>
                  <Input
                    value={addActionData.trainingTime}
                    onChange={e => setAddActionData({ ...addActionData, trainingTime: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">VERBAL EXERCISES</Label>
                  <Input
                    value={addActionData.verbalExercises}
                    onChange={e => setAddActionData({ ...addActionData, verbalExercises: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">INFIELD</Label>
                  <Input
                    value={addActionData.infield}
                    onChange={e => setAddActionData({ ...addActionData, infield: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">THEORY</Label>
                  <Input
                    value={addActionData.theory}
                    onChange={e => setAddActionData({ ...addActionData, theory: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">FIELD REVIEW</Label>
                  <Input
                    value={addActionData.fieldReview}
                    onChange={e => setAddActionData({ ...addActionData, fieldReview: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">ACTION TIME</Label>
                  <Input
                    value={addActionData.actionTime}
                    onChange={e => setAddActionData({ ...addActionData, actionTime: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">APPROACHES</Label>
                  <Input
                    value={addActionData.approaches}
                    onChange={e => setAddActionData({ ...addActionData, approaches: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">LONG INTERACTIONS</Label>
                  <Input
                    value={addActionData.longInteractions}
                    onChange={e => setAddActionData({ ...addActionData, longInteractions: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">NUMBERS</Label>
                  <Input
                    value={addActionData.numbers}
                    onChange={e => setAddActionData({ ...addActionData, numbers: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">FIRST MESSAGES</Label>
                  <Input
                    value={addActionData.firstMessages}
                    onChange={e => setAddActionData({ ...addActionData, firstMessages: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">RESPONSES</Label>
                  <Input
                    value={addActionData.responses}
                    onChange={e => setAddActionData({ ...addActionData, responses: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">DATES SET UP</Label>
                  <Input
                    value={addActionData.datesSetUp}
                    onChange={e => setAddActionData({ ...addActionData, datesSetUp: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">DATES</Label>
                  <Input
                    value={addActionData.dates}
                    onChange={e => setAddActionData({ ...addActionData, dates: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-7 text-xs" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>
        {submitResult && (
          <div className={`p-2 rounded-lg flex items-center gap-2 text-xs ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> : <AlertCircle className="h-3 w-3 flex-shrink-0" />}
            <span>{submitResult.message}</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Render: Date Entry Form
  // ============================================================================

  if (selectedForm === "date_entry") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelectedForm(null)} className="gap-1 h-7 px-2">
            <ArrowLeft className="h-3 w-3" />Back
          </Button>
          <h2 className="text-lg font-bold">DATE ENTRY</h2>
        </div>
        <Card>
          <CardContent className="p-2">
            <form onSubmit={handleDateEntrySubmit} className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">DATA</Label>
                  <Input
                    type="date"
                    value={dateEntryData.data}
                    onChange={e => setDateEntryData({ ...dateEntryData, data: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">ŹRÓDŁO</Label>
                  <Input
                    value={dateEntryData.zrodlo}
                    onChange={e => setDateEntryData({ ...dateEntryData, zrodlo: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">NAZWA</Label>
                  <Input
                    value={dateEntryData.nazwa}
                    onChange={e => setDateEntryData({ ...dateEntryData, nazwa: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">LINK</Label>
                  <Input
                    value={dateEntryData.link}
                    onChange={e => setDateEntryData({ ...dateEntryData, link: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">PULL</Label>
                  <Select value={dateEntryData.pull} onValueChange={v => setDateEntryData({ ...dateEntryData, pull: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FALSE">FALSE</SelectItem>
                      <SelectItem value="TRUE">TRUE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">CLOSE</Label>
                  <Select value={dateEntryData.close} onValueChange={v => setDateEntryData({ ...dateEntryData, close: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NIE">NIE</SelectItem>
                      <SelectItem value="TAK">TAK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">JAKOŚĆ</Label>
                  <Input
                    value={dateEntryData.jakosc}
                    onChange={e => setDateEntryData({ ...dateEntryData, jakosc: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-7 text-xs" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>
        {submitResult && (
          <div className={`p-2 rounded-lg flex items-center gap-2 text-xs ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {submitResult.type === "success" ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> : <AlertCircle className="h-3 w-3 flex-shrink-0" />}
            <span>{submitResult.message}</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Render: Lead Form
  // ============================================================================

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedForm(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Back
        </Button>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Add Lead</h2>
          <span className="text-sm text-muted-foreground">Fill out and save to Content Provider</span>
        </div>
      </div>

      <Card className="m-0">
        <CardContent className="p-3 space-y-3">
          <form onSubmit={handleLeadSubmit} className="space-y-3">

            {/* Lead Name/Id Section */}
            <div className="border-2 border-primary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-primary">Lead Name/Id</h3>
                {leadNamePreview && (
                  <span className="font-mono text-sm text-primary font-semibold">{leadNamePreview}</span>
                )}
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

            {/* Submit Button */}
            <Button type="submit" className="w-full h-9" disabled={isSubmitting || !isLeadFormValid}>
              {isSubmitting ? "Saving..." : "Save to Content Provider"}
            </Button>

            {/* Submit Result */}
            {submitResult && (
              <div className={`p-2 rounded-lg flex items-center gap-2 text-sm ${submitResult.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {submitResult.type === "success" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                <span>{submitResult.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}