/**
 * AI Prompts (Story 88) — provider-neutral prompt registry backing the
 * Dashboard's Msg Auto → AI Prompts editor and the Message Creator's AI
 * execution boundary.
 *
 * Storage: one Content Provider Text item, `msg-auto / ai prompts`, lazily
 * created on first write (same find-or-create pattern
 * `message-creator.ts`'s `getOrCreateApproachContext` already uses via
 * `item-ops.ts`). Body is a single JSON document (never YAML — the model is
 * a complex, versioned list, not a flat key/value body):
 *
 *   { "schemaVersion": 1, "prompts": AiPromptDefinition[] }
 *
 * All Content Provider access goes through `item-ops.ts` (already
 * backend-agnostic via `getDataRouter()`); this file never calls
 * `invokeContentProvider` directly and never accepts a `repoGuid` from a
 * caller — isolation is exclusively `getCurrentRepoGuid()`/
 * `runWithRepoContext` (see `repo-context.ts`).
 */

import { randomUUID } from "node:crypto";
import {
  findOrCreateFolderChain as realFindOrCreateFolderChain,
  createOrGetChild as realCreateOrGetChild,
  putItemBody as realPutItemBody,
} from "./item-ops.js";
import type { CpItem } from "./cp-model.js";

// ---------------------------------------------------------------------------
// Provider-neutral domain model
// ---------------------------------------------------------------------------

export type AiProvider = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type AiPromptStatus = "draft" | "published" | "archived";

/** Where the prompt body lives — stable technical values (UI labels differ). */
export type AiPromptKind = "our_custom" | "openai_managed";

export type AiPromptActionType =
  | "conversation-health"
  | "capital"
  | "next-message"
  | "improve"
  | "full-analysis"
  | "custom";

export const AI_PROMPT_KIND_LABELS: Record<AiPromptKind, string> = {
  our_custom: "Our Custom Prompt",
  openai_managed: "OpenAI Managed Prompt",
};

export interface AiPromptMessage {
  role: "developer" | "system" | "user";
  content: string;
}

export interface AiPromptVariable {
  key: string;
  label?: string;
  required: boolean;
  description?: string;
}

export interface AiPromptSettings {
  textFormat?: "text" | "json_schema";
  reasoningMode?: string;
  reasoningEffort?: string;
  verbosity?: string;
  summary?: string;
  storeLogs?: boolean;
  outputSchema?: unknown;
}

export interface AiPromptProviderBindings {
  openaiPromptId?: string;
  openaiPromptVersion?: string;
}

/**
 * A published prompt's frozen content — set only by `publishAiPrompt`,
 * never mutated by `updateAiPrompt`. This is what Message Creator (and any
 * other executor) reads: editing the live draft fields above must never
 * implicitly change what's actually in production (input §12).
 */
export interface AiPromptPublishedSnapshot {
  version: number;
  publishedAt: string;
  name: string;
  description?: string;
  schoolId?: string;
  actionType: AiPromptActionType;
  messages: AiPromptMessage[];
  variables: AiPromptVariable[];
  provider: AiProvider;
  model?: string;
  settings?: AiPromptSettings;
  providerBindings?: AiPromptProviderBindings;
}

export interface AiPromptDefinition {
  id: string;
  slug: string;
  name: string;
  description?: string;

  schoolId?: string;
  actionType: AiPromptActionType;

  /**
   * Storage mode for the prompt body. Missing on pre–promptKind records —
   * treat as `our_custom`. Legacy stored value `chad_custom` normalizes to `our_custom`.
   */
  promptKind?: AiPromptKind;
  /** Soft enable flag for Forms UI; missing → true. Independent of publish. */
  enabled?: boolean;
  tags?: string[];

  status: AiPromptStatus;
  /** Current draft version number — incremented each time `publishAiPrompt` runs. */
  version: number;
  /** Version number currently live in `publishedSnapshot`, if ever published. */
  publishedVersion?: number;
  /** Frozen content of the last published version (see doc comment above). */
  publishedSnapshot?: AiPromptPublishedSnapshot;

  messages: AiPromptMessage[];
  variables: AiPromptVariable[];

  provider: AiProvider;
  model?: string;

  settings?: AiPromptSettings;
  providerBindings?: AiPromptProviderBindings;

  createdAt: string;
  updatedAt: string;
}

/** Row shape for the Prompt List view — no message/variable bodies. */
export interface AiPromptSummary {
  id: string;
  slug: string;
  name: string;
  description?: string;
  schoolId?: string;
  actionType: AiPromptActionType;
  promptKind: AiPromptKind;
  enabled: boolean;
  tags: string[];
  status: AiPromptStatus;
  version: number;
  provider: AiProvider;
  updatedAt: string;
}

export interface CreateAiPromptInput {
  slug: string;
  name: string;
  description?: string;
  schoolId?: string;
  actionType: AiPromptActionType;
  promptKind?: AiPromptKind;
  enabled?: boolean;
  tags?: string[];
  messages: AiPromptMessage[];
  variables?: AiPromptVariable[];
  provider: AiProvider;
  model?: string;
  settings?: AiPromptSettings;
  providerBindings?: AiPromptProviderBindings;
}

export interface UpdateAiPromptInput {
  slug?: string;
  name?: string;
  description?: string;
  schoolId?: string;
  actionType?: AiPromptActionType;
  promptKind?: AiPromptKind;
  enabled?: boolean;
  tags?: string[];
  messages?: AiPromptMessage[];
  variables?: AiPromptVariable[];
  provider?: AiProvider;
  model?: string;
  settings?: AiPromptSettings;
  providerBindings?: AiPromptProviderBindings;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AiPromptsErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_SLUG"
  | "CORRUPT_REGISTRY";

export class AiPromptsOperationError extends Error {
  constructor(
    public readonly code: AiPromptsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiPromptsOperationError";
  }
}

// ---------------------------------------------------------------------------
// Storage — schemaVersion 1 JSON body, injectable ops seam for tests
// (mirrors folders.ts's FolderChildOps pattern; production call sites never
// pass this, so the real item-ops.ts/getDataRouter() path is always used).
// ---------------------------------------------------------------------------

const MSG_AUTO_FOLDER = "msg-auto";
const AI_PROMPTS_ITEM = "ai prompts";
const SCHEMA_VERSION = 1;

interface AiPromptsRegistryBody {
  schemaVersion: number;
  prompts: AiPromptDefinition[];
}

const EMPTY_REGISTRY_BODY = JSON.stringify({ schemaVersion: SCHEMA_VERSION, prompts: [] }, null, 2);

export interface AiPromptsOps {
  findOrCreateFolderChain: typeof realFindOrCreateFolderChain;
  createOrGetChild: typeof realCreateOrGetChild;
  putItemBody: typeof realPutItemBody;
}

const defaultOps: AiPromptsOps = {
  findOrCreateFolderChain: realFindOrCreateFolderChain,
  createOrGetChild: realCreateOrGetChild,
  putItemBody: realPutItemBody,
};

/**
 * Parses the registry body. Empty/missing body → empty registry (lazy
 * initialization, never a crash). Non-empty but invalid JSON → throws
 * `CORRUPT_REGISTRY` — callers must never fall back to overwriting it with
 * an empty list; the existing body is left untouched for manual recovery.
 */
export function parseAiPromptsRegistryBody(raw: string | null | undefined): AiPromptsRegistryBody {
  if (!raw || !raw.trim()) {
    return { schemaVersion: SCHEMA_VERSION, prompts: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AiPromptsOperationError(
      "CORRUPT_REGISTRY",
      `msg-auto/ai prompts body is not valid JSON — refusing to overwrite it. Parse error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as AiPromptsRegistryBody).prompts)) {
    throw new AiPromptsOperationError(
      "CORRUPT_REGISTRY",
      "msg-auto/ai prompts body is valid JSON but not a recognizable registry document (missing \"prompts\" array) — refusing to overwrite it.",
    );
  }
  const doc = parsed as AiPromptsRegistryBody;
  return { schemaVersion: doc.schemaVersion ?? SCHEMA_VERSION, prompts: doc.prompts };
}

/** Deterministic serialization — stable key order, pretty-printed. */
export function serializeAiPromptsRegistryBody(prompts: AiPromptDefinition[]): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, prompts }, null, 2);
}

async function ensureRegistryItem(ops: AiPromptsOps): Promise<CpItem> {
  const folder = await ops.findOrCreateFolderChain([MSG_AUTO_FOLDER]);
  return ops.createOrGetChild(folder, AI_PROMPTS_ITEM, "Text", EMPTY_REGISTRY_BODY);
}

async function readRegistry(ops: AiPromptsOps): Promise<{ item: CpItem; prompts: AiPromptDefinition[] }> {
  const item = await ensureRegistryItem(ops);
  const body = parseAiPromptsRegistryBody(typeof item.body === "string" ? item.body : null);
  return { item, prompts: body.prompts };
}

async function writeRegistry(ops: AiPromptsOps, item: CpItem, prompts: AiPromptDefinition[]): Promise<void> {
  await ops.putItemBody(item.config.address, serializeAiPromptsRegistryBody(prompts));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function requireStableId(slug: string | undefined): string {
  const trimmed = (slug ?? "").trim();
  if (!trimmed) {
    throw new AiPromptsOperationError("VALIDATION", "slug (stable id) must not be empty");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new AiPromptsOperationError(
      "VALIDATION",
      `slug "${trimmed}" must be lowercase alphanumeric with hyphens only`,
    );
  }
  return trimmed;
}

function requireName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    throw new AiPromptsOperationError("VALIDATION", "name must not be empty");
  }
  return trimmed;
}

export function normalizeAiPromptKind(
  kind: AiPromptKind | "chad_custom" | undefined | null,
): AiPromptKind {
  return kind === "openai_managed" ? "openai_managed" : "our_custom";
}

function assertPromptKindPayload(
  kind: AiPromptKind,
  messages: AiPromptMessage[] | undefined,
  bindings: AiPromptProviderBindings | undefined,
): AiPromptMessage[] {
  if (kind === "openai_managed") {
    const id = bindings?.openaiPromptId?.trim();
    if (!id) {
      throw new AiPromptsOperationError(
        "VALIDATION",
        "OpenAI Prompt ID is required for openai_managed prompts",
      );
    }
    return messages ?? [];
  }
  // our_custom: body may be empty on create (filled later in the rich editor).
  return messages ?? [];
}

function assertNoDuplicateSlug(prompts: AiPromptDefinition[], slug: string, excludeId?: string): void {
  const clash = prompts.find((p) => p.slug === slug && p.id !== excludeId);
  if (clash) {
    throw new AiPromptsOperationError("DUPLICATE_SLUG", `A prompt with slug "${slug}" already exists`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listAiPrompts(ops: AiPromptsOps = defaultOps): Promise<AiPromptSummary[]> {
  const { prompts } = await readRegistry(ops);
  return prompts
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      schoolId: p.schoolId,
      actionType: p.actionType,
      promptKind: normalizeAiPromptKind(p.promptKind),
      enabled: p.enabled !== false,
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: p.status,
      version: p.version,
      provider: p.provider,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAiPrompt(
  id: string,
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition | null> {
  const { prompts } = await readRegistry(ops);
  return prompts.find((p) => p.id === id) ?? null;
}

export async function createAiPrompt(
  input: CreateAiPromptInput,
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition> {
  const slug = requireStableId(input.slug);
  const name = requireName(input.name);
  const promptKind = normalizeAiPromptKind(input.promptKind);
  const messages = assertPromptKindPayload(promptKind, input.messages, input.providerBindings);

  const { item, prompts } = await readRegistry(ops);
  assertNoDuplicateSlug(prompts, slug);

  const now = new Date().toISOString();
  const prompt: AiPromptDefinition = {
    id: randomUUID(),
    slug,
    name,
    description: input.description,
    schoolId: input.schoolId,
    actionType: input.actionType,
    promptKind,
    enabled: input.enabled !== false,
    tags: Array.isArray(input.tags) ? input.tags : [],
    status: "draft",
    version: 1,
    messages,
    variables: input.variables ?? [],
    provider: input.provider,
    model: input.model,
    settings: input.settings,
    providerBindings: input.providerBindings,
    createdAt: now,
    updatedAt: now,
  };

  const next = [...prompts, prompt];
  await writeRegistry(ops, item, next);
  return prompt;
}

/**
 * Updates a prompt's editable/draft fields only. Never touches `status`,
 * `version`, `publishedVersion`, or `publishedSnapshot` — those transition
 * exclusively through `publishAiPrompt`/`archiveAiPrompt`, so a draft edit
 * can never implicitly change what's live (input §12).
 */
export async function updateAiPrompt(
  id: string,
  input: UpdateAiPromptInput,
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition> {
  const { item, prompts } = await readRegistry(ops);
  const index = prompts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
  }
  const existing = prompts[index];

  const slug = input.slug !== undefined ? requireStableId(input.slug) : existing.slug;
  const name = input.name !== undefined ? requireName(input.name) : existing.name;
  const promptKind = normalizeAiPromptKind(
    input.promptKind !== undefined ? input.promptKind : existing.promptKind,
  );
  const bindings =
    input.providerBindings !== undefined ? input.providerBindings : existing.providerBindings;
  const messages =
    input.messages !== undefined
      ? assertPromptKindPayload(promptKind, input.messages, bindings)
      : assertPromptKindPayload(promptKind, existing.messages, bindings);
  if (slug !== existing.slug) {
    assertNoDuplicateSlug(prompts, slug, id);
  }

  const updated: AiPromptDefinition = {
    ...existing,
    slug,
    name,
    description: input.description !== undefined ? input.description : existing.description,
    schoolId: input.schoolId !== undefined ? input.schoolId : existing.schoolId,
    actionType: input.actionType ?? existing.actionType,
    promptKind,
    enabled: input.enabled !== undefined ? input.enabled : existing.enabled !== false,
    tags: input.tags !== undefined ? input.tags : existing.tags ?? [],
    messages,
    variables: input.variables ?? existing.variables,
    provider: input.provider ?? existing.provider,
    model: input.model !== undefined ? input.model : existing.model,
    settings: input.settings !== undefined ? input.settings : existing.settings,
    providerBindings: bindings,
    updatedAt: new Date().toISOString(),
  };

  const next = [...prompts];
  next[index] = updated;
  await writeRegistry(ops, item, next);
  return updated;
}

/**
 * Publishes the current draft fields as the new live version: bumps
 * `version`, freezes a `publishedSnapshot` at that version, sets
 * `status: "published"`. Draft (`draft` prompt directly, must be
 * `status !== "archived"`; publishing from any non-archived status is
 * allowed, including re-publishing after further edits).
 */
export async function publishAiPrompt(
  id: string,
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition> {
  const { item, prompts } = await readRegistry(ops);
  const index = prompts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
  }
  const existing = prompts[index];
  if (existing.status === "archived") {
    throw new AiPromptsOperationError("VALIDATION", "Cannot publish an archived prompt");
  }
  assertPromptKindPayload(
    normalizeAiPromptKind(existing.promptKind),
    existing.messages,
    existing.providerBindings,
  );

  const now = new Date().toISOString();
  const version = existing.version + 1;
  const snapshot: AiPromptPublishedSnapshot = {
    version,
    publishedAt: now,
    name: existing.name,
    description: existing.description,
    schoolId: existing.schoolId,
    actionType: existing.actionType,
    messages: existing.messages,
    variables: existing.variables,
    provider: existing.provider,
    model: existing.model,
    settings: existing.settings,
    providerBindings: existing.providerBindings,
  };

  const updated: AiPromptDefinition = {
    ...existing,
    status: "published",
    version,
    publishedVersion: version,
    publishedSnapshot: snapshot,
    updatedAt: now,
  };

  const next = [...prompts];
  next[index] = updated;
  await writeRegistry(ops, item, next);
  return updated;
}

/**
 * Archives a prompt — it stops being resolvable by `findPublishedAiPrompt`
 * (Message Creator sees "Prompt not configured" again), but its
 * `publishedSnapshot` history is kept, not deleted (Content Provider has no
 * working Delete — see `human-docs`'s Content Provider docs).
 */
export async function archiveAiPrompt(
  id: string,
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition> {
  const { item, prompts } = await readRegistry(ops);
  const index = prompts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
  }
  const updated: AiPromptDefinition = {
    ...prompts[index],
    status: "archived",
    updatedAt: new Date().toISOString(),
  };
  const next = [...prompts];
  next[index] = updated;
  await writeRegistry(ops, item, next);
  return updated;
}

/** Permanently removes a prompt from the registry JSON (Forms Delete). */
export async function deleteAiPrompt(
  id: string,
  ops: AiPromptsOps = defaultOps,
): Promise<void> {
  const { item, prompts } = await readRegistry(ops);
  const index = prompts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
  }
  const next = prompts.filter((p) => p.id !== id);
  await writeRegistry(ops, item, next);
}

/**
 * Resolves the published prompt for an action type — the Message Creator
 * integration point. Prefers an exact `schoolId` match; falls back to a
 * published prompt with no `schoolId` (school-agnostic default); returns
 * `null` (never a draft, never invented) when nothing matches — callers
 * must show "Prompt not configured", not silently substitute a draft.
 */
export async function findPublishedAiPrompt(
  filter: { actionType: AiPromptActionType; schoolId?: string },
  ops: AiPromptsOps = defaultOps,
): Promise<AiPromptDefinition | null> {
  const { prompts } = await readRegistry(ops);
  const published = prompts.filter((p) => p.status === "published" && p.actionType === filter.actionType);
  if (filter.schoolId) {
    const exact = published.find((p) => p.schoolId === filter.schoolId);
    if (exact) return exact;
  }
  return published.find((p) => !p.schoolId) ?? null;
}
