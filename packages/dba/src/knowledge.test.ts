/**
 * Story 96 — Knowledge tree mapper tests (pure, fake-ops-based, no real
 * DB — same seam pattern as `folders.test.ts`). Story 109 follow-up:
 * `getKnowledgeCategory`/`getKnowledgeDocument`'s fixed 2-level
 * category/section/document shape was replaced by a generic, arbitrary-depth
 * `getKnowledgeFolder`/`getKnowledgeDocument(categorySlug, pathSlugs)` walk —
 * real knowledge trees are not a fixed shape (some go 5+ levels deep).
 * Covers: empty states, tile mapping, arbitrary-depth folder listing,
 * CP-order preservation, document body, slug safety (traversal / invalid
 * identifiers / duplicates), controlled not-found, and idempotent ensure of
 * the shared root.
 */

import { describe, it, expect } from "vitest";
import {
  CHAD_SHARED_REPO_GUID,
  KnowledgeError,
  KnowledgeWriteError,
  assertValidKnowledgeSlug,
  slugifyKnowledgeName,
  assignUniqueSlugs,
  listKnowledgeCategories,
  getKnowledgeFolder,
  getKnowledgeDocument,
  updateKnowledgeDocumentBody,
  ensureSharedKnowledgeRoot,
  type KnowledgeOps,
} from "./knowledge.js";
import type { CpItem } from "./cp-model.js";
import { nextChildIndexFromSiblings } from "./cp-model.js";
import { runWithRepoContext } from "./repo-context.js";

/** In-memory CP fixture implementing the KnowledgeOps seam. */
function makeFakeOps(initialItems: CpItem[] = []) {
  const items: CpItem[] = [...initialItems];
  let idCounter = 0;

  const byNumericAddress = (a: CpItem, b: CpItem) =>
    a.config.address.localeCompare(b.config.address, undefined, { numeric: true });

  const ops: KnowledgeOps = {
    getItemByAddress: async (address) =>
      items.find((item) => item.config.address === address) ?? null,
    getChildrenOf: async (parentAddress) =>
      items
        .filter((item) => {
          const prefix = `${parentAddress}/`;
          if (!item.config.address.startsWith(prefix)) return false;
          return !item.config.address.slice(prefix.length).includes("/");
        })
        .sort(byNumericAddress),
    createOrGetChild: async (parent, name, type, body) => {
      const siblings = await ops.getChildrenOf(parent.config.address);
      const existing = siblings.find((child) => child.config.name === name);
      if (existing) return existing;
      const index = nextChildIndexFromSiblings(
        parent.config.address,
        siblings.map((s) => s.config.address)
      );
      const address = `${parent.config.address}/${index}`;
      const id = `fake-id-${++idCounter}`;
      const item: CpItem = { _id: id, config: { id, address, type, name }, body: body ?? "" };
      items.push(item);
      return item;
    },
    putItem: async (item) => {
      const existingIndex = items.findIndex((i) => i.config.address === item.config.address);
      if (existingIndex >= 0) items[existingIndex] = item;
      else items.push(item);
      return item;
    },
  };

  return { ops, items };
}

function folder(address: string, name: string): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Folder", name }, body: "" };
}

function text(address: string, name: string, body = ""): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Text", name }, body };
}

const ROOT = CHAD_SHARED_REPO_GUID;

/** chad_shared root + knowledge folder at <root>/01. */
function baseTree(): CpItem[] {
  return [folder(ROOT, "chad_shared"), folder(`${ROOT}/01`, "knowledge")];
}

describe("slugifyKnowledgeName", () => {
  it("lowercases, dashes and strips Polish diacritics", () => {
    expect(slugifyKnowledgeName("Verbal Game")).toBe("verbal-game");
    expect(slugifyKnowledgeName("Ćwiczenia solo")).toBe("cwiczenia-solo");
    expect(slugifyKnowledgeName("Historie i opowiadanie")).toBe("historie-i-opowiadanie");
    expect(slugifyKnowledgeName("Zażółć gęślą jaźń / łąka")).toBe("zazolc-gesla-jazn-laka");
  });

  it("returns empty string for names with no usable characters", () => {
    expect(slugifyKnowledgeName("???")).toBe("");
  });
});

describe("assertValidKnowledgeSlug", () => {
  it.each(["../etc", "a/b", "a\\b", "..", "", "UPPER", "ż", "a b", "-leading"])(
    "rejects unsafe/invalid slug %j",
    (slug) => {
      expect(() => assertValidKnowledgeSlug(slug as string)).toThrowError(KnowledgeError);
    }
  );

  it("accepts plain lowercase slugs", () => {
    expect(() => assertValidKnowledgeSlug("verbal-game")).not.toThrow();
    expect(() => assertValidKnowledgeSlug("a1")).not.toThrow();
  });
});

describe("assignUniqueSlugs", () => {
  it("disambiguates duplicate names with the CP index, keeping both reachable", () => {
    const slugged = assignUniqueSlugs([
      folder(`${ROOT}/01/01`, "Same Name"),
      folder(`${ROOT}/01/02`, "Same Name"),
    ]);
    expect(slugged[0].slug).toBe("same-name");
    expect(slugged[1].slug).toBe("same-name-02");
  });

  it("falls back to the CP index when a name slugifies to nothing", () => {
    const slugged = assignUniqueSlugs([folder(`${ROOT}/01/03`, "???")]);
    expect(slugged[0].slug).toBe("item-03");
  });
});

describe("listKnowledgeCategories", () => {
  it("returns [] when the chad_shared repo does not exist (empty state, not an error)", async () => {
    const { ops } = makeFakeOps([]);
    expect(await listKnowledgeCategories(ops)).toEqual([]);
  });

  it("returns [] when knowledge exists but has no children", async () => {
    const { ops } = makeFakeOps(baseTree());
    expect(await listKnowledgeCategories(ops)).toEqual([]);
  });

  it("maps two Folder children to two tiles, preserving CP order (not alphabetical)", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/01/01`, "Zeta Category"),
      folder(`${ROOT}/01/02`, "Alpha Category"),
    ]);
    expect(await listKnowledgeCategories(ops)).toEqual([
      { slug: "zeta-category", name: "Zeta Category", source: "shared" },
      { slug: "alpha-category", name: "Alpha Category", source: "shared" },
    ]);
  });

  it("ignores a stray Text item directly under knowledge", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      text(`${ROOT}/01/01`, "not a category"),
      folder(`${ROOT}/01/02`, "Real Category"),
    ]);
    const categories = await listKnowledgeCategories(ops);
    expect(categories).toEqual([{ slug: "real-category", name: "Real Category", source: "shared" }]);
  });
});

describe("getKnowledgeFolder", () => {
  const tree = [
    ...baseTree(),
    folder(`${ROOT}/01/01`, "Verbal Game"),
    folder(`${ROOT}/01/01/01`, "Podstawy rozmowy"),
    text(`${ROOT}/01/01/01/01`, "Zeta doc", "zeta body"),
    text(`${ROOT}/01/01/01/02`, "Alpha doc", "alpha body"),
    folder(`${ROOT}/01/01/02`, "Pusta sekcja"),
  ];

  it("the category itself (pathSlugs: []) lists its direct children, Folders and Text mixed, CP order preserved", async () => {
    const { ops } = makeFakeOps(tree);
    const view = await getKnowledgeFolder("verbal-game", [], ops);
    expect(view.kind).toBe("folder");
    expect(view.name).toBe("Verbal Game");
    expect(view.source).toBe("shared");
    expect(view.children).toEqual([
      { slug: "podstawy-rozmowy", name: "Podstawy rozmowy", type: "Folder" },
      { slug: "pusta-sekcja", name: "Pusta sekcja", type: "Folder" },
    ]);
  });

  it("descends one level via pathSlugs to list a nested Folder's own children", async () => {
    const { ops } = makeFakeOps(tree);
    const view = await getKnowledgeFolder("verbal-game", ["podstawy-rozmowy"], ops);
    expect(view.name).toBe("Podstawy rozmowy");
    // CP order preserved (Zeta at index 01 before Alpha at 02, not alphabetical).
    expect(view.children).toEqual([
      { slug: "zeta-doc", name: "Zeta doc", type: "Text" },
      { slug: "alpha-doc", name: "Alpha doc", type: "Text" },
    ]);
  });

  it("returns an empty children list for a folder with no children", async () => {
    const { ops } = makeFakeOps(tree);
    const view = await getKnowledgeFolder("verbal-game", ["pusta-sekcja"], ops);
    expect(view.children).toEqual([]);
  });

  it("goes arbitrarily deep (4+ levels) — real trees are not a fixed 2-level shape", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/01/01`, "Cat"),
      folder(`${ROOT}/01/01/01`, "L1"),
      folder(`${ROOT}/01/01/01/01`, "L2"),
      folder(`${ROOT}/01/01/01/01/01`, "L3"),
      text(`${ROOT}/01/01/01/01/01/01`, "Deep doc", "deep body"),
    ]);
    const view = await getKnowledgeFolder("cat", ["l1", "l2", "l3"], ops);
    expect(view.name).toBe("L3");
    expect(view.children).toEqual([{ slug: "deep-doc", name: "Deep doc", type: "Text" }]);
    expect(view.breadcrumb.map((b) => b.name)).toEqual(["Cat", "L1", "L2", "L3"]);
  });

  it("breadcrumb for the category itself is just the category, once", async () => {
    const { ops } = makeFakeOps(tree);
    const view = await getKnowledgeFolder("verbal-game", [], ops);
    expect(view.breadcrumb).toEqual([{ slug: "verbal-game", name: "Verbal Game" }]);
  });

  it("throws CATEGORY_NOT_FOUND for an unknown category slug", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeFolder("no-such-category", [], ops)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
  });

  it("throws INVALID_SLUG before any lookup for a traversal-style slug", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeFolder("../../secrets", [], ops)).rejects.toMatchObject({
      code: "INVALID_SLUG",
    });
    await expect(getKnowledgeFolder("verbal-game", ["../../secrets"], ops)).rejects.toMatchObject({
      code: "INVALID_SLUG",
    });
  });

  it("throws NODE_NOT_FOUND for an unresolvable path segment", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeFolder("verbal-game", ["nope"], ops)).rejects.toMatchObject({
      code: "NODE_NOT_FOUND",
    });
  });

  it("throws NODE_NOT_FOUND when a path segment tries to descend into a Text item (dead end)", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(
      getKnowledgeFolder("verbal-game", ["podstawy-rozmowy", "zeta-doc", "anything"], ops)
    ).rejects.toMatchObject({ code: "NODE_NOT_FOUND" });
  });

  it("throws NODE_NOT_FOUND when the resolved node is a Text item, not a Folder", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeFolder("verbal-game", ["podstawy-rozmowy", "zeta-doc"], ops)).rejects.toMatchObject({
      code: "NODE_NOT_FOUND",
    });
  });
});

describe("getKnowledgeDocument", () => {
  const tree = [
    ...baseTree(),
    folder(`${ROOT}/01/01`, "Verbal Game"),
    folder(`${ROOT}/01/01/01`, "Sekcja A"),
    text(`${ROOT}/01/01/01/01`, "Mój dokument", "prawdziwa treść body"),
  ];

  it("returns the document's name, body and breadcrumb", async () => {
    const { ops } = makeFakeOps(tree);
    const doc = await getKnowledgeDocument("verbal-game", ["sekcja-a", "moj-dokument"], ops);
    expect(doc.kind).toBe("document");
    expect(doc.name).toBe("Mój dokument");
    expect(doc.body).toBe("prawdziwa treść body");
    expect(doc.source).toBe("shared");
    expect(doc.breadcrumb.map((b) => b.name)).toEqual(["Verbal Game", "Sekcja A"]);
  });

  it("throws DOCUMENT_NOT_FOUND for an empty path", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", [], ops)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_FOUND",
    });
  });

  it("throws DOCUMENT_NOT_FOUND when the resolved node is a Folder, not a document", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", ["sekcja-a"], ops)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_FOUND",
    });
  });

  it("throws NODE_NOT_FOUND for an unknown path segment (controlled 404, no address leak)", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", ["sekcja-a", "nope"], ops)).rejects.toMatchObject({
      code: "NODE_NOT_FOUND",
    });
  });

  it("throws INVALID_SLUG for an unsafe path segment", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", ["sekcja-a", "a/b"], ops)).rejects.toMatchObject({
      code: "INVALID_SLUG",
    });
  });

  it("sees an item added later (no static GROUPS anywhere — data comes from the ops layer)", async () => {
    const { ops, items } = makeFakeOps(tree);
    items.push(text(`${ROOT}/01/01/01/02`, "Nowy dokument", "dodany później"));
    const view = await getKnowledgeFolder("verbal-game", ["sekcja-a"], ops);
    expect(view.children.map((c) => c.name)).toContain("Nowy dokument");
  });
});

describe("updateKnowledgeDocumentBody", () => {
  const tree = [
    ...baseTree(),
    folder(`${ROOT}/01/01`, "Verbal Game"),
    folder(`${ROOT}/01/01/01`, "Sekcja A"),
    text(`${ROOT}/01/01/01/01`, "Mój dokument", "stara treść"),
  ];

  it("overwrites a shared document's body when allowSharedWrite is true", async () => {
    const { ops, items } = makeFakeOps(tree);
    const updated = await updateKnowledgeDocumentBody(
      "verbal-game",
      ["sekcja-a", "moj-dokument"],
      "nowa treść",
      { allowSharedWrite: true },
      ops
    );
    expect(updated.body).toBe("nowa treść");
    expect(updated.name).toBe("Mój dokument");
    expect(items.find((i) => i.config.address === `${ROOT}/01/01/01/01`)?.body).toBe("nowa treść");
  });

  it("rejects editing a shared document without allowSharedWrite", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(
      updateKnowledgeDocumentBody("verbal-game", ["sekcja-a", "moj-dokument"], "nowa treść", {}, ops)
    ).rejects.toMatchObject({ code: "SHARED_WRITE_FORBIDDEN" });
    await expect(
      updateKnowledgeDocumentBody("verbal-game", ["sekcja-a", "moj-dokument"], "nowa treść", {}, ops)
    ).rejects.toBeInstanceOf(KnowledgeWriteError);
  });

  it("always allows editing a personal document, no allowSharedWrite needed", async () => {
    const PERSONAL_REPO = "personal-repo-guid-2";
    const { ops, items } = makeFakeOps([
      folder(PERSONAL_REPO, "chad_test-user"),
      folder(`${PERSONAL_REPO}/01`, "knowledge"),
      folder(`${PERSONAL_REPO}/01/01`, "My Category"),
      folder(`${PERSONAL_REPO}/01/01/01`, "My Section"),
      text(`${PERSONAL_REPO}/01/01/01/01`, "My Doc", "old body"),
    ]);
    const updated = await runWithRepoContext({ repoGuid: PERSONAL_REPO, username: "test-user" }, () =>
      updateKnowledgeDocumentBody("my-category", ["my-section", "my-doc"], "new body", {}, ops)
    );
    expect(updated.body).toBe("new body");
    expect(items.find((i) => i.config.address === `${PERSONAL_REPO}/01/01/01/01`)?.body).toBe("new body");
  });

  it("throws DOCUMENT_NOT_FOUND for an unknown document path", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(
      updateKnowledgeDocumentBody("verbal-game", ["sekcja-a", "nope"], "x", { allowSharedWrite: true }, ops)
    ).rejects.toMatchObject({ code: "NODE_NOT_FOUND" });
  });
});

describe("ensureSharedKnowledgeRoot", () => {
  it("creates the repo root and knowledge folder when missing", async () => {
    const { ops, items } = makeFakeOps([]);
    const result = await ensureSharedKnowledgeRoot(ops);
    expect(result.createdRepoRoot).toBe(true);
    expect(result.repoRoot.config.address).toBe(ROOT);
    expect(result.knowledgeRoot.config.name).toBe("knowledge");
    expect(items).toHaveLength(2);
  });

  it("is idempotent — a second run creates nothing and reuses the same items", async () => {
    const { ops, items } = makeFakeOps([]);
    const first = await ensureSharedKnowledgeRoot(ops);
    const second = await ensureSharedKnowledgeRoot(ops);
    expect(second.createdRepoRoot).toBe(false);
    expect(second.knowledgeRoot.config.address).toBe(first.knowledgeRoot.config.address);
    expect(items).toHaveLength(2);
  });

  it("uses an existing knowledge folder without duplicating or touching siblings", async () => {
    const { ops, items } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/02`, "other-shared-data"),
    ]);
    const result = await ensureSharedKnowledgeRoot(ops);
    expect(result.createdRepoRoot).toBe(false);
    expect(result.knowledgeRoot.config.address).toBe(`${ROOT}/01`);
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.config.name === "other-shared-data")).toBeDefined();
  });
});

describe("knowledge merge — shared + current session's own repo", () => {
  const PERSONAL_REPO = "personal-repo-guid-1";

  function personalBaseTree(): CpItem[] {
    return [folder(PERSONAL_REPO, "chad_test-user"), folder(`${PERSONAL_REPO}/01`, "knowledge")];
  }

  it("lists only shared categories outside any repo context (no session, e.g. a script)", async () => {
    const { ops } = makeFakeOps([...baseTree(), folder(`${ROOT}/01/01`, "Shared Category")]);
    expect(await listKnowledgeCategories(ops)).toEqual([
      { slug: "shared-category", name: "Shared Category", source: "shared" },
    ]);
  });

  it("merges shared (first) and the session's own personal categories (after) inside a repo context", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/01/01`, "Shared Category"),
      ...personalBaseTree(),
      folder(`${PERSONAL_REPO}/01/01`, "My Category"),
    ]);
    const categories = await runWithRepoContext(
      { repoGuid: PERSONAL_REPO, username: "test-user" },
      () => listKnowledgeCategories(ops)
    );
    expect(categories).toEqual([
      { slug: "shared-category", name: "Shared Category", source: "shared" },
      { slug: "my-category", name: "My Category", source: "personal" },
    ]);
  });

  it("returns only shared categories when the session's own repo has no knowledge folder yet", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/01/01`, "Shared Category"),
      folder(PERSONAL_REPO, "chad_test-user"),
    ]);
    const categories = await runWithRepoContext(
      { repoGuid: PERSONAL_REPO, username: "test-user" },
      () => listKnowledgeCategories(ops)
    );
    expect(categories).toEqual([{ slug: "shared-category", name: "Shared Category", source: "shared" }]);
  });

  it("skips the personal source entirely when the session's own repo is chad_shared itself (defensive guard)", async () => {
    const { ops } = makeFakeOps([...baseTree(), folder(`${ROOT}/01/01`, "Shared Category")]);
    const categories = await runWithRepoContext(
      { repoGuid: ROOT, username: "chad_shared" },
      () => listKnowledgeCategories(ops)
    );
    expect(categories).toEqual([{ slug: "shared-category", name: "Shared Category", source: "shared" }]);
  });

  it("disambiguates a same-name/same-CP-index collision across sources with a further -source suffix", async () => {
    // Two shared "Same Name" categories exhaust "same-name" and "same-name-02";
    // a personal "Same Name" landing on the same CP index ("02") collides with
    // both fallback levels, so it falls through to the final -personal suffix.
    const { ops } = makeFakeOps([
      ...baseTree(),
      folder(`${ROOT}/01/01`, "Same Name"),
      folder(`${ROOT}/01/02`, "Same Name"),
      ...personalBaseTree(),
      folder(`${PERSONAL_REPO}/01/02`, "Same Name"),
    ]);
    const categories = await runWithRepoContext(
      { repoGuid: PERSONAL_REPO, username: "test-user" },
      () => listKnowledgeCategories(ops)
    );
    expect(categories).toEqual([
      { slug: "same-name", name: "Same Name", source: "shared" },
      { slug: "same-name-02", name: "Same Name", source: "shared" },
      { slug: "same-name-02-personal", name: "Same Name", source: "personal" },
    ]);
  });

  it("resolves a personal-source category by slug via getKnowledgeFolder, tagged source: personal", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      ...personalBaseTree(),
      folder(`${PERSONAL_REPO}/01/01`, "My Category"),
      folder(`${PERSONAL_REPO}/01/01/01`, "My Section"),
      text(`${PERSONAL_REPO}/01/01/01/01`, "My Doc", "my body"),
    ]);
    const view = await runWithRepoContext(
      { repoGuid: PERSONAL_REPO, username: "test-user" },
      () => getKnowledgeFolder("my-category", [], ops)
    );
    expect(view.source).toBe("personal");
    expect(view.children).toEqual([{ slug: "my-section", name: "My Section", type: "Folder" }]);
  });

  it("resolves a personal-source document via getKnowledgeDocument, tagged source: personal", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      ...personalBaseTree(),
      folder(`${PERSONAL_REPO}/01/01`, "My Category"),
      folder(`${PERSONAL_REPO}/01/01/01`, "My Section"),
      text(`${PERSONAL_REPO}/01/01/01/01`, "My Doc", "my body"),
    ]);
    const doc = await runWithRepoContext(
      { repoGuid: PERSONAL_REPO, username: "test-user" },
      () => getKnowledgeDocument("my-category", ["my-section", "my-doc"], ops)
    );
    expect(doc.body).toBe("my body");
    expect(doc.source).toBe("personal");
    expect(doc.breadcrumb.map((b) => b.name)).toEqual(["My Category", "My Section"]);
  });
});
