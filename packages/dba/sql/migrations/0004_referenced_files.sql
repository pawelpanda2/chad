-- Story 111 — unified referenced-file metadata (binary stays on cp_1 filesystem).
-- Replaces per-file sidecar JSON as the source of truth for Photos/Audio/etc.

CREATE TABLE cp_referenced_files (
  id text PRIMARY KEY,
  repo_guid text NOT NULL,
  owner_username text NOT NULL,
  feature text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name_snapshot text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  original_file_name text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cp_referenced_files_storage_path_unique UNIQUE (repo_guid, storage_path)
);

CREATE INDEX cp_referenced_files_repo_entity_idx
  ON cp_referenced_files (repo_guid, feature, entity_id);

CREATE INDEX cp_referenced_files_repo_feature_idx
  ON cp_referenced_files (repo_guid, feature, owner_username);
