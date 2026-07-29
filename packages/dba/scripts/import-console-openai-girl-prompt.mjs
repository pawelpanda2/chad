#!/usr/bin/env node
/**
 * Idempotent import of the console OpenAI stored prompt into the current
 * user's AI Prompts registry — same shape as Msg Auto → AI Prompts →
 * OpenAI Managed Prompt created via GUI (openai_managed + bindings),
 * plus the user-message template the stored prompt expects as `input`.
 *
 * Creates a **draft** (does NOT auto-publish). Re-run is a no-op when the
 * same slug or openaiPromptId already exists.
 *
 * Usage (repo context / env as for other DBA writes):
 *   pnpm --filter dba build
 *   pnpm --filter dba exec node scripts/import-console-openai-girl-prompt.mjs
 */

import { createAiPrompt, getAiPrompt, listAiPrompts } from "../dist/index.js";

const CONSOLE_OPENAI_PROMPT_ID =
  "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217";
const CONSOLE_OPENAI_PROMPT_VERSION = "1";
const SLUG = "console-girl-openai-managed";

/** Same user-input template the console builds for this stored prompt. */
const USER_INPUT_TEMPLATE = `<current_case>

name: {{leadName}}

report:
{{report}}

conversation:
{{conversation}}

my_question:
{{question}}

</current_case>`;

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

  // Mirrors AiPromptManagedForm create payload (actionType "custom") plus
  // the input template and settings the Responses call needs.
  const created = await createAiPrompt({
    slug: SLUG,
    name: "Console girl (OpenAI managed)",
    description:
      "OpenAI stored prompt from console askOpenAiAboutGirl. Same fields as GUI managed prompt.",
    actionType: "custom",
    promptKind: "openai_managed",
    provider: "openai",
    messages: [{ role: "user", content: USER_INPUT_TEMPLATE }],
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
