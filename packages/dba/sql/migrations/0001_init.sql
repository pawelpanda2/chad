-- Story 80 — initial PostgreSQL schema for CHAD (cp_items/cp_history/outboxes).
--
-- gen_random_uuid() is core Postgres since v13 (no extension needed).
-- pgcrypto is only needed for digest()/sha256, used by the history trigger's
-- hash chain (a Postgres-native hash, independent of the Node-side
-- hashCpState() used by MongoCpProvider/the migrator's verification step —
-- see packages/dba/src/cp-history/hash.ts's doc comment for why the two
-- don't need to match byte-for-byte, only be internally chain-consistent).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- cp_items — one row per CP Item (Story 80 §3.1). id == config.id (enforced
-- app-side, mirroring cp-model.ts's validateCpItem — see
-- postgres-cp-provider.ts). repo_guid is an explicit indexed column (derived
-- from address at write time), a deliberate improvement over MongoCpProvider,
-- which has no such column and instead re-derives it from address on every
-- read via splitAddress().
--
-- id is `text`, NOT `uuid` — confirmed against real local Mongo data during
-- this Story's own local cutover: while `MongoCpProvider`'s own writes
-- always mint a v4 UUID (`data-clock.ts`'s `newId()`), pre-existing/legacy
-- `cp_items._id` values in the wild are NOT guaranteed to be UUID-shaped
-- (e.g. hand-seeded fixtures like "item-1"). A `uuid`-typed column would
-- reject these outright during migration — exactly the "nie zgaduj, czy
-- wszystkie istniejące ID są UUID" trap Story 80's own input warned against.
-- ---------------------------------------------------------------------------
CREATE TABLE cp_items (
  id text PRIMARY KEY,
  repo_guid text NOT NULL,
  address text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  config jsonb NOT NULL,
  body text NOT NULL,

  created_at timestamptz NOT NULL,
  modified_at timestamptz NOT NULL,

  -- Set by the history trigger below, never directly by application code
  -- (mirrors cp_items._historyVersion/_lastMutationId/_lastActor/
  -- _lastRequestId in the Mongo model — top-level bookkeeping columns,
  -- never inside `config`).
  history_version integer NOT NULL DEFAULT 0,
  last_mutation_id text,
  last_request_id text,
  last_actor_username text,
  last_actor_repo_guid text,
  last_actor_kind text,

  UNIQUE (repo_guid, address)
);

-- Prefix search (children-of-address, addressPrefix filters) and per-repo
-- name lookups (getByNames2's exact-name-among-siblings query) — the two
-- real query shapes this provider issues. No GIN index on config: no
-- existing caller queries JSONB contents directly (confirmed by DBA audit),
-- so one is not added per Story 80's "don't add indexes without concrete
-- use" instruction.
CREATE INDEX cp_items_repo_address_prefix_idx ON cp_items (repo_guid, address text_pattern_ops);
CREATE INDEX cp_items_repo_name_idx ON cp_items (repo_guid, name);

-- ---------------------------------------------------------------------------
-- cp_history — append-only audit trail (Story 80 §3.2/§5). Written
-- exclusively by the BEFORE INSERT/UPDATE/DELETE trigger on cp_items below,
-- never directly by application code, so it also captures manual SQL
-- (actor_kind='unknown' in that case) — the whole point of the trigger
-- variant over an application-only transaction wrapper.
--
-- config_diff/body_diff are part of the target schema (Story 80 §3.2) but
-- deliberately left NULL by the trigger and computed at READ time instead,
-- from before_snapshot/after_snapshot, reusing the existing DB-agnostic
-- diffConfig()/diffBody() (packages/dba/src/cp-history/diff.ts) — Story 80's
-- own explicit fallback ("diff może być wyliczany przy odczycie... nie
-- poświęcaj niezawodności historii dla skomplikowanego diffu") to avoid
-- writing JSON-diff logic in PL/pgSQL. before_snapshot/after_snapshot are
-- therefore always stored in full (not just every Nth version, unlike
-- Story 79's Mongo model) — jsonb/TOAST makes this cheap enough that the
-- simplicity win outweighs the storage cost, per Story 80's stated priority
-- order (pełna historia > atomowość > prostota > dopiero optymalizacja
-- rozmiaru).
-- ---------------------------------------------------------------------------
CREATE TABLE cp_history (
  id bigserial PRIMARY KEY,
  mutation_id text NOT NULL,
  request_id text,

  source_id text NOT NULL, -- matches cp_items.id's type (text, not uuid — see that table's doc comment)
  repo_guid text NOT NULL,
  address text NOT NULL,
  item_name text,
  version integer NOT NULL,

  operation_type text NOT NULL
    CHECK (operation_type IN ('insert','update','delete')),

  actor_username text,
  actor_repo_guid text,
  actor_kind text NOT NULL
    CHECK (actor_kind IN ('user','system','migration','unknown')),

  changed_at timestamptz NOT NULL DEFAULT now(),

  before_hash text,
  after_hash text,

  config_diff jsonb,
  body_diff jsonb,

  before_snapshot jsonb,
  after_snapshot jsonb,

  UNIQUE (mutation_id),
  UNIQUE (source_id, version)
);

CREATE INDEX cp_history_repo_changedat_idx ON cp_history (repo_guid, changed_at DESC);
CREATE INDEX cp_history_source_version_idx ON cp_history (source_id, version DESC);
CREATE INDEX cp_history_address_changedat_idx ON cp_history (address, changed_at DESC);

-- Immutability (Story 80 §3.2: "historia immutable; brak update/delete
-- użytkowych rekordów historii") — enforced at the DB level, not just by
-- application convention, so no code path (including a future one) can ever
-- rewrite or remove a history event.
CREATE OR REPLACE FUNCTION cp_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cp_history is append-only: % on cp_history.id=% is not allowed', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cp_history_no_update
  BEFORE UPDATE ON cp_history
  FOR EACH ROW EXECUTE FUNCTION cp_history_immutable();

CREATE TRIGGER cp_history_no_delete
  BEFORE DELETE ON cp_history
  FOR EACH ROW EXECUTE FUNCTION cp_history_immutable();

-- ---------------------------------------------------------------------------
-- History trigger (Story 80 §4/§5/§6, "Wariant A" — the spec's preferred
-- variant). Reads transaction-local settings the application sets via
-- parameterized set_config() calls before the INSERT/UPDATE/DELETE
-- (postgres-cp-provider.ts / mutate-postgres.ts) — never raw string-
-- interpolated SET LOCAL, to avoid any SQL-injection surface. Manual `psql`
-- writes with none of these settings still produce a history event, just
-- with actor_kind='unknown' and a server-generated mutation_id — history can
-- never be silently skipped, only its actor attribution can be lost (same
-- residual risk Story 79 already documented for the Mongo Change-Stream
-- design, carried forward here by design, not by omission).
--
-- version is computed and stored directly onto NEW.history_version by this
-- same BEFORE trigger — no separate counter table, no extra round-trip: the
-- row lock Postgres already takes as part of executing the UPDATE/DELETE
-- statement itself (before this per-row trigger fires) makes the
-- read-then-increment race-free without any additional locking (Story 80
-- §7's "brak luk" requirement).
-- ---------------------------------------------------------------------------
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
    v_version := 1;
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

CREATE TRIGGER cp_items_before_insupd
  BEFORE INSERT OR UPDATE ON cp_items
  FOR EACH ROW EXECUTE FUNCTION cp_items_write_history();

CREATE TRIGGER cp_items_before_delete
  BEFORE DELETE ON cp_items
  FOR EACH ROW EXECUTE FUNCTION cp_items_write_history();

-- ---------------------------------------------------------------------------
-- Outboxes (Story 80 §3.3) — column-for-column translation of the existing
-- Mongo OutboxJob/GoogleSheetsSyncJob document shapes. Claim uses
-- `FOR UPDATE SKIP LOCKED` (postgres-outbox.ts / google-sheets/
-- outbox-postgres.ts), not this schema file.
-- ---------------------------------------------------------------------------
CREATE TABLE cp_outbox_data_sync (
  id text PRIMARY KEY, -- "${operationId}:${followerBackend}", mirrors Mongo's _id
  operation_id text NOT NULL,
  command_kind text NOT NULL,
  primary_backend text NOT NULL,
  follower_backend text NOT NULL,
  command jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','processing','retry','synced','failed','conflict')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text
);
CREATE INDEX cp_outbox_data_sync_claim_idx ON cp_outbox_data_sync (status, next_attempt_at);

CREATE TABLE cp_outbox_google_sheets_sync (
  id text PRIMARY KEY, -- operationId, mirrors Mongo's _id
  operation_id text NOT NULL,
  record_key text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','processing','retry','synced','failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text
);
CREATE INDEX cp_outbox_google_sheets_sync_claim_idx ON cp_outbox_google_sheets_sync (status, next_attempt_at);
