/**
 * Message Creator (Story 84 + Story 85) — DBA public API.
 *
 * Approach context, my proposals, school / prompt-version config, versioned
 * analysis runs (including message-level targets), conversation freshness
 * (sha256), and the OpenAI action boundary (PROMPT_NOT_CONFIGURED until mentor
 * prompts are wired in a later Story).
 *
 * Does NOT replace SaveAiAnswerToMsgWorkout (Console) or classic msg-workout
 * Text items (`YY-MM-DD`, `YY-MM-DD; ai bot`).
 */

import { createHash } from "node:crypto";
import yaml from "js-yaml";
import {
  chad_FindConversationByLeadName,
  chad_FindReportsByLeadName,
  type ReportResult,
} from "./beeper.js";
import { addressToRepoAndLoca, repoAndLocaToAddress } from "./cp-model.js";
import {
  createOrGetChild,
  getChildrenOf,
  getItemByAddress,
  putItemBody,
} from "./item-ops.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { getLeadMsgWorkoutsByLoca } from "./leads.js";
import { findPublishedAiPrompt, type AiPromptActionType } from "./ai-prompts.js";
import { executeAiPrompt } from "./ai-prompts-openai.js";
import {
  buildMessagePromptVersionOptions,
  parseWhatsAppMessages,
  type ParsedWhatsAppMessage,
  type PromptVersionOption,
} from "./whatsapp-messages.js";

export {
  analysisContextMessageIds,
  buildMessagePromptVersionOptions,
  fnv1aHex,
  parseWhatsAppMessages,
  stableWhatsAppMessageId,
  type ParsedWhatsAppMessage,
  type PromptVersionOption,
  type WhatsAppSender,
} from "./whatsapp-messages.js";

// ---------------------------------------------------------------------------
// Schools
// ---------------------------------------------------------------------------

export interface MessageCreatorSchool {
  id: string;
  tabLabel: string;
  fullName: string;
  order: number;
  enabled: boolean;
  /** Reserved for a later Story — unused until mentor prompts exist. */
  promptRef?: { preparedPromptId?: string; version?: string };
  modelRef?: string;
}

const MESSAGE_CREATOR_SCHOOLS: MessageCreatorSchool[] = [
  {
    id: "sd-pl",
    tabLabel: "SD-PL",
    fullName: "Social Dynamics Poland",
    order: 10,
    enabled: true,
    // No promptRef yet → runMessageCreatorAiAction returns PROMPT_NOT_CONFIGURED
  },
];

export function listMessageCreatorSchools(): MessageCreatorSchool[] {
  return MESSAGE_CREATOR_SCHOOLS.filter((s) => s.enabled).sort((a, b) => a.order - b.order);
}

export function getMessageCreatorSchool(schoolId: string): MessageCreatorSchool | undefined {
  return MESSAGE_CREATOR_SCHOOLS.find((s) => s.id === schoolId);
}

// ---------------------------------------------------------------------------
// Prompt versions (Story 85) — not LLM models
// ---------------------------------------------------------------------------

export interface MessageCreatorPromptVersion {
  id: string;
  displayName: string;
  /** Links to school for future promptRef resolution. */
  schoolId: string;
  order: number;
  enabled: boolean;
}

const MESSAGE_CREATOR_PROMPT_VERSIONS: MessageCreatorPromptVersion[] = [
  { id: "sd-pl-v2", displayName: "SD-PL_v2", schoolId: "sd-pl", order: 10, enabled: true },
  { id: "ump-v1", displayName: "UMP_v1", schoolId: "sd-pl", order: 20, enabled: true },
  { id: "love-system-v1", displayName: "Love-system_v1", schoolId: "sd-pl", order: 30, enabled: true },
  { id: "sd-pl-v1", displayName: "SD-PL_v1", schoolId: "sd-pl", order: 40, enabled: true },
];

export function listMessageCreatorPromptVersions(): MessageCreatorPromptVersion[] {
  return MESSAGE_CREATOR_PROMPT_VERSIONS.filter((v) => v.enabled).sort((a, b) => a.order - b.order);
}

export function getMessageCreatorPromptVersion(
  promptVersionId: string
): MessageCreatorPromptVersion | undefined {
  return MESSAGE_CREATOR_PROMPT_VERSIONS.find((v) => v.id === promptVersionId);
}

// ---------------------------------------------------------------------------
// LLM models (Story 85) — seeded until a shared OpenAI catalog exists
// ---------------------------------------------------------------------------

export interface MessageCreatorLlmModel {
  id: string;
  displayName: string;
  order: number;
  enabled: boolean;
}

const MESSAGE_CREATOR_MODELS: MessageCreatorLlmModel[] = [
  { id: "gpt-4o", displayName: "gpt-4o", order: 10, enabled: true },
  { id: "gpt-4o-mini", displayName: "gpt-4o-mini", order: 20, enabled: true },
];

export function listMessageCreatorModels(): MessageCreatorLlmModel[] {
  return MESSAGE_CREATOR_MODELS.filter((m) => m.enabled).sort((a, b) => a.order - b.order);
}

export function getMessageCreatorModel(modelId: string): MessageCreatorLlmModel | undefined {
  return MESSAGE_CREATOR_MODELS.find((m) => m.id === modelId);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageCreatorOperation =
  | "health"
  | "capital"
  | "next-message"
  | "improve"
  | "full-analysis";

export type AnalysisFreshness = "current" | "outdated" | "not-analyzed" | "no-data";

export interface MessageCreatorReportSummary {
  name: string | null;
  category: string | null;
  address: string | null;
  found: boolean;
  preview: string | null;
  body: string | null;
}

export interface AnalysisRunSummary {
  schoolId: string;
  operation: MessageCreatorOperation;
  itemName: string;
  loca: string;
  conversationHash: string | null;
  createdAt: string | null;
  freshness: AnalysisFreshness;
  /** Parsed payload fields when available (never invented). */
  payload: Record<string, unknown> | null;
  /** Story 85 — null for legacy conversation-level runs. */
  targetMessageId: string | null;
  promptVersionId: string | null;
  modelId: string | null;
  runNumber: number | null;
  proposalText: string | null;
  status: string | null;
}

/** Per-message counts keyed by promptVersionId. */
export type MessageRunCounts = Record<string, Record<string, number>>;

export interface MessageCreatorBootstrap {
  leadName: string;
  leadLoca: string;
  schools: MessageCreatorSchool[];
  promptVersions: MessageCreatorPromptVersion[];
  models: MessageCreatorLlmModel[];
  approachContext: string;
  proposals: string;
  proposalsImportedFromHistorical: boolean;
  historicalYouSuggestion: string | null;
  reports: MessageCreatorReportSummary[];
  conversation: {
    found: boolean;
    body: string | null;
    channel: string | null;
    hash: string | null;
    error?: string;
    messages: ParsedWhatsAppMessage[];
  };
  /** Latest-per school/op (legacy Story 84 consumers). */
  analysis: AnalysisRunSummary[];
  /** All runs (newest first), including message-level. */
  allRuns: AnalysisRunSummary[];
  /** messageId → promptVersionId → count */
  messageRunCounts: MessageRunCounts;
  relatedWorkouts: Array<{ logicalName: string; loca: string }>;
  /**
   * Story 88 — the published AI Prompts registry entry (msg-auto / ai
   * prompts) that "Send new" will actually execute for this lead's default
   * school + `full-analysis` (the only operation the Creator UI currently
   * triggers). `null` means genuinely unconfigured — never invented.
   */
  resolvedPrompt: { id: string; slug: string; name: string; publishedVersion?: number } | null;
}

export interface SaveAnalysisRunInput {
  leadName: string;
  leadLoca: string;
  schoolId: string;
  operation: MessageCreatorOperation;
  conversationHash: string;
  conversationChannel?: string | null;
  userInput?: string;
  status: "complete" | "error" | "not-configured";
  payload: Record<string, unknown>;
  targetMessageId?: string | null;
  promptVersionId?: string | null;
  modelId?: string | null;
  proposalText?: string | null;
}

export interface SaveAnalysisRunResult {
  success: boolean;
  itemName?: string;
  loca?: string;
  error?: string;
}

export type MessageCreatorAiStatus =
  | "PROMPT_NOT_CONFIGURED"
  | "NO_CONVERSATION"
  | "UNKNOWN_SCHOOL"
  | "COMPLETE"
  | "ERROR";

export interface RunMessageCreatorAiInput {
  leadName: string;
  leadLoca: string;
  /** Preferred Story 85 path — resolves school via prompt version. */
  promptVersionId?: string;
  schoolId?: string;
  operation?: MessageCreatorOperation;
  userInput?: string;
  force?: boolean;
  targetMessageId?: string;
  modelId?: string;
}

export interface RunMessageCreatorAiResult {
  status: MessageCreatorAiStatus;
  message?: string;
  run?: SaveAnalysisRunResult;
  freshness?: AnalysisFreshness;
  payload?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Hash / naming helpers (pure — unit-tested)
// ---------------------------------------------------------------------------

export function hashConversationContent(body: string | null | undefined): string | null {
  if (body == null) return null;
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function todayYyMmDd(date = new Date()): string {
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ANALYSIS_OPS: MessageCreatorOperation[] = [
  "health",
  "capital",
  "next-message",
  "improve",
  "full-analysis",
];

export function isMessageCreatorOperation(value: string): value is MessageCreatorOperation {
  return (ANALYSIS_OPS as string[]).includes(value);
}

/** Story 88 — maps Message Creator's own operation names to the provider-neutral AI Prompts registry's `actionType`. */
export const OPERATION_TO_AI_PROMPT_ACTION_TYPE: Record<MessageCreatorOperation, AiPromptActionType> = {
  health: "conversation-health",
  capital: "capital",
  "next-message": "next-message",
  improve: "improve",
  "full-analysis": "full-analysis",
};

/**
 * Builds next analysis item name: `YY-MM-DD; schoolId; operation`,
 * then `YY-MM-DDb; schoolId; operation`, …
 */
export function buildNextAnalysisRunName(
  today: string,
  schoolId: string,
  operation: MessageCreatorOperation,
  existingNames: string[]
): string {
  const base = `${today}; ${schoolId}; ${operation}`;
  if (!existingNames.includes(base)) return base;

  const escapedToday = today.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSchool = schoolId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedOp = operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedToday}([a-z]); ${escapedSchool}; ${escapedOp}$`);

  let maxLetter = "a".charCodeAt(0) - 1;
  for (const name of existingNames) {
    const match = name.match(pattern);
    if (match) {
      const code = match[1].charCodeAt(0);
      if (code > maxLetter) maxLetter = code;
    }
  }
  const nextLetter = String.fromCharCode(maxLetter + 1);
  return `${today}${nextLetter}; ${schoolId}; ${operation}`;
}

export function parseAnalysisRunName(
  name: string
): { today: string; suffix: string | null; schoolId: string; operation: MessageCreatorOperation } | null {
  const match = name.match(
    /^(\d{2}-\d{2}-\d{2})([a-z])?; ([a-z0-9-]+); (health|capital|next-message|improve|full-analysis)$/
  );
  if (!match) return null;
  return {
    today: match[1],
    suffix: match[2] ?? null,
    schoolId: match[3],
    operation: match[4] as MessageCreatorOperation,
  };
}

/** Soft-import: text after a `//you` line until the next `//header` or EOF. */
export function extractHistoricalYouSection(body: string): string | null {
  if (!body || !body.includes("//you")) return null;
  const lines = body.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\/\/you\s*$/i.test(lines[i].trim()) || /^\/\/you\b/i.test(lines[i].trim())) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const collected: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^\/\/[a-z]/i.test(lines[i].trim()) && !/^\/\/you\b/i.test(lines[i].trim())) break;
    collected.push(lines[i]);
  }
  const text = collected.join("\n").trim();
  return text.length > 0 ? text : null;
}

export function computeFreshness(
  runHash: string | null | undefined,
  currentConversationHash: string | null
): AnalysisFreshness {
  if (!runHash) return "not-analyzed";
  if (!currentConversationHash) return "outdated";
  return runHash === currentConversationHash ? "current" : "outdated";
}

// ---------------------------------------------------------------------------
// Analysis body serialize / parse
// ---------------------------------------------------------------------------

interface AnalysisFrontMatter {
  schemaVersion: number;
  schoolId: string;
  operation: MessageCreatorOperation;
  createdAt: string;
  conversationHash: string;
  conversationChannel?: string;
  leadName: string;
  userInput?: string;
  status: string;
  payload?: Record<string, unknown>;
  targetMessageId?: string;
  promptVersionId?: string;
  modelId?: string;
  runNumber?: number;
  proposalText?: string;
}

export function serializeAnalysisRunBody(meta: AnalysisFrontMatter): string {
  const { payload, ...rest } = meta;
  const doc = { ...rest, ...(payload ? { payload } : {}) };
  return `---\n${yaml.dump(doc, { lineWidth: 120 }).trim()}\n---\n`;
}

export function parseAnalysisRunBody(body: string): AnalysisFrontMatter | null {
  if (!body || !body.trim()) return null;
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]) as AnalysisFrontMatter;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lead / folder helpers
// ---------------------------------------------------------------------------

async function getLeadItem(leadLoca: string) {
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), leadLoca);
  const lead = await getItemByAddress(address);
  if (!lead) throw new Error(`Lead not found at loca "${leadLoca}"`);
  return lead;
}

async function ensureMsgWorkoutFolder(leadLoca: string) {
  const lead = await getLeadItem(leadLoca);
  return createOrGetChild(lead, "msg workout", "Folder");
}

// ---------------------------------------------------------------------------
// Approach / proposals
// ---------------------------------------------------------------------------

export async function getOrCreateApproachContext(leadLoca: string): Promise<{ text: string; loca: string }> {
  const lead = await getLeadItem(leadLoca);
  const item = await createOrGetChild(lead, "approach context", "Text", "");
  return {
    text: typeof item.body === "string" ? item.body : "",
    loca: addressToRepoAndLoca(item.config.address).loca,
  };
}

export async function saveApproachContext(leadLoca: string, text: string): Promise<{ loca: string }> {
  const lead = await getLeadItem(leadLoca);
  const item = await createOrGetChild(lead, "approach context", "Text", "");
  await putItemBody(item.config.address, text);
  return { loca: addressToRepoAndLoca(item.config.address).loca };
}

export async function getOrCreateMyProposals(leadLoca: string): Promise<{
  text: string;
  loca: string;
  importedFromHistorical: boolean;
  historicalYouSuggestion: string | null;
}> {
  const folder = await ensureMsgWorkoutFolder(leadLoca);
  const item = await createOrGetChild(folder, "my proposals", "Text", "");
  const text = typeof item.body === "string" ? item.body : "";
  let historicalYouSuggestion: string | null = null;
  if (!text.trim()) {
    const siblings = await getChildrenOf(folder.config.address);
    for (const sibling of siblings) {
      if (sibling.config.name === "my proposals") continue;
      if (sibling.config.type !== "Text") continue;
      const body = typeof sibling.body === "string" ? sibling.body : "";
      const extracted = extractHistoricalYouSection(body);
      if (extracted) {
        historicalYouSuggestion = extracted;
        break;
      }
    }
  }
  return {
    text,
    loca: addressToRepoAndLoca(item.config.address).loca,
    importedFromHistorical: false,
    historicalYouSuggestion,
  };
}

export async function saveMyProposals(leadLoca: string, text: string): Promise<{ loca: string }> {
  const folder = await ensureMsgWorkoutFolder(leadLoca);
  const item = await createOrGetChild(folder, "my proposals", "Text", "");
  await putItemBody(item.config.address, text);
  return { loca: addressToRepoAndLoca(item.config.address).loca };
}

// ---------------------------------------------------------------------------
// Conversation / reports
// ---------------------------------------------------------------------------

export async function getLeadConversationForCreator(leadName: string): Promise<{
  found: boolean;
  body: string | null;
  channel: string | null;
  hash: string | null;
  error?: string;
}> {
  const result = await chad_FindConversationByLeadName(leadName);
  const body = result.body;
  return {
    found: Boolean(result.found && body),
    body,
    channel: result.channel,
    hash: hashConversationContent(body),
    error: result.error,
  };
}

export async function listLeadReportsForCreator(leadName: string): Promise<MessageCreatorReportSummary[]> {
  const results: ReportResult[] = await chad_FindReportsByLeadName(leadName);
  return results
    .filter((r) => r.found && r.body)
    .map((r) => ({
      name: r.name,
      category: r.category,
      address: r.address,
      found: true,
      preview: r.body ? r.body.split(/\r?\n/).slice(0, 8).join("\n") : null,
      body: r.body,
    }));
}

// ---------------------------------------------------------------------------
// Analysis runs
// ---------------------------------------------------------------------------

export async function listAnalysisRuns(
  leadLoca: string,
  currentConversationHash: string | null
): Promise<AnalysisRunSummary[]> {
  const folder = await ensureMsgWorkoutFolder(leadLoca);
  const children = await getChildrenOf(folder.config.address);
  const runs: AnalysisRunSummary[] = [];

  for (const child of children) {
    const parsed = parseAnalysisRunName(child.config.name);
    if (!parsed) continue;
    const body = typeof child.body === "string" ? child.body : "";
    const meta = parseAnalysisRunBody(body);
    const runHash = meta?.conversationHash ?? null;
    runs.push({
      schoolId: parsed.schoolId,
      operation: parsed.operation,
      itemName: child.config.name,
      loca: addressToRepoAndLoca(child.config.address).loca,
      conversationHash: runHash,
      createdAt: meta?.createdAt ?? null,
      freshness: meta ? computeFreshness(runHash, currentConversationHash) : "no-data",
      payload: (meta?.payload as Record<string, unknown> | undefined) ?? null,
      targetMessageId: meta?.targetMessageId ?? null,
      promptVersionId: meta?.promptVersionId ?? null,
      modelId: meta?.modelId ?? null,
      runNumber: typeof meta?.runNumber === "number" ? meta.runNumber : null,
      proposalText: meta?.proposalText ?? null,
      status: meta?.status ?? null,
    });
  }

  // Newest first by createdAt then name
  runs.sort((a, b) => {
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return cb.localeCompare(ca);
    return b.itemName.localeCompare(a.itemName);
  });
  return runs;
}

export function computeMessageRunCounts(runs: AnalysisRunSummary[]): MessageRunCounts {
  const counts: MessageRunCounts = {};
  for (const run of runs) {
    if (!run.targetMessageId || !run.promptVersionId) continue;
    const byVersion = counts[run.targetMessageId] ?? (counts[run.targetMessageId] = {});
    byVersion[run.promptVersionId] = (byVersion[run.promptVersionId] ?? 0) + 1;
  }
  return counts;
}

export function listRunsForMessage(
  runs: AnalysisRunSummary[],
  targetMessageId: string,
  promptVersionId?: string | null
): AnalysisRunSummary[] {
  const filtered = runs.filter((r) => {
    if (r.targetMessageId !== targetMessageId) return false;
    if (promptVersionId && r.promptVersionId !== promptVersionId) return false;
    return true;
  });
  // Oldest → newest for numbering, then reverse for display helper
  const chronological = [...filtered].sort((a, b) => {
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.itemName.localeCompare(b.itemName);
  });
  return chronological.map((run, index) => ({
    ...run,
    runNumber: run.runNumber ?? index + 1,
  }));
}

export function formatRunListLabel(
  run: AnalysisRunSummary,
  promptVersions: MessageCreatorPromptVersion[] = listMessageCreatorPromptVersions()
): string {
  const n = String(run.runNumber ?? 0).padStart(2, "0");
  const version =
    promptVersions.find((v) => v.id === run.promptVersionId)?.displayName ??
    run.promptVersionId ??
    run.schoolId;
  return `${n} ${version}`;
}

export function optionsForMessage(
  messageId: string,
  messageRunCounts: MessageRunCounts,
  promptVersions: MessageCreatorPromptVersion[] = listMessageCreatorPromptVersions()
): PromptVersionOption[] {
  return buildMessagePromptVersionOptions(
    promptVersions,
    messageRunCounts[messageId] ?? {}
  );
}

export function pickLatestAnalysisRuns(runs: AnalysisRunSummary[]): AnalysisRunSummary[] {
  const latest = new Map<string, AnalysisRunSummary>();
  for (const run of runs) {
    const key = `${run.schoolId}::${run.operation}`;
    if (!latest.has(key)) latest.set(key, run);
  }
  return [...latest.values()];
}

export async function saveAnalysisRun(input: SaveAnalysisRunInput): Promise<SaveAnalysisRunResult> {
  try {
    const folder = await ensureMsgWorkoutFolder(input.leadLoca);
    const children = await getChildrenOf(folder.config.address);
    const existingNames = children.map((c) => c.config.name);
    const itemName = buildNextAnalysisRunName(
      todayYyMmDd(),
      input.schoolId,
      input.operation,
      existingNames
    );

    let runNumber: number | undefined;
    if (input.targetMessageId) {
      const existingRuns = await listAnalysisRuns(input.leadLoca, null);
      const forMessage = existingRuns.filter((r) => r.targetMessageId === input.targetMessageId);
      runNumber = forMessage.length + 1;
    }

    const schemaVersion = input.targetMessageId || input.promptVersionId ? 2 : 1;
    const body = serializeAnalysisRunBody({
      schemaVersion,
      schoolId: input.schoolId,
      operation: input.operation,
      createdAt: new Date().toISOString(),
      conversationHash: input.conversationHash,
      conversationChannel: input.conversationChannel ?? undefined,
      leadName: input.leadName,
      userInput: input.userInput,
      status: input.status,
      payload: input.payload,
      targetMessageId: input.targetMessageId ?? undefined,
      promptVersionId: input.promptVersionId ?? undefined,
      modelId: input.modelId ?? undefined,
      runNumber,
      proposalText: input.proposalText ?? undefined,
    });
    const item = await createOrGetChild(folder, itemName, "Text", body);
    // createOrGetChild may return existing empty — always Put body
    await putItemBody(item.config.address, body);
    return {
      success: true,
      itemName,
      loca: addressToRepoAndLoca(item.config.address).loca,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// AI boundary
// ---------------------------------------------------------------------------

export async function runMessageCreatorAiAction(
  input: RunMessageCreatorAiInput
): Promise<RunMessageCreatorAiResult> {
  const promptVersion = input.promptVersionId
    ? getMessageCreatorPromptVersion(input.promptVersionId)
    : undefined;
  const schoolId = promptVersion?.schoolId ?? input.schoolId;
  if (!schoolId) {
    return { status: "UNKNOWN_SCHOOL", message: "Missing schoolId / promptVersionId" };
  }

  const school = getMessageCreatorSchool(schoolId);
  if (!school || !school.enabled) {
    return { status: "UNKNOWN_SCHOOL", message: `Unknown or disabled school: ${schoolId}` };
  }

  if (input.modelId && !getMessageCreatorModel(input.modelId)) {
    return { status: "ERROR", message: `Unknown model: ${input.modelId}` };
  }

  const conversation = await getLeadConversationForCreator(input.leadName);
  if (!conversation.found || !conversation.body || !conversation.hash) {
    return {
      status: "NO_CONVERSATION",
      message: "No conversation found",
    };
  }

  const operation: MessageCreatorOperation = input.operation ?? "full-analysis";

  // Story 88 — resolve a published prompt from the msg-auto / ai prompts
  // registry before falling back to the legacy school.promptRef boundary
  // below. Only `status: "published"` prompts are ever resolved (never a
  // draft) — see ai-prompts.ts's findPublishedAiPrompt.
  const registryPrompt = await findPublishedAiPrompt({
    actionType: OPERATION_TO_AI_PROMPT_ACTION_TYPE[operation],
    schoolId,
  });

  if (registryPrompt) {
    const execution = await executeAiPrompt(registryPrompt, {
      lead_name: input.leadName,
      school_name: school.fullName,
      conversation: conversation.body ?? "",
      user_input: input.userInput ?? "",
    });

    if (execution.status === "complete") {
      const run = await saveAnalysisRun({
        leadName: input.leadName,
        leadLoca: input.leadLoca,
        schoolId,
        operation,
        conversationHash: conversation.hash,
        conversationChannel: conversation.channel,
        userInput: input.userInput,
        status: "complete",
        payload: {
          rawOutput: execution.outputText ?? null,
          promptSlug: registryPrompt.slug,
          promptVersion: registryPrompt.publishedVersion ?? null,
        },
        targetMessageId: input.targetMessageId ?? null,
        promptVersionId: input.promptVersionId ?? promptVersion?.id ?? null,
        modelId: input.modelId ?? null,
        proposalText: execution.outputText ?? null,
      });
      return {
        status: "COMPLETE",
        run,
        freshness: "current",
        payload: { rawOutput: execution.outputText ?? null },
      };
    }

    // A published prompt exists but couldn't actually run (missing API key,
    // provider not implemented, or a real provider error) — this is a
    // genuine ERROR, distinct from "no prompt configured at all" below.
    return { status: "ERROR", message: execution.error ?? "AI execution failed" };
  }

  if (!school.promptRef?.preparedPromptId) {
    // Persist a not-configured marker only when force=true — default just reports status
    // so opening tabs never writes junk. Explicit Analyze / Try Again may pass force.
    if (input.force) {
      const run = await saveAnalysisRun({
        leadName: input.leadName,
        leadLoca: input.leadLoca,
        schoolId,
        operation,
        conversationHash: conversation.hash,
        conversationChannel: conversation.channel,
        userInput: input.userInput,
        status: "not-configured",
        payload: { reason: "PROMPT_NOT_CONFIGURED" },
        targetMessageId: input.targetMessageId ?? null,
        promptVersionId: input.promptVersionId ?? promptVersion?.id ?? null,
        modelId: input.modelId ?? null,
      });
      return {
        status: "PROMPT_NOT_CONFIGURED",
        message: "Not configured",
        run,
        freshness: "no-data",
        payload: null,
      };
    }
    return {
      status: "PROMPT_NOT_CONFIGURED",
      message: "Not configured",
      freshness: "no-data",
      payload: null,
    };
  }

  // Future Story: call OpenAI with school.promptRef, then saveAnalysisRun(status: complete).
  return {
    status: "ERROR",
    message: "Prompt ref is set but OpenAI execution is not implemented yet",
  };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function getMessageCreatorBootstrap(
  leadName: string,
  leadLoca: string
): Promise<MessageCreatorBootstrap> {
  const schools = listMessageCreatorSchools();
  const promptVersions = listMessageCreatorPromptVersions();
  const models = listMessageCreatorModels();

  const [approach, proposals, reports, conversation, workoutsResult] = await Promise.all([
    getOrCreateApproachContext(leadLoca),
    getOrCreateMyProposals(leadLoca),
    listLeadReportsForCreator(leadName),
    getLeadConversationForCreator(leadName),
    getLeadMsgWorkoutsByLoca(leadLoca).catch(() => ({ workouts: [], error: null, notFound: true })),
  ]);

  const messages = conversation.body ? parseWhatsAppMessages(conversation.body) : [];
  const allRuns = await listAnalysisRuns(leadLoca, conversation.hash);
  const analysis = pickLatestAnalysisRuns(allRuns);
  const messageRunCounts = computeMessageRunCounts(allRuns);

  const registryPrompt = await findPublishedAiPrompt({
    actionType: OPERATION_TO_AI_PROMPT_ACTION_TYPE["full-analysis"],
    schoolId: schools[0]?.id,
  });
  const resolvedPrompt = registryPrompt
    ? {
        id: registryPrompt.id,
        slug: registryPrompt.slug,
        name: registryPrompt.name,
        publishedVersion: registryPrompt.publishedVersion,
      }
    : null;

  return {
    leadName,
    leadLoca,
    schools,
    promptVersions,
    models,
    approachContext: approach.text,
    proposals: proposals.text,
    proposalsImportedFromHistorical: proposals.importedFromHistorical,
    historicalYouSuggestion: proposals.historicalYouSuggestion,
    reports,
    conversation: {
      found: conversation.found,
      body: conversation.body,
      channel: conversation.channel,
      hash: conversation.hash,
      error: conversation.error,
      messages,
    },
    analysis,
    allRuns,
    messageRunCounts,
    resolvedPrompt,
    relatedWorkouts: (workoutsResult.workouts ?? [])
      .filter((w) => {
        if (w.logicalName === "my proposals") return false;
        if (parseAnalysisRunName(w.logicalName)) return false;
        return true;
      })
      .map((w) => ({
        logicalName: w.logicalName,
        loca: w.loca,
      })),
  };
}
