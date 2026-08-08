/**
 * Canonical feature path segments under `02_files_refrenced/<username>/…`.
 * Spelling of the parent volume segment stays `02_files_refrenced` (historical).
 */

export const FILES_REFERENCED_SEGMENT = "02_files_refrenced";

export const FILE_STORAGE_FEATURES = {
  PHOTOS_LEAD_INFO: "01_files_photos/lead-info",
  PHOTOS_GOOGLE_CONTACTS: "01_files_photos/google-contacts",
  AUDIO_RECORDINGS: "10_files_audio/recordings",
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
