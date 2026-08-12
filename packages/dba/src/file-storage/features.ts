/**
 * Canonical feature path segments under `02_files_refrenced/<username>/…`.
 * Spelling of the parent volume segment stays `02_files_refrenced` (historical).
 *
 * Host location (Story 112): under `chad-data/` on the cp_1 volume —
 *   LOCAL: `/Volumes/cp_1/chad-data/02_files_refrenced`
 *   QNAP:  `/share/cp_1/chad-data/02_files_refrenced`
 * Runtime code only sees `CHAD_CONTACT_PHOTOS_DIR` (the `02_files_refrenced` root).
 */

export const FILES_REFERENCED_SEGMENT = "02_files_refrenced";

/** Host parent folder under cp_1 (docs / compose defaults only — not joined in business code). */
export const FILES_REFERENCED_HOST_PARENT = "chad-data";

export const FILE_STORAGE_FEATURES = {
  PHOTOS_LEAD_INFO: "01_files_photos/lead-info",
  PHOTOS_GOOGLE_CONTACTS: "01_files_photos/google-contacts",
  /** Final recordings. */
  AUDIO_RECORDINGS: "10_files_audio/recordings",
  /** Multi-segment drafts (sibling of recordings). */
  AUDIO_DRAFTS: "10_files_audio/drafts",
  ZIP_MANUALLY_ADDED_MSG: "02_files_zip/manually-added-msg",
  ZIP_IMPORT_TEMP: "02_files_zip/temp",
} as const;

export type FileStorageFeature =
  (typeof FILE_STORAGE_FEATURES)[keyof typeof FILE_STORAGE_FEATURES];

export type FileStorageEntityType =
  | "lead"
  | "google-contact"
  | "recording"
  | "import"
  | "other";
