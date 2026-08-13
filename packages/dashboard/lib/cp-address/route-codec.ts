/**
 * Codec between a CP Item's `Address` (`<repoGuid>/<numeric loca
 * segment>/...`, e.g. `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/14/13/01`) and
 * the canonical Folders route slug (`/dashboard/folders/<slug>`) — Story
 * 120. One shared, tested module; Folders, the CP-link `by-id` redirect
 * route, and anything else that needs a canonical Folders URL all import
 * from here instead of re-deriving the encoding.
 *
 * A naive `slug.replaceAll("-", "/")` cannot round-trip: the UUID itself
 * contains hyphens. Instead this relies on the UUID's fixed canonical
 * length (36 chars, `8-4-4-4-12` hex groups) — the first 36 characters of
 * a slug are always the repoGuid, the rest (if any) is `-`-joined numeric
 * loca segments. Loca segments are CP's own numeric child indices (see
 * `documentation/ai-docs/begin_here/01_ai_start.md` — physical Item
 * folders are numeric; logical names live in config), so validating each
 * segment as digits-only both matches the real data model and rejects
 * path traversal / injection by construction (`..`, `/`, letters, etc.
 * never match).
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_LENGTH = 36;
const LOCA_SEGMENT_RE = /^[0-9]+$/;

/** Encodes a CP Item address as a canonical Folders route slug, or `null` if the address is malformed. */
export function cpAddressToRouteSlug(address: string): string | null {
  if (typeof address !== "string" || address.length === 0) return null;
  const parts = address.split("/");
  const repoGuid = parts[0];
  if (!UUID_RE.test(repoGuid)) return null;

  const locaSegments = parts.slice(1);
  if (locaSegments.some((segment) => !LOCA_SEGMENT_RE.test(segment))) return null;

  return locaSegments.length > 0 ? `${repoGuid}-${locaSegments.join("-")}` : repoGuid;
}

/** Decodes a canonical Folders route slug back to a CP Item address, or `null` if malformed/invalid. */
export function cpRouteSlugToAddress(slug: string): string | null {
  if (typeof slug !== "string" || slug.length < UUID_LENGTH) return null;

  const repoGuid = slug.slice(0, UUID_LENGTH);
  if (!UUID_RE.test(repoGuid)) return null;

  const rest = slug.slice(UUID_LENGTH);
  if (rest === "") return repoGuid;
  if (!rest.startsWith("-")) return null;

  const locaSegments = rest.slice(1).split("-");
  if (locaSegments.some((segment) => !LOCA_SEGMENT_RE.test(segment))) return null;

  return `${repoGuid}/${locaSegments.join("/")}`;
}

/** Canonical Folders href for a CP Item address (`/dashboard/folders/<slug>`), or `null` if the address is malformed. */
export function cpAddressToFoldersHref(address: string): string | null {
  const slug = cpAddressToRouteSlug(address);
  return slug ? `/dashboard/folders/${slug}` : null;
}

/** Canonical Item View href for a CP Item address (`/dashboard/item-view/<slug>`) — the chrome-free single-Text-item view the shared Preview's CP-link opens for a Text item. `null` if the address is malformed. */
export function cpAddressToItemViewHref(address: string): string | null {
  const slug = cpAddressToRouteSlug(address);
  return slug ? `/dashboard/item-view/${slug}` : null;
}

/**
 * Canonical Knowledge href for a CP Item address (`/dashboard/knowledge/<slug>`)
 * — the shared Preview's CP-link target for a FOLDER item (Story 120
 * follow-up: stays on Knowledge's card-grid view rather than Item View).
 * Matches `/dashboard/knowledge/[category]/[[...path]]` with `category` set
 * to the address slug and no further path segments — that page detects an
 * address-shaped `category` and switches to address-based fetching; see its
 * own doc comment.
 */
export function cpAddressToKnowledgeHref(address: string): string | null {
  const slug = cpAddressToRouteSlug(address);
  return slug ? `/dashboard/knowledge/${slug}` : null;
}

/** The `repoGuid` prefix of a CP Item address — the first `/`-separated segment. `null` if not a valid UUID. */
export function cpAddressRepoGuid(address: string): string | null {
  if (typeof address !== "string") return null;
  const repoGuid = address.split("/")[0];
  return UUID_RE.test(repoGuid) ? repoGuid : null;
}

export interface CpAddressParts {
  repoGuid: string;
  /** Slash-joined numeric loca segments relative to `repoGuid`, `""` for the repo root. */
  loca: string;
}

/** Decodes a route slug straight to `{repoGuid, loca}` — the shape `/api/folders?repoGuid=&loca=` expects — without an intermediate address round-trip. `null` if malformed/invalid. */
export function cpRouteSlugToParts(slug: string): CpAddressParts | null {
  const address = cpRouteSlugToAddress(slug);
  if (!address) return null;
  const repoGuid = address.split("/")[0];
  const loca = address === repoGuid ? "" : address.slice(repoGuid.length + 1);
  return { repoGuid, loca };
}
