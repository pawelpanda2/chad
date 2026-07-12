/**
 * Types for the TypeScript/Node.js Content Provider, verified 2026-07-12
 * against the real .NET source (not guessed) — see
 * `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg`:
 * `AAPublic/Names/ConfigKeys.cs`, `AAPublic/Names/UniType.cs`,
 * `Models/ItemModel.cs` (required-field enforcement),
 * `Duplications/Operations/UniAddressOperations.cs` (address format).
 *
 * config.yaml is NOT a closed schema in .NET — it deserializes to a loose
 * `Dictionary<string, object>` (ConfigWorker.cs) and any extra key
 * round-trips untouched. `CpConfig` models that: required keys enforced by
 * `ItemModel.SetIndentificators`, everything else falls into the index
 * signature.
 *
 * IMPORTANT: there is no `created` field anywhere in the real config.yaml
 * schema (checked 12630 real config.yaml files on disk — zero have it, and
 * ConfigKeys.cs / ItemModel.cs confirm it isn't part of the model). An
 * earlier placeholder version of this file required it — that was wrong,
 * removed.
 */

/** `Ref` = a reference/alias item pointing at another item via refAddress/refGuid — NOT yet handled by cp-files (see cp-files/README.md). */
export type CpItemType = "Folder" | "Text" | "Ref";

/**
 * Required fields of config.yaml, per `ItemModel.SetIndentificators`
 * (throws if any is missing/empty). `address` is technically
 * self-healing in .NET (`MigrationWorker.TryMigrateConfig` backfills it if
 * missing/stale) but is always present on anything actually read.
 *
 * Format of `address`: slash-joined, e.g. "<repoGuid>/01/02/03" — this is
 * the ONLY address format persisted to config.yaml and used internally
 * (`Duplications/Operations/UniAddressOperations.CreateAddresFromAdrTuple`).
 * A dash-joined form ("<repoGuid>-01-02-03") exists in the .NET codebase
 * too, but only in a separate, differently-wired `UniAddressOperations`
 * class (`SharpOperations` project) used solely for building outward-facing
 * HTTP URLs — do not confuse the two. `loca` parameters on
 * `ContentProviderStorage` methods are ALSO slash-joined (confirmed
 * against the real, working contract in
 * documentation/dba/resolve-paths.md, e.g. `loca = "03/06"`, and against
 * .NET's `ValidationWorker.ValidateItemLocaBeforePut`, which does
 * `adrTuple.Loca.Split('/')`) — this is a plain substring of `address`
 * with the repo GUID prefix stripped. `packages/cp-plugin`'s
 * dash-joined form is a separate, unrelated convention for its own local
 * HTTP URL scheme — do not conflate the two.
 */
export interface CpConfigRequired {
  id: string;
  type: CpItemType;
  name: string;
  address: string;
}

/** Only present when `type: "Ref"` — ConfigKeys.RefAddress / ConfigKeys.RefGuid. */
export interface CpConfigRef {
  refAddress?: string;
  refGuid?: string;
}

export type CpConfig = CpConfigRequired & CpConfigRef & Record<string, unknown>;

export interface CpBody {
  address: string;
  content: string;
}
