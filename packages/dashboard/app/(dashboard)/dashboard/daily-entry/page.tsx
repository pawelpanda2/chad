"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

// ============================================================================
// Field spec — mirrors the DAILY ENTRY Google Sheet exactly (order + labels).
// Storage is schema-less YAML (saveDailyEntry just yaml.dump()s whatever
// object it's given), so every key here maps straight to a YAML field with
// no backend change required.
// ============================================================================

interface DailyEntryFormData {
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

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyForm(): DailyEntryFormData {
  return {
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
  };
}

// Row spec: [label, form key, input type]
const ROWS: Array<{ label: string; key: keyof DailyEntryFormData; type: "date" | "text" | "yesno" }> = [
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

export default function DailyEntryPage() {
  const [data, setData] = useState<DailyEntryFormData>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const setField = useCallback((key: keyof DailyEntryFormData, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload = {
        "DATE": data.date,
        "STATE": data.state,
        "TRAINING TIME": data.trainingTime,
        "VERBAL EXERCISES": data.verbalExercises,
        "INFIELD": data.infield,
        "THEORY": data.theory,
        "FIELD REVIEW": data.fieldReview,
        "ACTION TIME": data.actionTime,
        "OUTINGS": data.outings,
        "APPROACHES": data.approaches,
        "LONG INTERACTIONS": data.longInteractions,
        "NUMBERS": data.numbers,
        "FIRST MESSAGES": data.firstMessages,
        "RESPONSES": data.responses,
        "DATES SET UP": data.datesSetUp,
        "DATES": data.dates,
      };
      const response = await fetch("/api/forms/daily-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setStatus({ type: "success", message: `Saved as "${result.itemName}".` });
        toast.success(`DAILY ENTRY saved as "${result.itemName}"!`);
        setData(emptyForm());
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus({ type: "error", message });
      toast.error(`Error: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={handleSubmit}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                colSpan={2}
                className="border bg-green-100 dark:bg-green-950/50 px-4 py-3 text-center text-lg font-bold"
              >
                DAILY ENTRY
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="border bg-muted/60 px-3 py-2 font-semibold w-1/2">
                  {row.label}
                </td>
                <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                  {row.type === "date" && (
                    <Input
                      type="date"
                      value={data[row.key]}
                      onChange={(e) => setField(row.key, e.target.value)}
                      className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                    />
                  )}
                  {row.type === "yesno" && (
                    <select
                      value={data[row.key]}
                      onChange={(e) => setField(row.key, e.target.value)}
                      className="h-8 w-full rounded-md border-0 bg-transparent px-1 text-sm outline-none"
                    >
                      <option value="NIE">NIE</option>
                      <option value="TAK">TAK</option>
                    </select>
                  )}
                  {row.type === "text" && (
                    <Input
                      value={data[row.key]}
                      onChange={(e) => setField(row.key, e.target.value)}
                      className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                    />
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="border-0 h-2" />
            </tr>
            <tr>
              <td colSpan={2} className="border bg-green-200 dark:bg-green-900/60 p-0">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-none h-11 text-base font-semibold bg-transparent text-foreground hover:bg-green-300/60 dark:hover:bg-green-900 shadow-none"
                  variant="ghost"
                >
                  {isSubmitting ? "Saving..." : "SAVE DAY"}
                </Button>
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold align-top">STATUS</td>
              <td className="border px-3 py-2 text-sm">
                {status ? (
                  <span
                    className={`flex items-center gap-2 ${
                      status.type === "success" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {status.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    {status.message}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Fill in the form and click SAVE DAY.</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
}
