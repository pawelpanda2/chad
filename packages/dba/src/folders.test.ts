/**
 * Pure unit tests for `folders.ts` (Story 82) — the Folders write path's
 * validation/branching logic, exercised via an in-memory fake `ops` bundle
 * (mirrors `data-router.test.ts`'s existing fake-provider pattern). No real
 * Mongo/Postgres/CP needed: `createFolderChildItem`/`updateFolderTextBody`
 * accept an injectable `ops` parameter for exactly this purpose; production
 * call sites never pass one.
 */
import { describe, it, expect } from "vitest";
import {
  createFolderChildItem,
  updateFolderTextBody,
  validateChildName,
  validateChildType,
  FoldersOperationError,
  type FolderChildOps,
} from "./folders.js";
import type { CpItem } from "./cp-model.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function folderItem(address: string, name: string): CpItem {
  return { _id: address, config: { id: address, address, type: "Folder", name }, body: "" };
}

function textItem(address: string, name: string, body = ""): CpItem {
  return { _id: address, config: { id: address, address, type: "Text", name }, body };
}

/** In-memory fake ops bundle — a real find-or-create + real put, no I/O. */
function fakeOps(seed: CpItem[] = []): { ops: FolderChildOps; items: Map<string, CpItem> } {
  const items = new Map(seed.map((item) => [item.config.address, item]));
  let nextIndex = 1;

  const ops: FolderChildOps = {
    async getItemByAddress(address: string) {
      return items.get(address) ?? null;
    },
    async getChildrenOf(parentAddress: string) {
      const prefix = `${parentAddress}/`;
      return [...items.values()].filter(
        (item) => item.config.address.startsWith(prefix) && !item.config.address.slice(prefix.length).includes("/")
      );
    },
    async createOrGetChild(parent: CpItem, name: string, type: string, body?: string) {
      const existing = [...items.values()].find(
        (item) => item.config.address.startsWith(`${parent.config.address}/`) && item.config.name === name
      );
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

describe("validateChildName", () => {
  it("trims and returns a valid name", () => {
    expect(validateChildName("  hello  ")).toBe("hello");
  });

  it("rejects empty (or all-whitespace) names", () => {
    expect(() => validateChildName("")).toThrow(FoldersOperationError);
    expect(() => validateChildName("   ")).toThrow(FoldersOperationError);
  });

  it("rejects names containing '/'", () => {
    expect(() => validateChildName("a/b")).toThrow(FoldersOperationError);
  });

  it("rejects names containing '\\\\'", () => {
    expect(() => validateChildName("a\\b")).toThrow(FoldersOperationError);
  });

  it("rejects names containing '..'", () => {
    expect(() => validateChildName("..secret")).toThrow(FoldersOperationError);
  });

  it("preserves Polish characters", () => {
    expect(validateChildName("zażółć gęślą jaźń")).toBe("zażółć gęślą jaźń");
  });
});

describe("validateChildType", () => {
  it("accepts Text and Folder", () => {
    expect(validateChildType("Text")).toBe("Text");
    expect(validateChildType("Folder")).toBe("Folder");
  });

  it("rejects Ref (not implemented per task instructions)", () => {
    expect(() => validateChildType("Ref")).toThrow(FoldersOperationError);
  });

  it("rejects unknown types", () => {
    expect(() => validateChildType("Banana")).toThrow(FoldersOperationError);
  });
});

describe("createFolderChildItem", () => {
  it("creates a new Text child under a Folder parent", async () => {
    const parent = folderItem(REPO, "root");
    const { ops } = fakeOps([parent]);

    const result = await createFolderChildItem(REPO, "notes", "Text", "hello world", ops);

    expect(result.alreadyExisted).toBe(false);
    expect(result.item.config.type).toBe("Text");
    expect(result.item.config.name).toBe("notes");
    expect(result.item.body).toBe("hello world");
  });

  it("creates a new Folder child under a Folder parent", async () => {
    const parent = folderItem(REPO, "root");
    const { ops } = fakeOps([parent]);

    const result = await createFolderChildItem(REPO, "subfolder", "Folder", undefined, ops);

    expect(result.alreadyExisted).toBe(false);
    expect(result.item.config.type).toBe("Folder");
  });

  it("find-or-create: a second call with the same name returns the existing item, alreadyExisted true", async () => {
    const parent = folderItem(REPO, "root");
    const { ops } = fakeOps([parent]);

    const first = await createFolderChildItem(REPO, "dup", "Text", "v1", ops);
    const second = await createFolderChildItem(REPO, "dup", "Text", "v2 (ignored)", ops);

    expect(first.alreadyExisted).toBe(false);
    expect(second.alreadyExisted).toBe(true);
    expect(second.item.config.address).toBe(first.item.config.address);
    expect(second.item.body).toBe("v1"); // find-or-create never overwrites on collision
  });

  it("rejects an empty/whitespace name", async () => {
    const parent = folderItem(REPO, "root");
    const { ops } = fakeOps([parent]);
    await expect(createFolderChildItem(REPO, "   ", "Text", undefined, ops)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects an unsupported type", async () => {
    const parent = folderItem(REPO, "root");
    const { ops } = fakeOps([parent]);
    await expect(createFolderChildItem(REPO, "x", "Ref", undefined, ops)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a missing parent", async () => {
    const { ops } = fakeOps([]);
    await expect(createFolderChildItem(REPO, "x", "Text", undefined, ops)).rejects.toMatchObject({
      code: "PARENT_NOT_FOUND",
    });
  });

  it("rejects a parent that is not a Folder", async () => {
    const parent = textItem(REPO, "root");
    const { ops } = fakeOps([parent]);
    await expect(createFolderChildItem(REPO, "x", "Text", undefined, ops)).rejects.toMatchObject({
      code: "PARENT_NOT_FOLDER",
    });
  });
});

describe("updateFolderTextBody", () => {
  it("updates an existing Text item's body", async () => {
    const item = textItem(`${REPO}/01`, "notes", "old body");
    const { ops } = fakeOps([item]);

    const updated = await updateFolderTextBody(`${REPO}/01`, "new body", ops);

    expect(updated.body).toBe("new body");
  });

  it("preserves multi-line, Polish-character bodies", async () => {
    const item = textItem(`${REPO}/01`, "notes", "");
    const { ops } = fakeOps([item]);
    const body = "linia 1\nzażółć gęślą jaźń\nlinia 3";

    const updated = await updateFolderTextBody(`${REPO}/01`, body, ops);

    expect(updated.body).toBe(body);
  });

  it("rejects updating a non-existent item", async () => {
    const { ops } = fakeOps([]);
    await expect(updateFolderTextBody(`${REPO}/99`, "x", ops)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });

  it("rejects updating a Folder (its Body is a computed children map, not real content)", async () => {
    const folder = folderItem(`${REPO}/01`, "sub");
    const { ops } = fakeOps([folder]);
    await expect(updateFolderTextBody(`${REPO}/01`, "x", ops)).rejects.toMatchObject({
      code: "NOT_TEXT_ITEM",
    });
  });
});
