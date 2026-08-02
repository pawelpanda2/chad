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

/** Same retype-confirm pattern as Folders / Daily Entry / AI Prompts delete. */
export const BEEPER_GROUP_DELETE_WORDS = ["DELETE", "CONFIRM", "USUN", "PERMANENT"];

interface BeeperGroupDeleteDialogProps {
  open: boolean;
  groupName?: string;
  deleting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function BeeperGroupDeleteDialog({
  open,
  groupName,
  deleting = false,
  error = null,
  onOpenChange,
  onConfirm,
}: BeeperGroupDeleteDialogProps) {
  const [word, setWord] = useState("");
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setWord(BEEPER_GROUP_DELETE_WORDS[Math.floor(Math.random() * BEEPER_GROUP_DELETE_WORDS.length)]);
    setInput("");
  }, [open]);

  const matches = input.trim() === word;

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete group</DialogTitle>
          <DialogDescription>
            {groupName ? (
              <>
                Permanently removes <strong>{groupName}</strong>. Contacts in it fall back to no
                group. Type <span className="font-mono font-bold">{word}</span> to confirm.
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
