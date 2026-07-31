/**
 * Story 96 — Knowledge tree mapper tests (pure, fake-ops-based, no real
 * DB — same seam pattern as `folders.test.ts`). Covers the regression
 * list from the Story input: empty states, tile mapping, section/document
 * mapping, CP-order preservation, document body, slug safety (traversal /
 * invalid identifiers / duplicates), controlled not-found, and idempotent
 * ensure of the shared root.
 */

import { describe, it, expect } from "vitest";
import {
  CHAD_SHARED_REPO_GUID,
  KnowledgeError,
  assertValidKnowledgeSlug,
  slugifyKnowledgeName,
  assignUniqueSlugs,
  listKnowledgeCategories,
  getKnowledgeCategory,
  getKnowledgeDocument,
  ensureSharedKnowledgeRoot,
  type KnowledgeOps,
} from "./knowledge.js";
import type { CpItem } from "./cp-model.js";
import { nextChildIndexFromSiblings } from "./cp-model.js";

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
    findRecursively: async (rootAddress, phrase) =>
      items
        .filter(
          (item) =>
            item.config.address.startsWith(`${rootAddress}/`) && item.body.includes(phrase)
        )
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
      { slug: "zeta-category", name: "Zeta Category" },
      { slug: "alpha-category", name: "Alpha Category" },
    ]);
  });

  it("ignores a stray Text item directly under knowledge", async () => {
    const { ops } = makeFakeOps([
      ...baseTree(),
      text(`${ROOT}/01/01`, "not a category"),
      folder(`${ROOT}/01/02`, "Real Category"),
    ]);
    const categories = await listKnowledgeCategories(ops);
    expect(categories).toEqual([{ slug: "real-category", name: "Real Category" }]);
  });
});

describe("getKnowledgeCategory", () => {
  const tree = [
    ...baseTree(),
    folder(`${ROOT}/01/01`, "Verbal Game"),
    folder(`${ROOT}/01/01/01`, "Podstawy rozmowy"),
    text(`${ROOT}/01/01/01/01`, "Zeta doc", "zeta body"),
    text(`${ROOT}/01/01/01/02`, "Alpha doc", "alpha body"),
    folder(`${ROOT}/01/01/02`, "Pusta sekcja"),
  ];

  it("maps section Folders to headers and Text children to document rows under the right header", async () => {
    const { ops } = makeFakeOps(tree);
    const view = await getKnowledgeCategory("verbal-game", ops);
    expect(view.name).toBe("Verbal Game");
    expect(view.sections).toHaveLength(2);
    expect(view.sections[0].name).toBe("Podstawy rozmowy");
    // CP order preserved (Zeta at index 01 before Alpha at 02).
    expect(view.sections[0].documents.map((d) => d.name)).toEqual(["Zeta doc", "Alpha doc"]);
    expect(view.sections[1]).toEqual({ name: "Pusta sekcja", documents: [] });
  });

  it("returns an empty sections list for a category with no children", async () => {
    const { ops } = makeFakeOps([...baseTree(), folder(`${ROOT}/01/01`, "Empty Cat")]);
    const view = await getKnowledgeCategory("empty-cat", ops);
    expect(view.sections).toEqual([]);
  });

  it("throws CATEGORY_NOT_FOUND for an unknown slug", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeCategory("no-such-category", ops)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
  });

  it("throws INVALID_SLUG before any lookup for a traversal-style slug", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeCategory("../../secrets", ops)).rejects.toMatchObject({
      code: "INVALID_SLUG",
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

  it("returns the document's name, body and section", async () => {
    const { ops } = makeFakeOps(tree);
    const doc = await getKnowledgeDocument("verbal-game", "moj-dokument", ops);
    expect(doc.name).toBe("Mój dokument");
    expect(doc.body).toBe("prawdziwa treść body");
    expect(doc.sectionName).toBe("Sekcja A");
    expect(doc.category).toEqual({ slug: "verbal-game", name: "Verbal Game" });
  });

  it("throws DOCUMENT_NOT_FOUND for an unknown document slug (controlled 404, no address leak)", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", "nope", ops)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_FOUND",
    });
  });

  it("throws INVALID_SLUG for an unsafe document slug", async () => {
    const { ops } = makeFakeOps(tree);
    await expect(getKnowledgeDocument("verbal-game", "a/b", ops)).rejects.toMatchObject({
      code: "INVALID_SLUG",
    });
  });

  it("sees an item added later (no static GROUPS anywhere — data comes from the ops layer)", async () => {
    const { ops, items } = makeFakeOps(tree);
    items.push(text(`${ROOT}/01/01/01/02`, "Nowy dokument", "dodany później"));
    const view = await getKnowledgeCategory("verbal-game", ops);
    expect(view.sections[0].documents.map((d) => d.name)).toContain("Nowy dokument");
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
