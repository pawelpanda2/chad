-- Story 110 — Manually Added Messages archive metadata (filesystem keeps ZIP binary).
--
-- id          = UUID of this archive/export (not the lead)
-- lead_uuid   = stable cp_items.id of the lead Folder
-- file_name / lead_name_at_export / storage_path are snapshots at write time

CREATE TABLE cp_lead_archives (
  id text PRIMARY KEY,
  repo_guid text NOT NULL,
  owner_username text NOT NULL,
  lead_uuid text NOT NULL,
  lead_name_at_export text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  view_key text NOT NULL,
  file_type text NOT NULL,
  size_bytes bigint NOT NULL,
  original_file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cp_lead_archives_file_type_chk CHECK (file_type IN ('zip', 'rar')),
  CONSTRAINT cp_lead_archives_storage_path_unique UNIQUE (repo_guid, storage_path)
);

CREATE INDEX cp_lead_archives_repo_lead_idx
  ON cp_lead_archives (repo_guid, lead_uuid);

CREATE INDEX cp_lead_archives_repo_view_idx
  ON cp_lead_archives (repo_guid, view_key);
