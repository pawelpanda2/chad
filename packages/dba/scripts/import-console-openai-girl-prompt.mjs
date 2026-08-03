#!/usr/bin/env node
/**
 * Idempotent import of the console OpenAI stored prompt into the AI Prompts
 * registry — same shape as Msg Auto → AI Prompts → openai published prompt
 * created via GUI (openai_managed + bindings), plus the user-message
 * template the stored prompt expects as `input`.
 *
 * **Amended (post Story 88):** AI Prompts is now a single global registry
 * shared by every logged-in user, always stored under the fixed
 * `chad_shared` repo (`CHAD_SHARED_REPO_GUID` in `knowledge.ts`) — see
 * `ai-prompts.ts`'s file-header doc comment for the full rationale. This
 * script no longer creates a per-user record: `createAiPrompt`/
 * `getAiPrompt`/`listAiPrompts` never read `[username]`'s own repo at all
 * — the `[username]` argument below is kept only so `runWithRepoContext`
 * has a real actor identity to best-effort stamp on the Postgres history
 * trigger; it has no bearing on where the created prompt is stored or who
 * can see it (everyone can, by design, at this stage).
 *
 * Creates a **draft** (does NOT auto-publish). Re-run is a no-op when the
 * same slug or openaiPromptId already exists in the shared registry.
 *
 * Usage (repo context / env as for other DBA writes — e.g. run inside the
 * local-mac-docker dashboard container so DBA_PRIMARY_BACKEND/POSTGRES_URI/
 * MONGODB_URI match the running app exactly):
 *   pnpm --filter dba build
 *   pnpm --filter dba exec node scripts/import-console-openai-girl-prompt.mjs [username]
 *
 * [username] defaults to "pawel_f" (the real account that owns the console
 * CLI's data — see `human-docs/console/features/openai-prepared-prompt.md`
 * and `packages/console/src/openai/askOpenAiAboutGirl.ts`) purely for the
 * actor-stamp resolution above; any valid username works identically.
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
      name: "first console",
      description: "first console prompt version",
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
