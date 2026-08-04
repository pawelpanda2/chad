"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MsgWorkoutEntry, MsgWorkoutEntryInput, MsgWorkoutProposalEntry } from "./msg-workout-types";

export interface MsgWorkoutPanelProps {
  entry: MsgWorkoutEntry | MsgWorkoutProposalEntry;
  onClose: () => void;
}

type EntryTypeTab = "dash" | "ver" | "advice";

const ENTRY_TYPE_TABS: Array<{ value: EntryTypeTab; label: string }> = [
  { value: "dash", label: "dash" },
  { value: "ver", label: "ver." },
  { value: "advice", label: "advice" },
];

const ADVICE_AUTHORS = ["Kamil_S"];
const DEFAULT_ADVICE_AUTHOR = "Kamil_S";

function isProposal(entry: MsgWorkoutEntry | MsgWorkoutProposalEntry): entry is MsgWorkoutProposalEntry {
  return "confidence" in entry;
}

/**
 * Full-height replacement for the conversation view, inside the same
 * right-hand `<section>` (Story 99, spec 1.8 — "rozwija workout na pełną
 * wysokość prawego paska"). No new route/page: purely a local state swap
 * in BeeperConversationsView. Closing restores the normal conversation.
 *
 * v11: the editor itself — shared as-is between Beeper → Msg workout and
 * Msg Auto → Msg Workout (same component, no duplication). Bottom of the
 * panel picks an entry type (dash / ver. / advice) and appends it to the
 * item's body via /api/msg-workout/append-entry (dba's
 * appendMsgWorkoutEntryAndSave — see msg-workout-entry.ts for the exact
 * `//you` / `//ver` / `//advice <author>` formatting rules).
 */
export function MsgWorkoutPanel({ entry, onClose }: MsgWorkoutPanelProps) {
  const [body, setBody] = useState(entry.body);
  const [entryType, setEntryType] = useState<EntryTypeTab>("dash");
  const [dashText, setDashText] = useState("");
  const [verText, setVerText] = useState("");
  const [adviceAuthor, setAdviceAuthor] = useState(DEFAULT_ADVICE_AUTHOR);
  const [adviceText, setAdviceText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitEntry(payload: MsgWorkoutEntryInput): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch("/api/msg-workout/append-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutLoca: entry.loca, entry: payload }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Save failed (${res.status})`);
      }
      setBody(json.body ?? body);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDashSubmit() {
    const text = dashText.trim();
    if (!text || saving) return;
    if (await submitEntry({ type: "dash", text })) setDashText("");
  }

  async function handleVerSubmit() {
    if (!verText.trim() || saving) return;
    if (await submitEntry({ type: "ver", text: verText })) setVerText("");
  }

  async function handleAdviceSubmit() {
    if (!adviceText.trim() || saving) return;
    const author = adviceAuthor.trim() || DEFAULT_ADVICE_AUTHOR;
    if (await submitEntry({ type: "advice", author, text: adviceText })) setAdviceText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-1 border-b px-2 py-1.5">
        <div className="min-w-0">
          <span className="block truncate text-[11px] font-medium">{entry.name}</span>
          {isProposal(entry) && (
            <span className="block text-[10px] text-amber-600 dark:text-amber-400">
              {Math.round(entry.confidence * 100)}% proposed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close msg workout"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {body ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">{body}</pre>
        ) : (
          <p className="text-[11px] italic text-muted-foreground">No body text yet.</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t p-2">
        <div className="flex gap-1">
          {ENTRY_TYPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setEntryType(t.value)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                entryType === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {entryType === "dash" && (
          <input
            type="text"
            value={dashText}
            onChange={(e) => setDashText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleDashSubmit();
              }
            }}
            placeholder="New line under //you"
            disabled={saving}
            aria-label="New dash entry"
            className="w-full rounded-md border bg-background px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
        )}

        {entryType === "ver" && (
          <div className="flex flex-col gap-1">
            <textarea
              value={verText}
              onChange={(e) => setVerText(e.target.value)}
              placeholder="Full message version…"
              disabled={saving}
              rows={5}
              aria-label="Full version"
              className="w-full resize-none rounded-md border bg-background px-2 py-1 font-sans text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleVerSubmit()}
              disabled={saving || !verText.trim()}
              className="self-end rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        {entryType === "advice" && (
          <div className="flex flex-col gap-1">
            <input
              list="msg-workout-advice-authors"
              value={adviceAuthor}
              onChange={(e) => setAdviceAuthor(e.target.value)}
              placeholder="Author"
              disabled={saving}
              aria-label="Advice author"
              className="w-full rounded-md border bg-background px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <datalist id="msg-workout-advice-authors">
              {ADVICE_AUTHORS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <textarea
              value={adviceText}
              onChange={(e) => setAdviceText(e.target.value)}
              placeholder="Advice…"
              disabled={saving}
              rows={4}
              aria-label="Advice text"
              className="w-full resize-none rounded-md border bg-background px-2 py-1 font-sans text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleAdviceSubmit()}
              disabled={saving || !adviceText.trim()}
              className="self-end rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
