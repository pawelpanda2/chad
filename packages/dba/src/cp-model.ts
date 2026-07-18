/**
 * Canonical Content Provider Item model — backend-independent.
 *
 * One CpItem == one Content Provider Item (Folder or Text). This mirrors
 * the real C# `ItemModel` contract audited in
 * `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Models/ItemModel.cs`
 * (see Story 72 `03_knowledge.md`): the only 4 config keys CP itself
 * enforces are `id`, `type`, `name`, `address` — everything else in
 * `config` is free-form and round-trips through CP transparently.
 *
 * `created`/`modified` are NOT part of CP's own schema (confirmed absent
 * from `ConfigKeys.cs`); they are CHAD-authored convention fields stored
 * as ordinary custom keys inside `config`.
 */

export type CpItemType = "Folder" | "Text" | string;

export interface CpItemConfig {
  id: string;
  address: string;
  type: CpItemType;
  name: string;
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface CpItem {
  _id: string;
  config: CpItemConfig;
  body: string;
}

export interface CpItemValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * The full-string address format CP itself uses:
 * `<repoGuid>/<loca>` where loca is `/`-joined 2-or-3-digit segments
 * (e.g. "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/02/84"), or bare
 * `<repoGuid>` for the repo root item.
 */
const ADDRESS_PATTERN = /^[^/]+(\/\d{2,3})*$/;

/**
 * Central validation — the 8 checks required by every provider before a
 * write, in exactly one place (providers must never re-implement this).
 */
export function validateCpItem(item: CpItem): CpItemValidationResult {
  const errors: string[] = [];

  if (!item._id) {
    errors.push("item._id is missing");
  }
  if (!item.config) {
    errors.push("item.config is missing");
    return { ok: false, errors };
  }
  if (item._id !== item.config.id) {
    errors.push(
      `item._id ("${item._id}") does not match item.config.id ("${item.config.id}")`
    );
  }
  if (!item.config.address) {
    errors.push("item.config.address is missing");
  } else if (!ADDRESS_PATTERN.test(item.config.address)) {
    errors.push(
      `item.config.address ("${item.config.address}") does not match the CP address format`
    );
  }
  if (!item.config.name) {
    errors.push("item.config.name is missing");
  }
  if (!item.config.type) {
    errors.push("item.config.type is missing");
  }
  if (typeof item.body !== "string") {
    errors.push("item.body must be a string");
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidCpItem(item: CpItem): void {
  const result = validateCpItem(item);
  if (!result.ok) {
    throw new Error(
      `Invalid CpItem (id=${item?._id}, address=${item?.config?.address}): ${result.errors.join("; ")}`
    );
  }
}

/**
 * Splits a full CP address into the repo GUID and the numeric loca
 * segments — e.g. "21d.../04/02/84" -> { repoGuid: "21d...", segments:
 * ["04","02","84"] }. The repo root item's address is just the bare GUID
 * (segments: []).
 */
export function splitAddress(address: string): { repoGuid: string; segments: string[] } {
  const parts = address.split("/");
  const [repoGuid, ...segments] = parts;
  return { repoGuid, segments };
}

export function joinAddress(repoGuid: string, segments: string[]): string {
  return segments.length === 0 ? repoGuid : `${repoGuid}/${segments.join("/")}`;
}

/**
 * True address-string equivalent of `IItemWorker`'s `(Repo, Loca)` tuple —
 * `loca` is the segments after the repo GUID, joined with "/", or "" at
 * the repo root (matches `PathWorker.GetItemPath`'s own `elemPath += "/"
 * + loca` only when `loca !== ""`).
 */
export function addressToRepoAndLoca(address: string): { repo: string; loca: string } {
  const { repoGuid, segments } = splitAddress(address);
  return { repo: repoGuid, loca: segments.join("/") };
}

export function repoAndLocaToAddress(repo: string, loca: string): string {
  return loca ? `${repo}/${loca}` : repo;
}

/**
 * Zero-padding rule ported verbatim from
 * `SharpOperationsProg/Operations/Index/IndexOperations.cs`'s
 * `IndexToString`: 1-9 -> "01".."09", 10-99 -> "10".."99", 100-999 ->
 * "100".."999", nothing beyond (CP itself throws past 999).
 */
export function formatChildIndex(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > 999) {
    throw new Error(`formatChildIndex: index out of range (1-999): ${index}`);
  }
  if (index < 10) {
    return `0${index}`;
  }
  return String(index);
}

/**
 * Inverse of `formatChildIndex`, ported from `IndexOperations.StringToIndex`
 * (max 3 chars, must parse as an int).
 */
export function parseChildIndex(segment: string): number {
  if (segment.length === 0 || segment.length > 3 || !/^\d+$/.test(segment)) {
    throw new Error(`parseChildIndex: not a valid CP index segment: "${segment}"`);
  }
  return parseInt(segment, 10);
}

/**
 * Ports `ReadFolderWorker.GetNextIndex`/`GetFolderLastNumber`: given the
 * full addresses of a parent's *direct* children (one segment deeper than
 * `parentAddress`), returns the next free index string. Siblings whose
 * last segment isn't a valid CP index are ignored (CP itself only ever
 * creates numeric child folders — `ValidationWorker` enforces this on the
 * CP side; ignoring non-numeric names here rather than throwing keeps this
 * pure helper usable even against a not-yet-validated sibling list).
 */
export function nextChildIndexFromSiblings(
  parentAddress: string,
  siblingAddresses: string[]
): string {
  const prefix = `${parentAddress}/`;
  let last = 0;
  for (const address of siblingAddresses) {
    if (!address.startsWith(prefix)) continue;
    const rest = address.slice(prefix.length);
    if (rest.includes("/")) continue; // not a direct child
    try {
      const n = parseChildIndex(rest);
      if (n > last) last = n;
    } catch {
      // non-numeric sibling name — ignore, see doc comment above
    }
  }
  return formatChildIndex(last + 1);
}

/**
 * CHAD's own `created`/`modified` timestamp convention
 * (`YYMMDD_HHMMSS`, matching the format already used elsewhere in this
 * repo's Content Provider item naming — see Story 62's
 * `daily-tracker-dates.md` index entry). Takes an explicit `Date` so
 * callers can inject a fixed clock in tests instead of `new Date()`.
 */
export function formatCpTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = pad(date.getFullYear() % 100);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yy}${mm}${dd}_${hh}${min}${ss}`;
}
