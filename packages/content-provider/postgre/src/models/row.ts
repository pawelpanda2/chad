/**
 * PostgreSQL row shape for cp_items (Story 80 schema) — Mongo-specific
 * document types live under packages/content-provider/mongo/, not here.
 */

import type { CpItemType } from "cp-core";

export interface CpPostgreItemRow {
  id: string;
  repo_guid: string;
  address: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  body: string;
}

export function isCpItemType(value: unknown): value is CpItemType {
  return value === "Folder" || value === "Text" || value === "Ref";
}
