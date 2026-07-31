#!/usr/bin/env node
/**
 * Idempotent import of the console OpenAI stored prompt into a real user's
 * AI Prompts registry — same shape as Msg Auto → AI Prompts → OpenAI
 * Managed Prompt created via GUI (openai_managed + bindings), plus the
 * user-message template the stored prompt expects as `input`.
 *
 * Creates a **draft** (does NOT auto-publish). Re-run is a no-op when the
 * same slug or openaiPromptId already exists (checked against the target
 * user's own registry only — never scans other users' data).
 *
 * Every other dba write goes through `runWithRepoContext({ repoGuid,
 * username }, ...)` (see `repo-context.ts`) — `createAiPrompt`/
 * `getAiPrompt`/`listAiPrompts` all call `getCurrentRepoGuid()` internally
 * and throw outside that context. This script previously called them bare
 * at module scope, which is why running it never actually created a
 * record (immediate `getCurrentRepoGuid() called outside of a
 * request-scoped repo context` crash, exit 1, no write). Fixed by
 * resolving the target username's real `repoGuid` from the real
 * `chad_admin/users/users-list` (via `getUsersListBody()`, same source
 * `findUserByUsername` in the dashboard's login path reads — never
 * invented) and wrapping every call in `runWithRepoContext`, mirroring
 * `provision-google-viewer-secrets.mjs`'s existing pattern.
 *
 * Usage (repo context / env as for other DBA writes — e.g. run inside the
 * local-mac-docker dashboard container so DBA_PRIMARY_BACKEND/POSTGRES_URI/
 * MONGODB_URI match the running app exactly):
 *   pnpm --filter dba build
 *   pnpm --filter dba exec node scripts/import-console-openai-girl-prompt.mjs [username]
 *
 * [username] defaults to "pawel_f" (the real account that owns the console
 * CLI's data — see `human-docs/console/features/openai-prepared-prompt.md`
 * and `packages/console/src/openai/askOpenAiAboutGirl.ts`), never a shared/
 * global fallback — the record is created for exactly one real user.
 */

import yaml from "js-yaml";
import { createAiPrompt, getAiPrompt, listAiPrompts } from "../dist/ai-prompts.js";
import { runWithRepoContext } from "../dist/repo-context.js";
import { getUsersListBody } from "../dist/admin-users.js";

const CONSOLE_OPENAI_PROMPT_ID =
  "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217";
const CONSOLE_OPENAI_PROMPT_VERSION = "1";
const SLUG = "console-girl-openai-managed";
const TARGET_USERNAME = process.argv[2] || "pawel_f";

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

/**
 * Resolves `username`'s real `repoGuid` from the real
 * `chad_admin/users/users-list` — never guessed/hardcoded (same source of
 * truth `packages/dashboard/lib/user-service.ts`'s `findUserByUsername`
 * reads for login).
 */
async function resolveUser(username) {
  const body = await getUsersListBody();
  const doc = yaml.load(body || "");
  const users = doc?.users || [];
  const user = users.find((u) => u.username === username);
  if (!user?.repoGuid) {
    throw new Error(
      `No user "${username}" with a repoGuid found in chad_admin/users/users-list — refusing to guess.`,
    );
  }
  return { repoGuid: user.repoGuid, username };
}

async function main() {
  const target = await resolveUser(TARGET_USERNAME);
  console.log(`[import] target user=${target.username} repoGuid=${target.repoGuid}`);

  await runWithRepoContext(target, async () => {
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
      `[import] created draft id=${created.id} slug=${created.slug} for user=${target.username} — publish via AI Prompts UI when ready`,
    );
  });
}

main().catch((err) => {
  console.error("[import] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
