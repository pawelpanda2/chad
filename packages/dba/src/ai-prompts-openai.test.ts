/**
 * Unit tests for OpenAI stored-prompt request building + current_case template
 * (console ↔ Dashboard AI Prompts parity).
 */
import { describe, it, expect } from "vitest";
import {
  buildOpenAiStoredPromptCreateParams,
  substituteVariables,
  resolveAiPromptUserContent,
  DEFAULT_CURRENT_CASE_USER_TEMPLATE,
  DEFAULT_FULL_ANALYSIS_QUESTION,
} from "./ai-prompts-openai.js";
import {
  createAiPrompt,
  publishAiPrompt,
  updateAiPrompt,
  findPublishedAiPrompt,
  type AiPromptsOps,
  type CreateAiPromptInput,
} from "./ai-prompts.js";
import type { CpItem } from "./cp-model.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function folderItem(address: string, name: string): CpItem {
  return { _id: address, config: { id: address, address, type: "Folder", name }, body: "" };
}

function fakeOps(seed: CpItem[] = []): { ops: AiPromptsOps; items: Map<string, CpItem> } {
  const items = new Map(seed.map((item) => [item.config.address, item]));
  let nextIndex = seed.length + 1;

  function findChild(parentAddress: string, name: string): CpItem | undefined {
    return [...items.values()].find(
      (item) => item.config.address.startsWith(`${parentAddress}/`) && item.config.name === name,
    );
  }

  const ops: AiPromptsOps = {
    async findOrCreateFolderChain(names: string[]) {
      let parent: CpItem = items.get(REPO) ?? folderItem(REPO, "root");
      if (!items.has(REPO)) items.set(REPO, parent);
      for (const name of names) {
        const existing = findChild(parent.config.address, name);
        if (existing) {
          parent = existing;
          continue;
        }
        const address = `${parent.config.address}/${String(nextIndex++).padStart(2, "0")}`;
        const created = folderItem(address, name);
        items.set(address, created);
        parent = created;
      }
      return parent;
    },
    async createOrGetChild(parent: CpItem, name: string, type: string, body?: string) {
      const existing = findChild(parent.config.address, name);
      if (existing) return existing;
      const address = `${parent.config.address}/${String(nextIndex++).padStart(2, "0")}`;
      const created: CpItem = {
        _id: address,
        config: { id: address, address, type, name },
        body: body ?? "",
      };
      items.set(address, created);
      return created;
    },
    async putItemBody(address: string, body: string) {
      const existing = items.get(address);
      if (!existing) throw new Error(`putItemBody: no item at "${address}"`);
      const updated = { ...existing, body };
      items.set(address, updated);
      return updated;
    },
  };

  return { ops, items };
}

const baseManaged: CreateAiPromptInput = {
  slug: "console-girl-full-analysis",
  name: "Console girl",
  actionType: "full-analysis",
  promptKind: "openai_managed",
  provider: "openai",
  messages: [{ role: "user", content: DEFAULT_CURRENT_CASE_USER_TEMPLATE }],
  settings: { summary: "auto", storeLogs: true },
  providerBindings: {
    openaiPromptId: "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217",
    openaiPromptVersion: "1",
  },
};

describe("ai-prompts-openai — stored prompt request", () => {
  it("builds Responses create params with id, version, message-array input, settings", () => {
    const vars = {
      leadName: "Ada",
      report: "rep-body",
      conversation: "hi",
      question: DEFAULT_FULL_ANALYSIS_QUESTION,
    };
    const params = buildOpenAiStoredPromptCreateParams(
      {
        id: "x",
        slug: "s",
        name: "n",
        actionType: "full-analysis",
        status: "draft",
        version: 1,
        messages: [{ role: "user", content: DEFAULT_CURRENT_CASE_USER_TEMPLATE }],
        variables: [],
        provider: "openai",
        settings: { summary: "auto", storeLogs: true },
        providerBindings: {
          openaiPromptId: "pmpt_abc",
          openaiPromptVersion: "1",
        },
        createdAt: "",
        updatedAt: "",
      },
      vars,
    );

    expect(params.prompt).toEqual({ id: "pmpt_abc", version: "1" });
    expect(params.input).toEqual([{ role: "user", content: expect.stringContaining("name: Ada") }]);
    expect(params.input[0].content).toContain("rep-body");
    expect(params.input[0].content).toContain("my_question:");
    expect(params.reasoning).toEqual({ summary: "auto" });
    expect(params.store).toBe(true);
    expect(params.include).toEqual(["web_search_call.action.sources"]);
    expect(JSON.stringify(params)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("substitutes current_case template variables", () => {
    const out = substituteVariables(DEFAULT_CURRENT_CASE_USER_TEMPLATE, {
      leadName: "X",
      report: "R",
      conversation: "C",
      question: "Q",
    });
    expect(out).toContain("name: X");
    expect(out).toContain("R");
    expect(out).toContain("C");
    expect(out).toContain("Q");
  });

  it("falls back to DEFAULT_CURRENT_CASE when messages empty", () => {
    const content = resolveAiPromptUserContent(
      {
        id: "x",
        slug: "s",
        name: "n",
        actionType: "full-analysis",
        status: "draft",
        version: 1,
        messages: [],
        variables: [],
        provider: "openai",
        providerBindings: { openaiPromptId: "pmpt_x" },
        createdAt: "",
        updatedAt: "",
      },
      { leadName: "L", report: "", conversation: "c", question: "q" },
    );
    expect(content).toContain("<current_case>");
    expect(content).toContain("name: L");
  });
});

describe("findPublishedAiPrompt — draft isolation after publish", () => {
  it("executes frozen snapshot, not later draft edits", async () => {
    const { ops } = fakeOps();
    const created = await createAiPrompt(baseManaged, ops);
    await publishAiPrompt(created.id, ops);

    await updateAiPrompt(
      created.id,
      {
        providerBindings: {
          openaiPromptId: "pmpt_DRAFT_ONLY",
          openaiPromptVersion: "99",
        },
      },
      ops,
    );

    const resolved = await findPublishedAiPrompt({ actionType: "full-analysis" }, ops);
    expect(resolved).not.toBeNull();
    expect(resolved!.providerBindings?.openaiPromptId).toBe(
      "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217",
    );
    expect(resolved!.providerBindings?.openaiPromptVersion).toBe("1");
  });

  it("exact schoolId match then school-agnostic fallback; draft never resolves", async () => {
    const { ops } = fakeOps();
    const draft = await createAiPrompt(
      { ...baseManaged, slug: "draft-only", name: "Draft" },
      ops,
    );
    expect(await findPublishedAiPrompt({ actionType: "full-analysis" }, ops)).toBeNull();

    const school = await createAiPrompt(
      {
        ...baseManaged,
        slug: "school-sd",
        name: "School",
        schoolId: "sd-pl",
        providerBindings: { openaiPromptId: "pmpt_school", openaiPromptVersion: "1" },
      },
      ops,
    );
    await publishAiPrompt(school.id, ops);

    const global = await createAiPrompt(
      {
        ...baseManaged,
        slug: "global-fa",
        name: "Global",
        providerBindings: { openaiPromptId: "pmpt_global", openaiPromptVersion: "1" },
      },
      ops,
    );
    await publishAiPrompt(global.id, ops);

    const forSchool = await findPublishedAiPrompt(
      { actionType: "full-analysis", schoolId: "sd-pl" },
      ops,
    );
    expect(forSchool!.providerBindings?.openaiPromptId).toBe("pmpt_school");

    const forOther = await findPublishedAiPrompt(
      { actionType: "full-analysis", schoolId: "other" },
      ops,
    );
    expect(forOther!.providerBindings?.openaiPromptId).toBe("pmpt_global");

    expect(draft.status).toBe("draft");
  });
});
