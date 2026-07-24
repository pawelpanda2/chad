/**
 * Message Creator (Story 84) — DBA public API.
 *
 * Approach context, my proposals, school config, versioned analysis runs,
 * conversation freshness (sha256), and the OpenAI action boundary
 * (PROMPT_NOT_CONFIGURED until mentor prompts are wired in a later Story).
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
}

export interface MessageCreatorBootstrap {
  leadName: string;
  leadLoca: string;
  schools: MessageCreatorSchool[];
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
  };
  analysis: AnalysisRunSummary[];
  relatedWorkouts: Array<{ logicalName: string; loca: string }>;
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
  schoolId: string;
  operation: MessageCreatorOperation;
  userInput?: string;
  force?: boolean;
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
    const body = serializeAnalysisRunBody({
      schemaVersion: 1,
      schoolId: input.schoolId,
      operation: input.operation,
      createdAt: new Date().toISOString(),
      conversationHash: input.conversationHash,
      conversationChannel: input.conversationChannel ?? undefined,
      leadName: input.leadName,
      userInput: input.userInput,
      status: input.status,
      payload: input.payload,
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
  const school = getMessageCreatorSchool(input.schoolId);
  if (!school || !school.enabled) {
    return { status: "UNKNOWN_SCHOOL", message: `Unknown or disabled school: ${input.schoolId}` };
  }

  const conversation = await getLeadConversationForCreator(input.leadName);
  if (!conversation.found || !conversation.body || !conversation.hash) {
    return {
      status: "NO_CONVERSATION",
      message: "No conversation found",
    };
  }

  if (!school.promptRef?.preparedPromptId) {
    // Persist a not-configured marker only when force=true — default just reports status
    // so opening tabs never writes junk. Explicit Analyze / Try Again may pass force.
    if (input.force) {
      const run = await saveAnalysisRun({
        leadName: input.leadName,
        leadLoca: input.leadLoca,
        schoolId: input.schoolId,
        operation: input.operation,
        conversationHash: conversation.hash,
        conversationChannel: conversation.channel,
        userInput: input.userInput,
        status: "not-configured",
        payload: { reason: "PROMPT_NOT_CONFIGURED" },
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
    message: "Prompt ref is set but OpenAI execution is not implemented in Story 84",
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

  const [approach, proposals, reports, conversation, workoutsResult] = await Promise.all([
    getOrCreateApproachContext(leadLoca),
    getOrCreateMyProposals(leadLoca),
    listLeadReportsForCreator(leadName),
    getLeadConversationForCreator(leadName),
    getLeadMsgWorkoutsByLoca(leadLoca).catch(() => ({ workouts: [], error: null, notFound: true })),
  ]);

  const allRuns = await listAnalysisRuns(leadLoca, conversation.hash);
  const analysis = pickLatestAnalysisRuns(allRuns);

  return {
    leadName,
    leadLoca,
    schools,
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
    },
    analysis,
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
