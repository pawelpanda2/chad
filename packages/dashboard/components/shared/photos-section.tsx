"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

interface PhotoRow {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; photos: PhotoRow[] };

const ACCEPTED_MIME = "image/jpeg,image/png,image/webp";

/**
 * Generic "Photos" frame: thumbnails + Add photo + larger preview + delete
 * confirm, backed by any `GET/POST {basePath}?{subjectParam}=...` +
 * `GET/DELETE {basePath}/{id}` endpoint pair (id-based reads, session-scoped
 * ownership, magic-byte-validated JPEG/PNG/WebP — all enforced server-side,
 * see `packages/dba/src/google-contact-photos.ts` / `lead-photos.ts`). Two
 * independent attachment points (Google Contacts, Lead Details) reuse this
 * one component instead of duplicating the upload/preview/delete flow.
 */
export function PhotosSection({
  basePath,
  subjectParam,
  subjectValue,
  onCountChange,
  deleteHint,
  headingClassName,
}: {
  basePath: string;
  subjectParam: string;
  subjectValue: string;
  onCountChange?: (subjectValue: string, count: number) => void;
  /** Extra sentence in the delete-confirm dialog, e.g. "This never changes anything in Google Contacts." */
  deleteHint?: string;
  /** Override the "Photos" title's className to match the surrounding page (default: small uppercase label, as used inline in a detail panel). */
  headingClassName?: string;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${basePath}?${subjectParam}=${encodeURIComponent(subjectValue)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setState({ kind: "error", message: json.error || "Failed to load photos" });
        return;
      }
      const photos: PhotoRow[] = Array.isArray(json.photos) ? json.photos : [];
      setState({ kind: "ready", photos });
      onCountChange?.(subjectValue, photos.length);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, subjectParam, subjectValue]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set(subjectParam, subjectValue);
      for (const file of Array.from(fileList)) {
        form.append("photos", file);
      }
      const res = await fetch(basePath, { method: "POST", body: form });
      const json = await res.json();
      const results: Array<{ success: boolean; error?: string; originalFileName?: string }> = Array.isArray(
        json.results,
      )
        ? json.results
        : [];
      const failed = results.filter((r) => !r.success);
      if (!res.ok && failed.length === results.length) {
        setUploadError(failed[0]?.error || "Upload failed");
      } else if (failed.length > 0) {
        setUploadError(`${failed.length} of ${results.length} photo(s) failed: ${failed[0]?.error ?? ""}`);
      }
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${basePath}/${encodeURIComponent(confirmDelete.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setDeleteError(json.error || "Failed to delete photo");
        return;
      }
      setConfirmDelete(null);
      if (previewPhoto?.id === confirmDelete.id) setPreviewPhoto(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const photoUrl = (id: string) => `${basePath}/${encodeURIComponent(id)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className={headingClassName ?? "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"}>
          Photos{state.kind === "ready" && state.photos.length > 0 ? ` (${state.photos.length})` : ""}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          Add photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME}
          multiple
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
      </div>

      {uploadError && <div className="text-xs text-red-500">{uploadError}</div>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading photos…
        </div>
      )}

      {state.kind === "error" && <div className="text-xs text-red-500">{state.message}</div>}

      {state.kind === "ready" && state.photos.length === 0 && (
        <div className="text-xs text-muted-foreground">No photos yet.</div>
      )}

      {state.kind === "ready" && state.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreviewPhoto(p)}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted"
              title={p.originalFileName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.id)} alt={p.originalFileName} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Larger preview */}
      <Dialog open={!!previewPhoto} onOpenChange={(open) => !open && setPreviewPhoto(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="truncate">{previewPhoto?.originalFileName}</span>
            </DialogTitle>
          </DialogHeader>
          {previewPhoto && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(previewPhoto.id)}
                alt={previewPhoto.originalFileName}
                className="max-h-[60vh] w-full rounded-md object-contain bg-muted"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {(previewPhoto.sizeBytes / 1024).toFixed(0)} KB
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-red-500 hover:text-red-500"
                  onClick={() => setConfirmDelete(previewPhoto)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.originalFileName} will be permanently removed.{deleteHint ? ` ${deleteHint}` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <div className="text-xs text-red-500">{deleteError}</div>}
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={deleting} onClick={() => setConfirmDelete(null)}>
              No
            </Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={() => void handleConfirmDelete()}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PhotoCountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground",
      )}
    >
      <ImagePlus className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}
