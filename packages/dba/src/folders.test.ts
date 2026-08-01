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
  updateFolderItemConfig,
  deleteFolderItem,
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
    async putItemConfig(item: CpItem) {
      const existing = [...items.values()].find((i) => i._id === item._id);
      const updated = { ...item, body: existing?.body ?? "" };
      items.set(updated.config.address, updated);
      return updated;
    },
    async deleteItemByAddress(address: string) {
      return items.delete(address);
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

describe("updateFolderItemConfig", () => {
  it("updates a safe custom field on a Text item, preserving body", async () => {
    const item = textItem(`${REPO}/01`, "notes", "existing body");
    const { ops } = fakeOps([item]);

    const updated = await updateFolderItemConfig(
      `${REPO}/01`,
      { ...item.config, tag: "important" },
      ops
    );

    expect(updated.config.tag).toBe("important");
    expect(updated.body).toBe("existing body");
  });

  it("updates a safe custom field on a Folder item, preserving body", async () => {
    const item = folderItem(`${REPO}/01`, "sub");
    const { ops } = fakeOps([item]);

    const updated = await updateFolderItemConfig(`${REPO}/01`, { ...item.config, tag: "x" }, ops);

    expect(updated.config.tag).toBe("x");
    expect(updated.body).toBe("");
  });

  it("removing a custom key from the submitted JSON removes it (full-object replace, not a patch)", async () => {
    const item: CpItem = {
      _id: `${REPO}/01`,
      config: { id: `${REPO}/01`, address: `${REPO}/01`, type: "Text", name: "notes", tag: "old" },
      body: "b",
    };
    const { ops } = fakeOps([item]);

    const { tag: _tag, ...withoutTag } = item.config;
    const updated = await updateFolderItemConfig(`${REPO}/01`, withoutTag, ops);

    expect(updated.config.tag).toBeUndefined();
  });

  it("rejects a non-object config (array)", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(updateFolderItemConfig(`${REPO}/01`, [], ops)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a null config", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(updateFolderItemConfig(`${REPO}/01`, null, ops)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a config missing a required field", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    const { name: _name, ...missingName } = item.config;
    await expect(updateFolderItemConfig(`${REPO}/01`, missingName, ops)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects changing id", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...item.config, id: "different" }, ops)
    ).rejects.toMatchObject({ code: "FORBIDDEN_IDENTITY_CHANGE" });
  });

  it("rejects changing address", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...item.config, address: `${REPO}/02` }, ops)
    ).rejects.toMatchObject({ code: "FORBIDDEN_IDENTITY_CHANGE" });
  });

  it("rejects changing type (Text -> Folder)", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...item.config, type: "Folder" }, ops)
    ).rejects.toMatchObject({ code: "FORBIDDEN_IDENTITY_CHANGE" });
  });

  it("allows renaming (name is display identity; address stays put)", async () => {
    const item = textItem(`${REPO}/01`, "starożytny rzym", "body stays");
    const parent = folderItem(REPO, "repo");
    const { ops, items } = fakeOps([parent, item]);

    const updated = await updateFolderItemConfig(
      `${REPO}/01`,
      { ...item.config, name: "Starożytny rzym" },
      ops
    );

    expect(updated.config.name).toBe("Starożytny rzym");
    expect(updated.config.address).toBe(`${REPO}/01`);
    expect(updated.body).toBe("body stays");
    expect(items.get(`${REPO}/01`)?.config.name).toBe("Starożytny rzym");
  });

  it("trims the new name on rename", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const parent = folderItem(REPO, "repo");
    const { ops } = fakeOps([parent, item]);

    const updated = await updateFolderItemConfig(
      `${REPO}/01`,
      { ...item.config, name: "  renamed  " },
      ops
    );

    expect(updated.config.name).toBe("renamed");
  });

  it("rejects a rename that collides with a sibling's name", async () => {
    const parent = folderItem(REPO, "repo");
    const a = textItem(`${REPO}/01`, "alpha");
    const b = textItem(`${REPO}/02`, "beta");
    const { ops } = fakeOps([parent, a, b]);

    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...a.config, name: "beta" }, ops)
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects an empty / path-like rename", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const parent = folderItem(REPO, "repo");
    const { ops } = fakeOps([parent, item]);

    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...item.config, name: "a/b" }, ops)
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects updating a non-existent item", async () => {
    const { ops } = fakeOps([]);
    await expect(
      updateFolderItemConfig(`${REPO}/99`, { id: "x", address: `${REPO}/99`, type: "Text", name: "n" }, ops)
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
  });
});

describe("deleteFolderItem", () => {
  it("deletes an existing Text item", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops, items } = fakeOps([item]);

    await deleteFolderItem(`${REPO}/01`, ops);

    expect(items.has(`${REPO}/01`)).toBe(false);
  });

  it("deletes an empty Folder", async () => {
    const folder = folderItem(`${REPO}/01`, "sub");
    const { ops, items } = fakeOps([folder]);

    await deleteFolderItem(`${REPO}/01`, ops);

    expect(items.has(`${REPO}/01`)).toBe(false);
  });

  it("rejects deleting a Folder that still has children", async () => {
    const folder = folderItem(`${REPO}/01`, "sub");
    const child = textItem(`${REPO}/01/01`, "child");
    const { ops, items } = fakeOps([folder, child]);

    await expect(deleteFolderItem(`${REPO}/01`, ops)).rejects.toMatchObject({
      code: "FOLDER_NOT_EMPTY",
    });
    expect(items.has(`${REPO}/01`)).toBe(true);
  });

  it("rejects deleting a non-existent item", async () => {
    const { ops } = fakeOps([]);
    await expect(deleteFolderItem(`${REPO}/99`, ops)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
});
