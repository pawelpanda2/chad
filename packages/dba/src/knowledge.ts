/**
 * Knowledge tab data layer (Story 96) — reads the shared `chad_shared`
 * repo's `knowledge` tree and maps it onto the Dashboard's existing
 * Knowledge UI shapes:
 *
 *   chad_shared/knowledge/<category Folder>            → menu tile
 *   chad_shared/knowledge/<category>/<section Folder>  → framed section header
 *   chad_shared/knowledge/<category>/<section>/<Text>  → document row (+ body)
 *
 * `chad_shared` is an ordinary CP repo (a `cp_items` row whose address is
 * the bare repoGuid), exactly like `chad_admin` (`admin-users.ts`) — its
 * GUID is hardcoded here because it belongs to no login session. Confirmed
 * during the Story 96 audit: no repo of this name existed before, so the
 * GUID below was generated once for this Story and is now THE stable id.
 *
 * Slugs: URL identifiers are derived from each item's `config.name`
 * (never from client-supplied CP paths); incoming slugs are validated
 * against a strict charset before any lookup, so path traversal or
 * arbitrary-address probing is structurally impossible — resolution only
 * ever walks children of `chad_shared/knowledge`.
 *
 * Reads are bulk: one `findRecursively(categoryAddress, "")` call returns
 * the whole category subtree (both providers treat an empty phrase as
 * match-all), so the category view never does per-section N+1 queries.
 */

import {
  getItemByAddress as realGetItemByAddress,
  getChildrenOf as realGetChildrenOf,
  findRecursively as realFindRecursively,
  createOrGetChild as realCreateOrGetChild,
  putItem as realPutItem,
} from "./item-ops.js";
import type { CpItem } from "./cp-model.js";
import { splitAddress } from "./cp-model.js";

export const CHAD_SHARED_REPO_GUID = "31275a71-3dd0-41a2-8874-2d12dac01590";
export const CHAD_SHARED_REPO_NAME = "chad_shared";
export const KNOWLEDGE_ROOT_NAME = "knowledge";

export type KnowledgeErrorCode =
  | "INVALID_SLUG"
  | "CATEGORY_NOT_FOUND"
  | "DOCUMENT_NOT_FOUND";

export class KnowledgeError extends Error {
  constructor(
    public readonly code: KnowledgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

export interface KnowledgeCategorySummary {
  slug: string;
  name: string;
}

export interface KnowledgeDocumentSummary {
  slug: string;
  name: string;
}

export interface KnowledgeSection {
  name: string;
  documents: KnowledgeDocumentSummary[];
}

export interface KnowledgeCategoryView {
  slug: string;
  name: string;
  sections: KnowledgeSection[];
}

export interface KnowledgeDocumentView {
  slug: string;
  name: string;
  body: string;
  sectionName: string;
  category: KnowledgeCategorySummary;
}

/** Injectable seam for unit tests only (`knowledge.test.ts`) — mirrors `folders.ts`'s `FolderChildOps` pattern. */
export interface KnowledgeOps {
  getItemByAddress: typeof realGetItemByAddress;
  getChildrenOf: typeof realGetChildrenOf;
  findRecursively: typeof realFindRecursively;
  createOrGetChild: typeof realCreateOrGetChild;
  putItem: typeof realPutItem;
}

const defaultOps: KnowledgeOps = {
  getItemByAddress: realGetItemByAddress,
  getChildrenOf: realGetChildrenOf,
  findRecursively: realFindRecursively,
  createOrGetChild: realCreateOrGetChild,
  putItem: realPutItem,
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * Rejects anything that is not a plain lowercase slug BEFORE any data
 * lookup happens — `../`, encoded separators, GUIDs-with-slashes, empty
 * strings etc. all fail here with a typed error (surfaces as 400/404 in
 * the API layer, never as an address probe).
 */
export function assertValidKnowledgeSlug(slug: string): void {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new KnowledgeError("INVALID_SLUG", `Invalid knowledge slug: "${String(slug)}"`);
  }
}

/**
 * Derives a URL slug from an item's logical name. Handles Polish
 * diacritics (NFD strip + explicit ł/Ł, which never NFD-decompose) so
 * "Historie i opowiadanie" → "historie-i-opowiadanie". Returns "" for a
 * name with no usable characters — `assignUniqueSlugs` then falls back to
 * the item's own CP index.
 */
export function slugifyKnowledgeName(name: string): string {
  return name
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface SluggedItem {
  slug: string;
  item: CpItem;
}

/** Last numeric segment of the item's own address — CP's index, unique among siblings. */
function cpIndexOf(item: CpItem): string {
  return item.config.address.split("/").pop() ?? "";
}

/**
 * Assigns a unique slug to every item, in CP order. A duplicate name (or a
 * name that slugifies to nothing) gets the item's own CP index appended —
 * deterministic and stable, so both duplicates stay reachable instead of
 * one silently shadowing the other.
 */
export function assignUniqueSlugs(items: CpItem[]): SluggedItem[] {
  const used = new Set<string>();
  return items.map((item) => {
    let slug = slugifyKnowledgeName(item.config.name);
    if (!slug || used.has(slug)) {
      slug = slug ? `${slug}-${cpIndexOf(item)}` : `item-${cpIndexOf(item)}`;
    }
    used.add(slug);
    return { slug, item };
  });
}

/** Resolves the `knowledge` Folder under the chad_shared root, or null when the repo/folder doesn't exist yet (a valid empty state, not an error). */
async function getKnowledgeRoot(ops: KnowledgeOps): Promise<CpItem | null> {
  const repoRoot = await ops.getItemByAddress(CHAD_SHARED_REPO_GUID);
  if (!repoRoot) return null;
  const children = await ops.getChildrenOf(CHAD_SHARED_REPO_GUID);
  return (
    children.find(
      (child) => child.config.type === "Folder" && child.config.name === KNOWLEDGE_ROOT_NAME
    ) ?? null
  );
}

async function listCategoryItems(ops: KnowledgeOps): Promise<SluggedItem[]> {
  const root = await getKnowledgeRoot(ops);
  if (!root) return [];
  const children = await ops.getChildrenOf(root.config.address);
  // Only Folder children become menu tiles — a stray Text directly under
  // `knowledge` has no place in the menu/category model and is ignored.
  return assignUniqueSlugs(children.filter((child) => child.config.type === "Folder"));
}

/** Menu tiles: Folder children of `chad_shared/knowledge`, in CP order. Empty list when the tree doesn't exist yet. */
export async function listKnowledgeCategories(
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeCategorySummary[]> {
  const categories = await listCategoryItems(ops);
  return categories.map(({ slug, item }) => ({ slug, name: item.config.name }));
}

interface CategoryTree {
  category: SluggedItem;
  sections: Array<{
    item: CpItem;
    documents: SluggedItem[];
  }>;
}

/**
 * Fetches and shapes one category's whole subtree with a single bulk
 * descendants query (no per-section N+1). Sections = depth-1 Folder
 * children; documents = depth-2 Text children of a section. Document
 * slugs are unique across the whole category (they identify the document
 * in the `/dashboard/knowledge/[category]/[document]` URL).
 */
async function getCategoryTree(categorySlug: string, ops: KnowledgeOps): Promise<CategoryTree> {
  assertValidKnowledgeSlug(categorySlug);

  const categories = await listCategoryItems(ops);
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) {
    throw new KnowledgeError("CATEGORY_NOT_FOUND", `Knowledge category not found: "${categorySlug}"`);
  }

  const categoryAddress = category.item.config.address;
  const categoryDepth = splitAddress(categoryAddress).segments.length;
  // Empty phrase == match-all: one query returns every descendant (with
  // bodies), already in CP numeric-address order on both providers.
  const descendants = await ops.findRecursively(categoryAddress, "");

  const sectionItems = descendants.filter(
    (item) =>
      item.config.type === "Folder" &&
      splitAddress(item.config.address).segments.length === categoryDepth + 1
  );

  const documentItems = descendants.filter(
    (item) =>
      item.config.type === "Text" &&
      splitAddress(item.config.address).segments.length === categoryDepth + 2
  );
  const sluggedDocuments = assignUniqueSlugs(documentItems);

  const sections = sectionItems.map((sectionItem) => ({
    item: sectionItem,
    documents: sluggedDocuments.filter(({ item }) =>
      item.config.address.startsWith(`${sectionItem.config.address}/`)
    ),
  }));

  return { category, sections };
}

/**
 * Category view for `/dashboard/knowledge/[category]`.
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND
 */
export async function getKnowledgeCategory(
  categorySlug: string,
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeCategoryView> {
  const tree = await getCategoryTree(categorySlug, ops);
  return {
    slug: tree.category.slug,
    name: tree.category.item.config.name,
    sections: tree.sections.map(({ item, documents }) => ({
      name: item.config.name,
      documents: documents.map(({ slug, item: doc }) => ({ slug, name: doc.config.name })),
    })),
  };
}

/**
 * Document view (name + body) for `/dashboard/knowledge/[category]/[document]`.
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / DOCUMENT_NOT_FOUND
 */
export async function getKnowledgeDocument(
  categorySlug: string,
  documentSlug: string,
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeDocumentView> {
  assertValidKnowledgeSlug(documentSlug);
  const tree = await getCategoryTree(categorySlug, ops);

  for (const section of tree.sections) {
    const match = section.documents.find(({ slug }) => slug === documentSlug);
    if (match) {
      return {
        slug: match.slug,
        name: match.item.config.name,
        body: match.item.body,
        sectionName: section.item.config.name,
        category: { slug: tree.category.slug, name: tree.category.item.config.name },
      };
    }
  }

  throw new KnowledgeError(
    "DOCUMENT_NOT_FOUND",
    `Knowledge document not found: "${documentSlug}" in category "${categorySlug}"`
  );
}

export interface EnsureSharedKnowledgeResult {
  repoRoot: CpItem;
  knowledgeRoot: CpItem;
  createdRepoRoot: boolean;
}

/**
 * Idempotently ensures the shared repo root and its `knowledge` Folder
 * exist. Never overwrites or deletes anything: the root is only written
 * when it doesn't exist at all, and `knowledge` goes through the standard
 * find-or-create child primitive (`createOrGetChild` — advisory-locked,
 * PostParentItem semantics). Safe to call any number of times.
 */
export async function ensureSharedKnowledgeRoot(
  ops: KnowledgeOps = defaultOps
): Promise<EnsureSharedKnowledgeResult> {
  let repoRoot = await ops.getItemByAddress(CHAD_SHARED_REPO_GUID);
  let createdRepoRoot = false;

  if (!repoRoot) {
    repoRoot = await ops.putItem({
      _id: CHAD_SHARED_REPO_GUID,
      config: {
        id: CHAD_SHARED_REPO_GUID,
        address: CHAD_SHARED_REPO_GUID,
        type: "Folder",
        name: CHAD_SHARED_REPO_NAME,
      },
      body: "",
    });
    createdRepoRoot = true;
  }

  const knowledgeRoot = await ops.createOrGetChild(repoRoot, KNOWLEDGE_ROOT_NAME, "Folder");
  return { repoRoot, knowledgeRoot, createdRepoRoot };
}
