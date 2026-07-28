/**
 * Pure unit tests for `ai-prompts.ts` (Story 88) — CRUD, validation,
 * corrupt-JSON guard, draft/published filtering, and version increment,
 * exercised via an in-memory fake `ops` bundle (mirrors `folders.test.ts`'s
 * existing fake-provider pattern). No real Content Provider needed.
 */
import { describe, it, expect } from "vitest";
import {
  listAiPrompts,
  getAiPrompt,
  createAiPrompt,
  updateAiPrompt,
  publishAiPrompt,
  archiveAiPrompt,
  deleteAiPrompt,
  findPublishedAiPrompt,
  AiPromptsOperationError,
  type AiPromptsOps,
  type CreateAiPromptInput,
} from "./ai-prompts.js";
import type { CpItem } from "./cp-model.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function folderItem(address: string, name: string): CpItem {
  return { _id: address, config: { id: address, address, type: "Folder", name }, body: "" };
}

function textItem(address: string, name: string, body = ""): CpItem {
  return { _id: address, config: { id: address, address, type: "Text", name }, body };
}

/** In-memory fake ops bundle — a real find-or-create + real put, no I/O. */
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
      const created: CpItem = { _id: address, config: { id: address, address, type, name }, body: body ?? "" };
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

const baseInput: CreateAiPromptInput = {
  slug: "sd-pl-next-message",
  name: "Next Message — SD-PL",
  schoolId: "sd-pl",
  actionType: "next-message",
  provider: "openai",
  model: "gpt-4o",
  messages: [{ role: "user", content: "Write the next message for {{lead_name}}." }],
};

describe("listAiPrompts", () => {
  it("returns an empty list when msg-auto/ai prompts does not exist yet", async () => {
    const { ops } = fakeOps([]);
    expect(await listAiPrompts(ops)).toEqual([]);
  });
});

describe("createAiPrompt", () => {
  it("creates the msg-auto folder and ai prompts Text item lazily on first write", async () => {
    const { ops, items } = fakeOps([]);
    await createAiPrompt(baseInput, ops);

    const folder = [...items.values()].find((i) => i.config.name === "msg-auto");
    const textItemFound = [...items.values()].find((i) => i.config.name === "ai prompts");
    expect(folder?.config.type).toBe("Folder");
    expect(textItemFound?.config.type).toBe("Text");
  });

  it("starts a new prompt as draft, version 1", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    expect(created.status).toBe("draft");
    expect(created.version).toBe(1);
    expect(created.publishedVersion).toBeUndefined();
  });

  it("writes and re-reads the same prompt", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    const fetched = await getAiPrompt(created.id, ops);
    expect(fetched?.name).toBe(baseInput.name);
    expect(fetched?.messages).toEqual(baseInput.messages);
  });

  it("two prompts created in sequence do not overwrite each other", async () => {
    const { ops } = fakeOps([]);
    const a = await createAiPrompt(baseInput, ops);
    const b = await createAiPrompt({ ...baseInput, slug: "sd-pl-capital", name: "Capital", actionType: "capital" }, ops);
    const list = await listAiPrompts(ops);
    expect(list.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("blocks a duplicate slug", async () => {
    const { ops } = fakeOps([]);
    await createAiPrompt(baseInput, ops);
    await expect(createAiPrompt(baseInput, ops)).rejects.toMatchObject({ code: "DUPLICATE_SLUG" });
  });

  it("rejects an empty name", async () => {
    const { ops } = fakeOps([]);
    await expect(createAiPrompt({ ...baseInput, name: "  " }, ops)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects an empty slug", async () => {
    const { ops } = fakeOps([]);
    await expect(createAiPrompt({ ...baseInput, slug: "" }, ops)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a prompt with no non-empty message content", async () => {
    const { ops } = fakeOps([]);
    await expect(
      createAiPrompt({ ...baseInput, messages: [{ role: "user", content: "   " }] }, ops),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("updateAiPrompt", () => {
  it("updates only the targeted prompt, leaving siblings untouched", async () => {
    const { ops } = fakeOps([]);
    const a = await createAiPrompt(baseInput, ops);
    const b = await createAiPrompt({ ...baseInput, slug: "sd-pl-capital", name: "Capital", actionType: "capital" }, ops);

    const updatedA = await updateAiPrompt(a.id, { name: "Renamed" }, ops);
    expect(updatedA.name).toBe("Renamed");

    const untouchedB = await getAiPrompt(b.id, ops);
    expect(untouchedB?.name).toBe("Capital");
  });

  it("never changes status/version/publishedSnapshot on a draft edit", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    const published = await publishAiPrompt(created.id, ops);
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);

    const edited = await updateAiPrompt(created.id, { name: "New draft name" }, ops);
    expect(edited.status).toBe("published"); // updateAiPrompt never demotes/mutates status
    expect(edited.publishedSnapshot?.name).toBe("Next Message — SD-PL"); // frozen at publish time
    expect(edited.name).toBe("New draft name");
  });

  it("rejects updating a non-existent prompt", async () => {
    const { ops } = fakeOps([]);
    await expect(updateAiPrompt("nope", { name: "x" }, ops)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks renaming the slug to one already used by another prompt", async () => {
    const { ops } = fakeOps([]);
    const a = await createAiPrompt(baseInput, ops);
    await createAiPrompt({ ...baseInput, slug: "sd-pl-capital", name: "Capital", actionType: "capital" }, ops);
    await expect(updateAiPrompt(a.id, { slug: "sd-pl-capital" }, ops)).rejects.toMatchObject({
      code: "DUPLICATE_SLUG",
    });
  });
});

describe("corrupt JSON guard", () => {
  it("does not overwrite a corrupt body — throws CORRUPT_REGISTRY instead", async () => {
    const folder = folderItem(REPO, "root");
    const msgAuto = folderItem(`${REPO}/01`, "msg-auto");
    const aiPrompts = textItem(`${REPO}/01/01`, "ai prompts", "{ not valid json");
    const { ops, items } = fakeOps([folder, msgAuto, aiPrompts]);
    items.set(REPO, folder);

    await expect(listAiPrompts(ops)).rejects.toMatchObject({ code: "CORRUPT_REGISTRY" });
    // Body must remain exactly as it was — never silently replaced.
    expect(items.get(`${REPO}/01/01`)?.body).toBe("{ not valid json");
  });
});

describe("draft/published filtering + findPublishedAiPrompt", () => {
  it("does not resolve a draft prompt", async () => {
    const { ops } = fakeOps([]);
    await createAiPrompt(baseInput, ops);
    const resolved = await findPublishedAiPrompt({ actionType: "next-message", schoolId: "sd-pl" }, ops);
    expect(resolved).toBeNull();
  });

  it("resolves a published prompt matching actionType + schoolId", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    await publishAiPrompt(created.id, ops);
    const resolved = await findPublishedAiPrompt({ actionType: "next-message", schoolId: "sd-pl" }, ops);
    expect(resolved?.id).toBe(created.id);
  });

  it("stops resolving once archived", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    await publishAiPrompt(created.id, ops);
    await archiveAiPrompt(created.id, ops);
    const resolved = await findPublishedAiPrompt({ actionType: "next-message", schoolId: "sd-pl" }, ops);
    expect(resolved).toBeNull();
  });
});

describe("version increment", () => {
  it("increments version on each publish", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    expect(created.version).toBe(1);
    const p1 = await publishAiPrompt(created.id, ops);
    expect(p1.version).toBe(2);
    const p2 = await publishAiPrompt(created.id, ops);
    expect(p2.version).toBe(3);
  });
});

describe("repo context isolation", () => {
  it("ai-prompts.ts never accepts a repoGuid parameter — isolation is entirely the injected ops/data-router path", () => {
    // Static/API-shape assertion: every public function's signature (see imports
    // above) takes only business params + optional `ops`, matching
    // chad-user-data-isolation.md's rule that per-user scoping is exclusively
    // getCurrentRepoGuid()/runWithRepoContext, never a caller-supplied id.
    expect(createAiPrompt.length).toBeLessThanOrEqual(2);
    expect(listAiPrompts.length).toBeLessThanOrEqual(1);
  });
});

describe("promptKind mapping + conditional validation", () => {
  it("exposes stable kind values in AI_PROMPT_KIND_LABELS", async () => {
    const { AI_PROMPT_KIND_LABELS, normalizeAiPromptKind } = await import("./ai-prompts.js");
    expect(Object.keys(AI_PROMPT_KIND_LABELS).sort()).toEqual(["openai_managed", "our_custom"]);
    expect(AI_PROMPT_KIND_LABELS.our_custom).toBe("Our Custom Prompt");
    expect(AI_PROMPT_KIND_LABELS.openai_managed).toBe("OpenAI Managed Prompt");
    expect(normalizeAiPromptKind(undefined)).toBe("our_custom");
    expect(normalizeAiPromptKind("chad_custom")).toBe("our_custom");
    expect(normalizeAiPromptKind("openai_managed")).toBe("openai_managed");
  });

  it("defaults missing promptKind to our_custom on list", async () => {
    const { ops } = fakeOps([]);
    await createAiPrompt(baseInput, ops);
    const list = await listAiPrompts(ops);
    expect(list[0].promptKind).toBe("our_custom");
    expect(list[0].enabled).toBe(true);
  });

  it("our_custom allows empty prompt body (filled later in editor)", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(
      {
        ...baseInput,
        promptKind: "our_custom",
        messages: [],
      },
      ops,
    );
    expect(created.promptKind).toBe("our_custom");
    expect(created.messages).toEqual([]);
  });

  it("openai_managed requires OpenAI Prompt ID, not body", async () => {
    const { ops } = fakeOps([]);
    await expect(
      createAiPrompt(
        {
          ...baseInput,
          slug: "managed-1",
          promptKind: "openai_managed",
          messages: [],
          providerBindings: {},
        },
        ops,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const created = await createAiPrompt(
      {
        ...baseInput,
        slug: "managed-2",
        promptKind: "openai_managed",
        messages: [],
        providerBindings: { openaiPromptId: "pmpt_abc123" },
      },
      ops,
    );
    expect(created.promptKind).toBe("openai_managed");
    expect(created.providerBindings?.openaiPromptId).toBe("pmpt_abc123");
    expect(created.messages).toEqual([]);
  });

  it("switching update to openai_managed keeps name and sets binding", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    const updated = await updateAiPrompt(
      created.id,
      {
        promptKind: "openai_managed",
        providerBindings: { openaiPromptId: "pmpt_keep" },
        messages: [],
      },
      ops,
    );
    expect(updated.name).toBe(baseInput.name);
    expect(updated.promptKind).toBe("openai_managed");
    expect(updated.providerBindings?.openaiPromptId).toBe("pmpt_keep");
  });
});
describe("deleteAiPrompt", () => {
  it("removes the prompt from the registry", async () => {
    const { ops } = fakeOps([]);
    const created = await createAiPrompt(baseInput, ops);
    await deleteAiPrompt(created.id, ops);
    expect(await getAiPrompt(created.id, ops)).toBeNull();
    expect(await listAiPrompts(ops)).toEqual([]);
  });
});
