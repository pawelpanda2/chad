#!/usr/bin/env node
/**
 * Idempotent import of the console OpenAI stored prompt
 * (`askOpenAiAboutGirl.ts`) into the current user's AI Prompts registry.
 *
 * Creates a **draft** `openai_managed` prompt with actionType `full-analysis`
 * (does NOT auto-publish). Re-running is a no-op when the same
 * openaiPromptId or slug already exists.
 *
 * Usage (from repo root, with session env / POSTGRES or CP access as usual):
 *   pnpm --filter dba exec node scripts/import-console-openai-girl-prompt.mjs
 *
 * Requires CHAD repo context — typically run via a thin dashboard-authenticated
 * path or with the same env the dashboard uses for DBA writes. This script
 * alone does not invent a user; prefer creating via GUI when possible.
 *
 * Prefer GUI: Msg Auto → AI Prompts → New → OpenAI Managed Prompt, then set
 * ID/version and actionType full-analysis, Save, Publish.
 */

import {
  createAiPrompt,
  getAiPrompt,
  listAiPrompts,
  DEFAULT_CURRENT_CASE_USER_TEMPLATE,
} from "../dist/index.js";

const CONSOLE_OPENAI_PROMPT_ID =
  "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217";
const CONSOLE_OPENAI_PROMPT_VERSION = "1";
const SLUG = "console-girl-full-analysis";

async function main() {
  const existing = await listAiPrompts();
  for (const row of existing) {
    if (row.slug === SLUG) {
      console.log(`[import] already present slug=${SLUG} id=${row.id} — no-op`);
      return;
    }
    const full = await getAiPrompt(row.id);
    if (full?.providerBindings?.openaiPromptId === CONSOLE_OPENAI_PROMPT_ID) {
      console.log(
        `[import] already present openaiPromptId on id=${row.id} slug=${row.slug} — no-op`,
      );
      return;
    }
  }

  const created = await createAiPrompt({
    slug: SLUG,
    name: "Console girl full analysis (OpenAI stored)",
    description:
      "Imported from packages/console askOpenAiAboutGirl — OpenAI stored prompt. Publish after review.",
    actionType: "full-analysis",
    promptKind: "openai_managed",
    provider: "openai",
    messages: [{ role: "user", content: DEFAULT_CURRENT_CASE_USER_TEMPLATE }],
    variables: [
      { key: "leadName", required: true },
      { key: "report", required: false },
      { key: "conversation", required: true },
      { key: "question", required: true },
    ],
    settings: { summary: "auto", storeLogs: true },
    providerBindings: {
      openaiPromptId: CONSOLE_OPENAI_PROMPT_ID,
      openaiPromptVersion: CONSOLE_OPENAI_PROMPT_VERSION,
    },
  });

  console.log(
    `[import] created draft id=${created.id} slug=${created.slug} — publish via AI Prompts UI when ready`,
  );
}

main().catch((err) => {
  console.error("[import] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
