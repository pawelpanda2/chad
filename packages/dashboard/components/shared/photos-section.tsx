"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImagePlus, Images, Loader2, Trash2 } from "lucide-react";

interface PhotoRow {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; photos: PhotoRow[] };

const ACCEPTED_MIME = "image/jpeg,image/png,image/webp";

export interface PhotosSectionHandle {
  /** Opens the file picker — used by a host page's own "+ Add" button (e.g. the gallery pages, styled like Daily Tracker's) instead of an internal button. */
  openFilePicker: () => void;
}

/**
 * Generic "Photos" frame: thumbnails + larger preview + delete confirm,
 * backed by any `GET/POST {basePath}?{subjectParam}=...` + `GET/DELETE
 * {basePath}/{id}` endpoint pair (id-based reads, session-scoped
 * ownership, magic-byte-validated JPEG/PNG/WebP — all enforced server-side,
 * see `packages/dba/src/google-contact-photos.ts` / `lead-photos.ts`). Two
 * independent attachment points (Google Contacts, Lead Details) reuse this
 * one component instead of duplicating the upload/preview/delete flow.
 *
 * Errors (list/upload/delete) are reported to the host page via `onError`
 * rather than rendered inline, so every page can show them the same way
 * the rest of the app does — one red `ErrorBox` at the top of the page.
 * If no `onError` is passed, errors fall back to rendering inline here.
 *
 * No internal element is ever right-aligned (`justify-between`/`ml-auto`)
 * — see the hard rule in `ai-docs/gui-standard/ai-start.md`. The upload
 * trigger itself is not rendered inside the compact (inline detail-panel)
 * usage at all — only the `Gallery` link is. The gallery pages render
 * their own top-of-page "+ Add" button (Daily Tracker style) and drive
 * this component's file picker via `ref.openFilePicker()`.
 */
export const PhotosSection = forwardRef<
  PhotosSectionHandle,
  {
    basePath: string;
    subjectParam: string;
    subjectValue: string;
    onCountChange?: (subjectValue: string, count: number) => void;
    /** Reports the current error (or null when cleared) to the host page instead of rendering it inline. */
    onError?: (message: string | null) => void;
    /** Extra sentence in the delete-confirm dialog, e.g. "This never changes anything in Google Contacts." */
    deleteHint?: string;
    /** Override the "Photos" title's className to match the surrounding page (default: small uppercase label, as used inline in a detail panel). */
    headingClassName?: string;
    /** When set, shows a "Gallery" button that navigates here (a full-page, larger-thumbnail view of the same photos). */
    galleryHref?: string;
    /** `"compact"` (default) — small flex-wrap thumbnails, used inline in a detail panel. `"gallery"` — large 3-column grid with empty placeholder cells, used on the dedicated gallery pages. */
    variant?: "compact" | "gallery";
  }
>(function PhotosSection(
  { basePath, subjectParam, subjectValue, onCountChange, onError, deleteHint, headingClassName, galleryHref, variant = "compact" },
  ref,
) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openFilePicker: () => fileInputRef.current?.click(),
  }));

  const activeError = uploadError ?? deleteError ?? (state.kind === "error" ? state.message : null);

  useEffect(() => {
    onError?.(activeError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeError]);

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
      setUploadError(null);
      if (previewPhoto?.id === confirmDelete.id) setPreviewPhoto(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const photoUrl = (id: string) => `${basePath}/${encodeURIComponent(id)}`;
  const photos = state.kind === "ready" ? state.photos : [];
  const isGallery = variant === "gallery";

  // Gallery grid: 3 columns, pad with empty placeholder cells so the grid
  // always shows at least one full empty row "waiting for a photo" (per
  // the knowledge/verbal-game frame reference, but 3 columns instead of 2).
  const emptyCellCount = isGallery ? (3 - (photos.length % 3)) % 3 || 3 : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={headingClassName ?? "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"}>
          Photos{state.kind === "ready" && state.photos.length > 0 ? ` (${state.photos.length})` : ""}
        </div>
        {galleryHref && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => router.push(galleryHref)}
          >
            <Images className="h-3 w-3" />
            Gallery
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME}
          multiple
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        {uploading && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading…
          </span>
        )}
      </div>

      {!onError && activeError && <div className="text-xs text-red-500">{activeError}</div>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading photos…
        </div>
      )}

      {!isGallery && state.kind === "ready" && state.photos.length === 0 && (
        <div className="text-xs text-muted-foreground">No photos yet.</div>
      )}

      {!isGallery && state.kind === "ready" && state.photos.length > 0 && (
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

      {isGallery && state.kind !== "loading" && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreviewPhoto(p)}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              title={p.originalFileName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.id)} alt={p.originalFileName} className="h-full w-full object-cover" />
            </button>
          ))}
          {Array.from({ length: emptyCellCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground/40"
            >
              <ImagePlus className="h-6 w-6" />
            </div>
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
              <div className="flex items-center gap-2">
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
});

export function PhotoCountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <ImagePlus className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}
