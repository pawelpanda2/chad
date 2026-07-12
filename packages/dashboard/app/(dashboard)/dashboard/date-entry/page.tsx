"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

// ============================================================================
// Field spec — mirrors the DATE ENTRY Google Sheet exactly (order + labels).
// Storage is schema-less YAML (saveDateEntry just yaml.dump()s whatever
// object it's given), so no backend change is needed for this view.
// ============================================================================

interface DateEntryFormData {
  data: string;
  zrodlo: string;
  nazwa: string;
  link: string;
  pull: boolean;
  close: string;
  jakosc: string;
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyForm(): DateEntryFormData {
  return {
    data: getTodayDate(),
    zrodlo: "",
    nazwa: "",
    link: "",
    pull: false,
    close: "NIE",
    jakosc: "",
  };
}

export default function DateEntryPage() {
  const [data, setData] = useState<DateEntryFormData>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const setField = useCallback(<K extends keyof DateEntryFormData>(key: K, value: DateEntryFormData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload = {
        "DATA": data.data,
        "ŹRÓDŁO": data.zrodlo,
        "NAZWA": data.nazwa,
        "LINK": data.link,
        "PULL": data.pull ? "TRUE" : "FALSE",
        "CLOSE": data.close,
        "JAKOŚĆ": data.jakosc,
      };
      const response = await fetch("/api/forms/date-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setStatus({ type: "success", message: `Saved as "${result.itemName}".` });
        toast.success(`DATE ENTRY saved as "${result.itemName}"!`);
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
                className="border bg-blue-100 dark:bg-blue-950/50 px-4 py-3 text-center text-lg font-bold"
              >
                DATE ENTRY
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold w-1/2">DATA</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                <Input
                  type="date"
                  value={data.data}
                  onChange={(e) => setField("data", e.target.value)}
                  className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold">ŹRÓDŁO</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                <Input
                  value={data.zrodlo}
                  onChange={(e) => setField("zrodlo", e.target.value)}
                  className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold">NAZWA</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                <Input
                  value={data.nazwa}
                  onChange={(e) => setField("nazwa", e.target.value)}
                  className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold">LINK</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                <Input
                  value={data.link}
                  onChange={(e) => setField("link", e.target.value)}
                  className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold">PULL</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={data.pull}
                  onChange={(e) => setField("pull", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-400"
                />
              </td>
            </tr>
            <tr>
              <td className="border bg-muted/60 px-3 py-2 font-semibold">CLOSE</td>
              <td className="border bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                <select
                  value={data.close}
                  onChange={(e) => setField("close", e.target.value)}
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
                  value={data.jakosc}
                  onChange={(e) => setField("jakosc", e.target.value)}
                  className="h-8 border-0 bg-transparent shadow-none text-right focus-visible:ring-1"
                  placeholder="e.g. 8,0"
                />
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="border-0 h-2" />
            </tr>
            <tr>
              <td colSpan={2} className="border bg-blue-200 dark:bg-blue-900/60 p-0">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-none h-11 text-base font-semibold bg-transparent text-foreground hover:bg-blue-300/60 dark:hover:bg-blue-900 shadow-none"
                  variant="ghost"
                >
                  {isSubmitting ? "Saving..." : "SAVE DATE"}
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
                  <span className="text-muted-foreground">Uzupełnij formularz i zaznacz SAVE DATE.</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
}
