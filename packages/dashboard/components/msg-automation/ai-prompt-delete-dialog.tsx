"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Same retype-confirm pattern as Folders / Daily Entry. */
export const AI_PROMPT_DELETE_WORDS = ["DELETE", "CONFIRM", "CLEAR", "WYCZYSC", "USUN", "PERMANENT"];

interface AiPromptDeleteDialogProps {
  open: boolean;
  promptName?: string;
  deleting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function AiPromptDeleteDialog({
  open,
  promptName,
  deleting = false,
  error = null,
  onOpenChange,
  onConfirm,
}: AiPromptDeleteDialogProps) {
  const [word, setWord] = useState("");
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setWord(AI_PROMPT_DELETE_WORDS[Math.floor(Math.random() * AI_PROMPT_DELETE_WORDS.length)]);
    setInput("");
  }, [open]);

  const matches = input.trim() === word;

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete prompt</DialogTitle>
          <DialogDescription>
            {promptName ? (
              <>
                Permanently removes <strong>{promptName}</strong>. Type{" "}
                <span className="font-mono font-bold">{word}</span> to confirm.
              </>
            ) : (
              <>
                Type <span className="font-mono font-bold">{word}</span> to confirm.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={word}
          autoFocus
          autoComplete="off"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void onConfirm()} disabled={deleting || !matches}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
