/**
 * Knowledge tab data layer (Story 96, extended Story 109 follow-up) — reads
 * TWO trees and merges them into one menu:
 *
 *   chad_shared/knowledge/<category Folder>            → menu tile ("shared")
 *   <current user's own repo>/knowledge/<category>     → menu tile ("personal")
 *   .../<category>/<section Folder>                    → framed section header
 *   .../<category>/<section>/<Text>                    → document row (+ body)
 *
 * `chad_shared` is an ordinary CP repo (a `cp_items` row whose address is
 * the bare repoGuid), exactly like `chad_admin` (`admin-users.ts`) — its
 * GUID is hardcoded here because it belongs to no login session. Confirmed
 * during the Story 96 audit: no repo of this name existed before, so the
 * GUID below was generated once for this Story and is now THE stable id.
 *
 * The personal source is the CURRENT SESSION's own repo (never a
 * client-supplied repo id) — resolved via `tryGetCurrentActor()` (repo
 * context), which returns `null` outside a request-scoped context (e.g. a
 * unit test with fake ops, or a script) rather than throwing; the personal
 * source is then simply empty, same as "no knowledge folder yet" — never a
 * hard error. A caller whose own repo happens to BE `chad_shared` (can't
 * normally happen — chad_shared has no login session) would otherwise
 * double-list the same tree; guarded explicitly below anyway.
 *
 * Slugs: URL identifiers are derived from each item's `config.name`
 * (never from client-supplied CP paths); incoming slugs are validated
 * against a strict charset before any lookup, so path traversal or
 * arbitrary-address probing is structurally impossible — category
 * resolution only ever walks children of the two `knowledge` roots above,
 * document resolution only ever walks the already-resolved category's own
 * subtree (whichever repo it came from).
 *
 * Reads are bulk: one `findRecursively(categoryAddress, "")` call returns
 * the whole category subtree (both providers treat an empty phrase as
 * match-all), so the category view never does per-section N+1 queries.
 */

import {
  getItemByAddress as realGetItemByAddress,
  getChildrenOf as realGetChildrenOf,
  createOrGetChild as realCreateOrGetChild,
  putItem as realPutItem,
} from "./item-ops.js";
import type { CpItem } from "./cp-model.js";
import { tryGetCurrentActor } from "./repo-context.js";

export const CHAD_SHARED_REPO_GUID = "31275a71-3dd0-41a2-8874-2d12dac01590";
export const CHAD_SHARED_REPO_NAME = "chad_shared";
export const KNOWLEDGE_ROOT_NAME = "knowledge";

export type KnowledgeErrorCode =
  | "INVALID_SLUG"
  | "CATEGORY_NOT_FOUND"
  | "DOCUMENT_NOT_FOUND"
  | "NODE_NOT_FOUND";

export class KnowledgeError extends Error {
  constructor(
    public readonly code: KnowledgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

/** "shared" = `chad_shared/knowledge` (everyonesees the same tree); "personal" = the current session's own repo's `knowledge` tree. */
export type KnowledgeSource = "shared" | "personal";

export interface KnowledgeCategorySummary {
  slug: string;
  name: string;
  source: KnowledgeSource;
  /**
   * The category's own CP address (Story 120 follow-up) — lets the
   * Knowledge menu link straight to the address-based
   * `/dashboard/knowledge/<address-slug>` view instead of the name-slug
   * route. Additive: existing `{slug, name, source}` consumers are
   * unaffected. (Story 96's original design deliberately never sent a CP
   * address to the client — no longer load-bearing now that Folders/Item
   * View/CP-links already put addresses in URLs throughout the dashboard.)
   */
  address: string;
}

/** One breadcrumb step from the category down to (and including, for a folder view) the current node. */
export interface KnowledgeBreadcrumbSegment {
  slug: string;
  name: string;
}

export interface KnowledgeChildSummary {
  slug: string;
  name: string;
  type: "Folder" | "Text";
}

/**
 * A folder-level node — the category itself, or any Folder nested under it
 * to any depth. Real knowledge trees are not a fixed 2-level
 * category/section shape (some go 5+ levels deep), so this is a plain
 * recursive "list this Folder's children" view, not a section/document
 * grouping — Folder children render as clickable tiles that open another
 * such view one level deeper; Text children open a document view.
 */
export interface KnowledgeFolderView {
  kind: "folder";
  slug: string;
  name: string;
  source: KnowledgeSource;
  breadcrumb: KnowledgeBreadcrumbSegment[];
  children: KnowledgeChildSummary[];
  /** This node's own CP address — lets a name-slug resolution redirect straight to the address-based view (see `KnowledgeCategorySummary.address`). */
  address: string;
}

/** A document (Text item) node at any depth under a category. */
export interface KnowledgeDocumentView {
  kind: "document";
  slug: string;
  name: string;
  body: string;
  source: KnowledgeSource;
  /** Category down to (NOT including) this document's own name. */
  breadcrumb: KnowledgeBreadcrumbSegment[];
  /** This node's own CP address — lets a name-slug resolution redirect straight to Item View (see `KnowledgeCategorySummary.address`). */
  address: string;
}

export type KnowledgeNodeView = KnowledgeFolderView | KnowledgeDocumentView;

/** Injectable seam for unit tests only (`knowledge.test.ts`) — mirrors `folders.ts`'s `FolderChildOps` pattern. */
export interface KnowledgeOps {
  getItemByAddress: typeof realGetItemByAddress;
  getChildrenOf: typeof realGetChildrenOf;
  createOrGetChild: typeof realCreateOrGetChild;
  putItem: typeof realPutItem;
}

const defaultOps: KnowledgeOps = {
  getItemByAddress: realGetItemByAddress,
  getChildrenOf: realGetChildrenOf,
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

/** Resolves the `knowledge` Folder directly under `repoGuid`'s root, or null when the repo/folder doesn't exist yet (a valid empty state, not an error). */
async function getKnowledgeRootForRepo(repoGuid: string, ops: KnowledgeOps): Promise<CpItem | null> {
  const repoRoot = await ops.getItemByAddress(repoGuid);
  if (!repoRoot) return null;
  const children = await ops.getChildrenOf(repoGuid);
  return (
    children.find(
      (child) => child.config.type === "Folder" && child.config.name === KNOWLEDGE_ROOT_NAME
    ) ?? null
  );
}

/** Folder children of `repoGuid`'s `knowledge` root — raw, not yet slugged. Only Folder children are categories; a stray Text directly under `knowledge` is ignored. */
async function listCategoryItemsForRepo(repoGuid: string, ops: KnowledgeOps): Promise<CpItem[]> {
  const root = await getKnowledgeRootForRepo(repoGuid, ops);
  if (!root) return [];
  const children = await ops.getChildrenOf(root.config.address);
  return children.filter((child) => child.config.type === "Folder");
}

interface TaggedSluggedItem extends SluggedItem {
  source: KnowledgeSource;
}

/**
 * Slug uniqueness across a MERGED, cross-repo list: same rule as
 * `assignUniqueSlugs` (name → CP-index fallback for duplicates), plus one
 * more fallback level (append the source) for the vanishingly rare case
 * where both sources have same-named categories that ALSO landed on the
 * same CP index in their own repo.
 */
function assignUniqueSlugsAcrossSources(taggedItems: Array<{ item: CpItem; source: KnowledgeSource }>): TaggedSluggedItem[] {
  const used = new Set<string>();
  return taggedItems.map(({ item, source }) => {
    let slug = slugifyKnowledgeName(item.config.name);
    if (!slug || used.has(slug)) {
      slug = slug ? `${slug}-${cpIndexOf(item)}` : `item-${cpIndexOf(item)}`;
    }
    if (used.has(slug)) {
      slug = `${slug}-${source}`;
    }
    used.add(slug);
    return { slug, item, source };
  });
}

/** The current session's own repoGuid, or null outside a request-scoped context (unit tests, scripts) — never throws, personal source is just empty then. */
function tryGetCurrentPersonalRepoGuid(): string | null {
  return tryGetCurrentActor()?.repoGuid ?? null;
}

/**
 * Merges `chad_shared/knowledge` ("shared", always listed first) with the
 * current session's own repo's `knowledge` ("personal", listed after) into
 * one slugged list. The personal source is skipped entirely when there's no
 * session (fake-ops unit tests) or the session's own repo happens to be
 * `chad_shared` itself (can't normally happen — no login session owns it).
 */
async function listMergedCategoryItems(ops: KnowledgeOps): Promise<TaggedSluggedItem[]> {
  const sharedItems = await listCategoryItemsForRepo(CHAD_SHARED_REPO_GUID, ops);
  const personalRepoGuid = tryGetCurrentPersonalRepoGuid();
  const personalItems =
    personalRepoGuid && personalRepoGuid !== CHAD_SHARED_REPO_GUID
      ? await listCategoryItemsForRepo(personalRepoGuid, ops)
      : [];

  return assignUniqueSlugsAcrossSources([
    ...sharedItems.map((item) => ({ item, source: "shared" as const })),
    ...personalItems.map((item) => ({ item, source: "personal" as const })),
  ]);
}

/**
 * Menu tiles: Folder children of `chad_shared/knowledge` (shared, first)
 * followed by Folder children of the current session's own `knowledge`
 * folder (personal, after) — the Dashboard renders a divider between the
 * two groups. Empty list when neither tree exists yet.
 */
export async function listKnowledgeCategories(
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeCategorySummary[]> {
  const categories = await listMergedCategoryItems(ops);
  return categories.map(({ slug, item, source }) => ({
    slug,
    name: item.config.name,
    source,
    address: item.config.address,
  }));
}

interface ResolvedKnowledgeNode {
  /** The resolved item itself. */
  item: CpItem;
  slug: string;
  source: KnowledgeSource;
  /** Category down to (not including) this node. */
  breadcrumb: KnowledgeBreadcrumbSegment[];
}

/**
 * Walks `pathSlugs` one level at a time starting from the resolved category
 * (`pathSlugs` empty ⇒ the category itself), re-slugging each level's
 * children fresh via `assignUniqueSlugs` (never a stored/cached tree) — a
 * real knowledge tree is not a fixed category/section/document shape (some
 * go 5+ levels deep), so this is a plain recursive "resolve one child at a
 * time" walk, structurally identical to `folders.ts`'s own address-by-address
 * navigation, just slug-addressed instead of index-addressed. A path
 * segment landing on a Text item before the path is exhausted is a dead
 * end (can't have children) — same as an unresolvable slug, both surface as
 * `NODE_NOT_FOUND`.
 *
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / NODE_NOT_FOUND
 */
async function resolveKnowledgeNode(
  categorySlug: string,
  pathSlugs: string[],
  ops: KnowledgeOps
): Promise<ResolvedKnowledgeNode> {
  assertValidKnowledgeSlug(categorySlug);
  for (const slug of pathSlugs) assertValidKnowledgeSlug(slug);

  const categories = await listMergedCategoryItems(ops);
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) {
    throw new KnowledgeError("CATEGORY_NOT_FOUND", `Knowledge category not found: "${categorySlug}"`);
  }

  let current = category.item;
  let currentSlug = category.slug;
  const breadcrumb: KnowledgeBreadcrumbSegment[] = [];

  for (const slug of pathSlugs) {
    breadcrumb.push({ slug: currentSlug, name: current.config.name });

    if (current.config.type !== "Folder") {
      throw new KnowledgeError(
        "NODE_NOT_FOUND",
        `Knowledge path segment "${slug}" has no parent Folder to resolve against`
      );
    }
    const children = await ops.getChildrenOf(current.config.address);
    const slugged = assignUniqueSlugs(children);
    const match = slugged.find((c) => c.slug === slug);
    if (!match) {
      throw new KnowledgeError("NODE_NOT_FOUND", `Knowledge item not found: "${slug}"`);
    }
    current = match.item;
    currentSlug = match.slug;
  }

  return { item: current, slug: currentSlug, source: category.source, breadcrumb };
}

async function buildFolderView(resolved: ResolvedKnowledgeNode, ops: KnowledgeOps): Promise<KnowledgeFolderView> {
  const children = await ops.getChildrenOf(resolved.item.config.address);
  const slugged = assignUniqueSlugs(children);

  return {
    kind: "folder",
    slug: resolved.slug,
    name: resolved.item.config.name,
    source: resolved.source,
    breadcrumb: [...resolved.breadcrumb, { slug: resolved.slug, name: resolved.item.config.name }],
    children: slugged.map(({ slug, item }) => ({
      slug,
      name: item.config.name,
      type: item.config.type === "Folder" ? "Folder" : "Text",
    })),
    address: resolved.item.config.address,
  };
}

function buildDocumentView(resolved: ResolvedKnowledgeNode): KnowledgeDocumentView {
  return {
    kind: "document",
    slug: resolved.slug,
    name: resolved.item.config.name,
    body: resolved.item.body,
    source: resolved.source,
    breadcrumb: resolved.breadcrumb,
    address: resolved.item.config.address,
  };
}

/**
 * Resolves `pathSlugs` under `categorySlug` to whichever kind of node is
 * actually there — a Folder (listing) or a Text item (document) — without
 * the caller having to guess in advance. The one function the API route
 * uses (it doesn't know ahead of a request which kind a given URL path
 * resolves to); `getKnowledgeFolder`/`getKnowledgeDocument` below are
 * type-narrowing convenience wrappers over this same walk, for callers
 * (tests, `updateKnowledgeDocumentBody`) that already know which kind they
 * expect and want a typed result instead of a union.
 *
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / NODE_NOT_FOUND
 */
export async function getKnowledgeNode(
  categorySlug: string,
  pathSlugs: string[] = [],
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeNodeView> {
  const resolved = await resolveKnowledgeNode(categorySlug, pathSlugs, ops);
  return resolved.item.config.type === "Folder" ? buildFolderView(resolved, ops) : buildDocumentView(resolved);
}

/**
 * Folder-level view — the category itself (`pathSlugs: []`) or any Folder
 * nested under it. Folder children render as clickable tiles that open
 * another such view one level deeper; Text children open a document view.
 *
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / NODE_NOT_FOUND
 */
export async function getKnowledgeFolder(
  categorySlug: string,
  pathSlugs: string[] = [],
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeFolderView> {
  const resolved = await resolveKnowledgeNode(categorySlug, pathSlugs, ops);
  if (resolved.item.config.type !== "Folder") {
    throw new KnowledgeError("NODE_NOT_FOUND", `Knowledge node "${resolved.slug}" is not a Folder`);
  }
  return buildFolderView(resolved, ops);
}

/**
 * Document (Text item) view at any depth under a category.
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / NODE_NOT_FOUND / DOCUMENT_NOT_FOUND
 */
export async function getKnowledgeDocument(
  categorySlug: string,
  pathSlugs: string[],
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeDocumentView> {
  if (pathSlugs.length === 0) {
    throw new KnowledgeError("DOCUMENT_NOT_FOUND", "No document slug given");
  }
  const resolved = await resolveKnowledgeNode(categorySlug, pathSlugs, ops);
  if (resolved.item.config.type !== "Text") {
    throw new KnowledgeError("DOCUMENT_NOT_FOUND", `Knowledge node "${resolved.slug}" is not a document`);
  }
  return buildDocumentView(resolved);
}

export type KnowledgeWriteErrorCode = "SHARED_WRITE_FORBIDDEN";

export class KnowledgeWriteError extends Error {
  constructor(
    public readonly code: KnowledgeWriteErrorCode,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeWriteError";
  }
}

/**
 * Overwrites a knowledge document's body in place — never re-allocates its
 * address/id, same "overwrite, don't recreate" convention `folders.ts`'s
 * `updateFolderTextBody` uses for ordinary Text items. Added so a document
 * found to need a fix can be edited right from the Knowledge tab instead of
 * requiring a detour through Folders.
 *
 * A "shared" (chad_shared) document is content every user sees — editing it
 * is only allowed when the caller explicitly opts in via
 * `allowSharedWrite` (the API route only sets this for an admin session,
 * mirroring the same admin-only gate the Folders repo picker already
 * enforces for chad_shared). A "personal" document is always editable —
 * it's already scoped to the current session's own repo by
 * `listMergedCategoryItems`/`resolveKnowledgeNode`, so there is no separate
 * repo check needed here.
 *
 * @throws KnowledgeError INVALID_SLUG / CATEGORY_NOT_FOUND / NODE_NOT_FOUND / DOCUMENT_NOT_FOUND
 * @throws KnowledgeWriteError SHARED_WRITE_FORBIDDEN
 */
export async function updateKnowledgeDocumentBody(
  categorySlug: string,
  pathSlugs: string[],
  newBody: string,
  options: { allowSharedWrite?: boolean } = {},
  ops: KnowledgeOps = defaultOps
): Promise<KnowledgeDocumentView> {
  if (pathSlugs.length === 0) {
    throw new KnowledgeError("DOCUMENT_NOT_FOUND", "No document slug given");
  }
  const resolved = await resolveKnowledgeNode(categorySlug, pathSlugs, ops);
  if (resolved.item.config.type !== "Text") {
    throw new KnowledgeError("DOCUMENT_NOT_FOUND", `Knowledge node "${resolved.slug}" is not a document`);
  }

  if (resolved.source === "shared" && !options.allowSharedWrite) {
    throw new KnowledgeWriteError(
      "SHARED_WRITE_FORBIDDEN",
      "Editing a chad_shared knowledge document requires an admin session"
    );
  }

  const updated = await ops.putItem({ ...resolved.item, body: newBody });
  return {
    kind: "document",
    slug: resolved.slug,
    name: updated.config.name,
    body: updated.body,
    source: resolved.source,
    breadcrumb: resolved.breadcrumb,
    address: updated.config.address,
  };
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
