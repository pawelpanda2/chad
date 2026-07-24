-- Story 87 — re-INSERT after DELETE must continue the version sequence.
--
-- Bug: cp_items_write_history() hard-coded v_version := 1 on INSERT. After a
-- row is deleted, cp_history still holds versions 1..N (immutable). Re-creating
-- the same id then collided on UNIQUE (source_id, version).
-- Symptom for local Docker: seed of chad_admin after a prior delete →
-- "duplicate key value violates unique constraint cp_history_source_id_version_key"
-- → empty users-list → login "Invalid credentials".

CREATE OR REPLACE FUNCTION cp_items_write_history() RETURNS trigger AS $$
DECLARE
  v_mutation_id text;
  v_request_id text;
  v_actor_username text;
  v_actor_repo_guid text;
  v_actor_kind text;
  v_version integer;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_before_hash text;
  v_after_hash text;
BEGIN
  v_mutation_id := NULLIF(current_setting('app.mutation_id', true), '');
  IF v_mutation_id IS NULL THEN
    v_mutation_id := gen_random_uuid()::text;
  END IF;
  v_request_id := NULLIF(current_setting('app.request_id', true), '');
  v_actor_username := NULLIF(current_setting('app.actor_username', true), '');
  v_actor_repo_guid := NULLIF(current_setting('app.actor_repo_guid', true), '');
  v_actor_kind := COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'unknown');

  IF TG_OP = 'DELETE' THEN
    v_version := OLD.history_version + 1;
    v_before_snapshot := jsonb_build_object('config', OLD.config, 'body', OLD.body);
    v_after_snapshot := NULL;
    v_before_hash := encode(digest(v_before_snapshot::text, 'sha256'), 'hex');
    v_after_hash := NULL;

    INSERT INTO cp_history (
      mutation_id, request_id, source_id, repo_guid, address, item_name, version,
      operation_type, actor_username, actor_repo_guid, actor_kind,
      before_hash, after_hash, before_snapshot, after_snapshot
    ) VALUES (
      v_mutation_id, v_request_id, OLD.id, OLD.repo_guid, OLD.address, OLD.name, v_version,
      'delete', v_actor_username, COALESCE(v_actor_repo_guid, OLD.repo_guid), v_actor_kind,
      v_before_hash, v_after_hash, v_before_snapshot, v_after_snapshot
    );

    RETURN OLD;

  ELSIF TG_OP = 'INSERT' THEN
    -- Continue from max history version when re-creating an id after delete.
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM cp_history
    WHERE source_id = NEW.id;

    NEW.history_version := v_version;
    NEW.last_mutation_id := v_mutation_id;
    NEW.last_request_id := v_request_id;
    NEW.last_actor_username := v_actor_username;
    NEW.last_actor_repo_guid := COALESCE(v_actor_repo_guid, NEW.repo_guid);
    NEW.last_actor_kind := v_actor_kind;

    v_after_snapshot := jsonb_build_object('config', NEW.config, 'body', NEW.body);
    v_after_hash := encode(digest(v_after_snapshot::text, 'sha256'), 'hex');

    INSERT INTO cp_history (
      mutation_id, request_id, source_id, repo_guid, address, item_name, version,
      operation_type, actor_username, actor_repo_guid, actor_kind,
      before_hash, after_hash, before_snapshot, after_snapshot
    ) VALUES (
      v_mutation_id, v_request_id, NEW.id, NEW.repo_guid, NEW.address, NEW.name, v_version,
      'insert', v_actor_username, COALESCE(v_actor_repo_guid, NEW.repo_guid), v_actor_kind,
      NULL, v_after_hash, NULL, v_after_snapshot
    );

    RETURN NEW;

  ELSE -- UPDATE
    v_version := OLD.history_version + 1;
    NEW.history_version := v_version;
    NEW.last_mutation_id := v_mutation_id;
    NEW.last_request_id := v_request_id;
    NEW.last_actor_username := v_actor_username;
    NEW.last_actor_repo_guid := COALESCE(v_actor_repo_guid, NEW.repo_guid);
    NEW.last_actor_kind := v_actor_kind;

    v_before_snapshot := jsonb_build_object('config', OLD.config, 'body', OLD.body);
    v_after_snapshot := jsonb_build_object('config', NEW.config, 'body', NEW.body);
    v_before_hash := encode(digest(v_before_snapshot::text, 'sha256'), 'hex');
    v_after_hash := encode(digest(v_after_snapshot::text, 'sha256'), 'hex');

    INSERT INTO cp_history (
      mutation_id, request_id, source_id, repo_guid, address, item_name, version,
      operation_type, actor_username, actor_repo_guid, actor_kind,
      before_hash, after_hash, before_snapshot, after_snapshot
    ) VALUES (
      v_mutation_id, v_request_id, NEW.id, NEW.repo_guid, NEW.address, NEW.name, v_version,
      'update', v_actor_username, COALESCE(v_actor_repo_guid, NEW.repo_guid), v_actor_kind,
      v_before_hash, v_after_hash, v_before_snapshot, v_after_snapshot
    );

    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
