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
  moveFolderItem,
  validateChildName,
  validateChildType,
  buildFolderExport,
  exportFolderTree,
  parseFolderExportContent,
  parseFolderExportDepth,
  countFolderExportItems,
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
      if (existing) items.delete(existing.config.address);
      const updated = { ...item, body: existing?.body ?? "" };
      items.set(updated.config.address, updated);
      return updated;
    },
    async deleteItemByAddress(address: string) {
      return items.delete(address);
    },
    async moveItem(itemAddress: string, newParentAddress: string) {
      const subtree = [...items.values()].filter(
        (item) => item.config.address === itemAddress || item.config.address.startsWith(`${itemAddress}/`)
      );
      const root = subtree.find((item) => item.config.address === itemAddress);
      if (!root) throw new Error(`moveItem: no item at "${itemAddress}"`);

      const newRootAddress = `${newParentAddress}/${String(nextIndex++).padStart(2, "0")}`;
      let moved: CpItem | null = null;
      for (const item of subtree) {
        items.delete(item.config.address);
      }
      for (const item of subtree) {
        const rewrittenAddress = newRootAddress + item.config.address.slice(itemAddress.length);
        const updated: CpItem = { ...item, config: { ...item.config, address: rewrittenAddress } };
        items.set(rewrittenAddress, updated);
        if (item.config.address === itemAddress) moved = updated;
      }
      return moved!;
    },
    async readdressItem(itemAddress: string, newAddress: string) {
      const subtree = [...items.values()].filter(
        (item) => item.config.address === itemAddress || item.config.address.startsWith(`${itemAddress}/`)
      );
      const root = subtree.find((item) => item.config.address === itemAddress);
      if (!root) throw new Error(`readdressItem: no item at "${itemAddress}"`);

      let moved: CpItem | null = null;
      for (const item of subtree) {
        items.delete(item.config.address);
      }
      for (const item of subtree) {
        const rewrittenAddress = newAddress + item.config.address.slice(itemAddress.length);
        const updated: CpItem = { ...item, config: { ...item.config, address: rewrittenAddress } };
        items.set(rewrittenAddress, updated);
        if (item.config.address === itemAddress) moved = updated;
      }
      return moved!;
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

  it("allows changing address to a free sibling slot (and rewrites subtree)", async () => {
    const parent = folderItem(`${REPO}/14`, "parent");
    const folder = folderItem(`${REPO}/14/09`, "notes");
    const child = textItem(`${REPO}/14/09/01`, "child", "body stays");
    const { ops, items } = fakeOps([folderItem(REPO, "repo"), parent, folder, child]);

    const updated = await updateFolderItemConfig(
      `${REPO}/14/09`,
      { ...folder.config, address: `${REPO}/14/02` },
      ops
    );

    expect(updated.config.address).toBe(`${REPO}/14/02`);
    expect(items.has(`${REPO}/14/09`)).toBe(false);
    expect(items.get(`${REPO}/14/02/01`)?.body).toBe("body stays");
  });

  it("rejects changing address when the target slot is taken", async () => {
    const parent = folderItem(`${REPO}/14`, "parent");
    const a = textItem(`${REPO}/14/09`, "notes");
    const b = textItem(`${REPO}/14/02`, "other");
    const { ops } = fakeOps([folderItem(REPO, "repo"), parent, a, b]);

    await expect(
      updateFolderItemConfig(`${REPO}/14/09`, { ...a.config, address: `${REPO}/14/02` }, ops)
    ).rejects.toMatchObject({ code: "ADDRESS_TAKEN" });
  });

  it("rejects an invalid address format on config save", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([folderItem(REPO, "repo"), item]);
    await expect(
      updateFolderItemConfig(`${REPO}/01`, { ...item.config, address: `${REPO}/not-numeric` }, ops)
    ).rejects.toMatchObject({ code: "VALIDATION" });
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

  it("recursively deletes a Folder and its whole subtree when recursive=true", async () => {
    const folder = folderItem(`${REPO}/01`, "sub");
    const nested = folderItem(`${REPO}/01/01`, "nested");
    const child = textItem(`${REPO}/01/01/01`, "child");
    const sibling = textItem(`${REPO}/01/02`, "sib");
    const { ops, items } = fakeOps([folder, nested, child, sibling]);

    await deleteFolderItem(`${REPO}/01`, ops, { recursive: true });

    expect(items.has(`${REPO}/01`)).toBe(false);
    expect(items.has(`${REPO}/01/01`)).toBe(false);
    expect(items.has(`${REPO}/01/01/01`)).toBe(false);
    expect(items.has(`${REPO}/01/02`)).toBe(false);
  });

  it("rejects deleting a non-existent item", async () => {
    const { ops } = fakeOps([]);
    await expect(deleteFolderItem(`${REPO}/99`, ops)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
});

describe("moveFolderItem", () => {
  const REPO2 = "9f1c2a3b-0000-4444-8888-000000000000";

  it("moves an item (and its subtree) to a new parent, rewriting every descendant's address", async () => {
    const source = folderItem(`${REPO}/01`, "source");
    const moving = folderItem(`${REPO}/01/01`, "knowledge");
    const child = folderItem(`${REPO}/01/01/01`, "Verbal Game");
    const grandchild = textItem(`${REPO}/01/01/01/01`, "doc", "body");
    const target = folderItem(`${REPO}/02`, "tematy");
    const { ops, items } = fakeOps([source, moving, child, grandchild, target]);

    const result = await moveFolderItem(`${REPO}/01/01`, `${REPO}/02`, ops);

    expect(result.moved).toBe(true);
    expect(result.item.config.name).toBe("knowledge");
    expect(result.item.config.address.startsWith(`${REPO}/02/`)).toBe(true);
    expect(items.has(`${REPO}/01/01`)).toBe(false); // gone from the old address
    const newRoot = result.item.config.address;
    expect(items.has(`${newRoot}/01`)).toBe(true); // child followed
    expect(items.get(`${newRoot}/01`)?.config.name).toBe("Verbal Game");
    expect(items.has(`${newRoot}/01/01`)).toBe(true); // grandchild followed
    expect(items.get(`${newRoot}/01/01`)?.body).toBe("body");
  });

  it("is a no-op (moved: false, address unchanged) when the target is already the item's current parent", async () => {
    const parent = folderItem(`${REPO}/01`, "parent");
    const item = textItem(`${REPO}/01/01`, "notes");
    const { ops } = fakeOps([parent, item]);

    const result = await moveFolderItem(`${REPO}/01/01`, `${REPO}/01`, ops);

    expect(result.moved).toBe(false);
    expect(result.item.config.address).toBe(`${REPO}/01/01`);
  });

  it("rejects moving a non-existent item", async () => {
    const target = folderItem(`${REPO}/01`, "target");
    const { ops } = fakeOps([target]);
    await expect(moveFolderItem(`${REPO}/99`, `${REPO}/01`, ops)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });

  it("rejects moving the repo root item", async () => {
    const root = folderItem(REPO, "root");
    const target = folderItem(`${REPO}/01`, "target");
    const { ops } = fakeOps([root, target]);
    await expect(moveFolderItem(REPO, `${REPO}/01`, ops)).rejects.toMatchObject({
      code: "MOVE_ROOT_ITEM",
    });
  });

  it("rejects moving into a non-existent target", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const { ops } = fakeOps([item]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/99`, ops)).rejects.toMatchObject({
      code: "PARENT_NOT_FOUND",
    });
  });

  it("rejects moving into a Text item (not a Folder)", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const notAFolder = textItem(`${REPO}/02`, "also-text");
    const { ops } = fakeOps([item, notAFolder]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/02`, ops)).rejects.toMatchObject({
      code: "PARENT_NOT_FOLDER",
    });
  });

  it("rejects moving into a different repo", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const otherRepoFolder = folderItem(`${REPO2}/01`, "other-repo-folder");
    const { ops } = fakeOps([item, otherRepoFolder]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO2}/01`, ops)).rejects.toMatchObject({
      code: "MOVE_CROSS_REPO",
    });
  });

  it("rejects moving a Folder into its own subtree (would create a cycle)", async () => {
    const parent = folderItem(`${REPO}/01`, "parent");
    const child = folderItem(`${REPO}/01/01`, "child");
    const { ops } = fakeOps([parent, child]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/01/01`, ops)).rejects.toMatchObject({
      code: "MOVE_INTO_OWN_SUBTREE",
    });
  });

  it("rejects moving a Folder onto itself", async () => {
    const folder = folderItem(`${REPO}/01`, "self");
    const { ops } = fakeOps([folder]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/01`, ops)).rejects.toMatchObject({
      code: "MOVE_INTO_OWN_SUBTREE",
    });
  });

  it("rejects moving onto a target that already has a same-named child (never a silent overwrite)", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const target = folderItem(`${REPO}/02`, "target");
    const clash = textItem(`${REPO}/02/01`, "notes");
    const { ops } = fakeOps([item, target, clash]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/02`, ops)).rejects.toMatchObject({
      code: "MOVE_NAME_CONFLICT",
    });
  });

  it("rejects moving INTO a system folder (create-child side)", async () => {
    const item = textItem(`${REPO}/01`, "notes");
    const views = folderItem(`${REPO}/05`, "views");
    const daily = folderItem(`${REPO}/05/01`, "daily");
    const { ops } = fakeOps([item, views, daily]);
    await expect(moveFolderItem(`${REPO}/01`, `${REPO}/05/01`, ops)).rejects.toMatchObject({
      code: "SYSTEM_FOLDER_READ_ONLY",
    });
  });

  it("rejects moving OUT of a system folder (delete side)", async () => {
    const views = folderItem(`${REPO}/05`, "views");
    const daily = folderItem(`${REPO}/05/01`, "daily");
    const row = textItem(`${REPO}/05/01/01`, "some-row");
    const target = folderItem(`${REPO}/02`, "target");
    const { ops } = fakeOps([views, daily, row, target]);
    await expect(moveFolderItem(`${REPO}/05/01/01`, `${REPO}/02`, ops)).rejects.toMatchObject({
      code: "SYSTEM_FOLDER_READ_ONLY",
    });
  });
});

describe("parseFolderExportContent", () => {
  it("accepts exactly the three transport values", () => {
    expect(parseFolderExportContent("body")).toBe("body");
    expect(parseFolderExportContent("config")).toBe("config");
    expect(parseFolderExportContent("both")).toBe("both");
  });

  it("rejects anything else", () => {
    expect(parseFolderExportContent("body-l1")).toBeNull();
    expect(parseFolderExportContent("")).toBeNull();
    expect(parseFolderExportContent("BODY")).toBeNull();
  });
});

describe("parseFolderExportDepth", () => {
  it("accepts non-negative integers, including 0 (unlimited)", () => {
    expect(parseFolderExportDepth("0")).toBe(0);
    expect(parseFolderExportDepth("1")).toBe(1);
    expect(parseFolderExportDepth("99")).toBe(99);
  });

  it("rejects negative numbers, decimals, and garbage", () => {
    expect(parseFolderExportDepth("-1")).toBeNull();
    expect(parseFolderExportDepth("1.5")).toBeNull();
    expect(parseFolderExportDepth("NaN")).toBeNull();
    expect(parseFolderExportDepth("")).toBeNull();
    expect(parseFolderExportDepth("abc")).toBeNull();
    expect(parseFolderExportDepth("1e3")).toBeNull();
  });
});

describe("buildFolderExport / exportFolderTree", () => {
  /**
   * REPO/01 (Folder "docs")            <- export root for most tests
   *   REPO/01/01 (Text "readme", body "hello")
   *   REPO/01/02 (Folder "sub", config.tag = "custom")
   *     REPO/01/02/01 (Text "deep1", body "deepbody")
   *     REPO/01/02/10 (Text "deep10", body "deepbody10")
   *   REPO/01/03 (Folder "emptysub" — no children)
   *   REPO/01/10 (Text "z-item", body "zzz")            <- "10" sorts after "02" numerically, not lexicographically
   */
  function buildTree() {
    const root = folderItem(`${REPO}/01`, "docs");
    const readme = textItem(`${REPO}/01/01`, "readme", "hello");
    const sub = folderItem(`${REPO}/01/02`, "sub");
    sub.config.tag = "custom";
    const deep1 = textItem(`${REPO}/01/02/01`, "deep1", "deepbody");
    const deep10 = textItem(`${REPO}/01/02/10`, "deep10", "deepbody10");
    const emptysub = folderItem(`${REPO}/01/03`, "emptysub");
    const zItem = textItem(`${REPO}/01/10`, "z-item", "zzz");
    return fakeOps([root, readme, sub, deep1, deep10, emptysub, zItem]);
  }

  it("content=body, depth=1 (old 'body l1'): direct children only, no config, no children field, numeric order", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    const result = await buildFolderExport({ root, content: "body", depth: 1, getChildren: ops.getChildrenOf });

    expect(result.source).toEqual({ address: `${REPO}/01`, name: "docs", type: "Folder" });
    expect(result.content).toBe("body");
    expect(result.depth).toBe(1);
    expect(result.items.map((i) => i.index)).toEqual(["01", "02", "03", "10"]);
    expect(result.items.map((i) => i.name)).toEqual(["readme", "sub", "emptysub", "z-item"]);
    for (const item of result.items) {
      expect(item.config).toBeUndefined();
      expect(item.children).toBeUndefined();
    }
    const readmeItem = result.items.find((i) => i.name === "readme")!;
    expect(readmeItem).toMatchObject({ type: "Text", body: "hello" });
  });

  it("content=config, depth=2: config only (no body), direct children + their children", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    const result = await buildFolderExport({ root, content: "config", depth: 2, getChildren: ops.getChildrenOf });

    expect(result.content).toBe("config");
    expect(result.depth).toBe(2);

    const readmeItem = result.items.find((i) => i.name === "readme")!;
    expect(readmeItem.body).toBeUndefined();
    expect(readmeItem.config).toMatchObject({ type: "Text", name: "readme" });

    const subItem = result.items.find((i) => i.name === "sub")!;
    expect(subItem.children).toBeDefined();
    expect(subItem.children!.map((c) => c.index)).toEqual(["01", "10"]); // numeric, not lexicographic
    for (const grandchild of subItem.children!) {
      expect(grandchild.body).toBeUndefined();
      expect(grandchild.config).toBeDefined();
      // Grandchildren never carry their own `children` at depth=2 (would be depth 3).
      expect((grandchild as { children?: unknown }).children).toBeUndefined();
    }
  });

  it("content=both, depth=0 (unlimited): recurses past depth 2 to the actual bottom of the tree", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    const result = await buildFolderExport({ root, content: "both", depth: 0, getChildren: ops.getChildrenOf });

    expect(result.content).toBe("both");
    expect(result.depth).toBe(0);

    const subItem = result.items.find((i) => i.name === "sub")!;
    expect(subItem.body).toBeDefined();
    expect(subItem.config).toMatchObject({ type: "Folder", name: "sub", tag: "custom" });
    expect(subItem.children).toBeDefined();
    // depth=0 must not stop at the old depth-2 boundary — grandchildren
    // (leaf Text items here) still get a `children` field since they ARE
    // Folders-with-no-children would, but these are Text so none; the point
    // is "sub"'s own children were reached at all, past the old l2 cutoff.
    const deep1 = subItem.children!.find((c) => c.name === "deep1")!;
    expect(deep1.body).toBe("deepbody");
    expect(deep1.config).toMatchObject({ type: "Text", name: "deep1" });

    const readmeItem = result.items.find((i) => i.name === "readme")!;
    expect(readmeItem.body).toBe("hello");
    expect(readmeItem.config).toMatchObject({ type: "Text", name: "readme" });
  });

  it("an empty Folder exports items: []", async () => {
    const { ops } = fakeOps([folderItem(`${REPO}/01`, "docs")]);
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    const result = await buildFolderExport({ root, content: "body", depth: 1, getChildren: ops.getChildrenOf });

    expect(result.items).toEqual([]);
  });

  it("rejects exporting a Text item as the root", async () => {
    const { ops } = fakeOps([textItem(`${REPO}/01`, "notes", "hi")]);
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    await expect(
      buildFolderExport({ root, content: "body", depth: 1, getChildren: ops.getChildrenOf })
    ).rejects.toMatchObject({ code: "ROOT_NOT_FOLDER" });
  });

  it("throws EXPORT_LIMIT_EXCEEDED (not a silent truncation) past the item-count limit", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    await expect(
      buildFolderExport({ root, content: "body", depth: 1, getChildren: ops.getChildrenOf, maxItems: 2 })
    ).rejects.toMatchObject({ code: "EXPORT_LIMIT_EXCEEDED" });
  });

  it("throws EXPORT_LIMIT_EXCEEDED past the total body-size limit", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    await expect(
      buildFolderExport({ root, content: "body", depth: 1, getChildren: ops.getChildrenOf, maxBodyChars: 3 })
    ).rejects.toMatchObject({ code: "EXPORT_LIMIT_EXCEEDED" });
  });

  it("depth=2's item-count limit also accounts for grandchildren, not just direct children", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    // 4 direct children fit under a limit of 5, but depth=2 also pulls in
    // "sub"'s 2 grandchildren (6 total) — must still throw, not truncate.
    await expect(
      buildFolderExport({ root, content: "body", depth: 2, getChildren: ops.getChildrenOf, maxItems: 5 })
    ).rejects.toMatchObject({ code: "EXPORT_LIMIT_EXCEEDED" });
  });

  it("depth=0 (unlimited) still enforces the safety cap on a deep tree — does not just recurse forever", async () => {
    const { ops } = buildTree();
    const root = (await ops.getItemByAddress(`${REPO}/01`))!;

    // Same 6-item tree, cap of 5 — depth=0 must hit the same cap depth=2 does,
    // proving depth=0 only lifts the depth limit, never the safety cap.
    await expect(
      buildFolderExport({ root, content: "body", depth: 0, getChildren: ops.getChildrenOf, maxItems: 5 })
    ).rejects.toMatchObject({ code: "EXPORT_LIMIT_EXCEEDED" });
  });

  it("exportFolderTree resolves the root by address and reports itemCount (incl. nested)", async () => {
    const { ops } = buildTree();

    const { result, itemCount } = await exportFolderTree(`${REPO}/01`, "body", 2, ops);

    expect(itemCount).toBe(6); // 4 direct children + 2 grandchildren under "sub"
    expect(countFolderExportItems(result.items)).toBe(6);
  });

  it("exportFolderTree rejects a non-existent address", async () => {
    const { ops } = fakeOps([]);
    await expect(exportFolderTree(`${REPO}/99`, "body", 1, ops)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
});
