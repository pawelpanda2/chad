/**
 * Placeholder types for the future TypeScript/Node.js Content Provider.
 *
 * These reflect decisions already made in
 * documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md
 * (compatibility model: one file per document, address+fileName as the
 * unique key) — not guesses. Nothing here is wired up to anything yet.
 */

export type CpItemType = "Folder" | "Text";

/** Required fields of config.yaml — anything else goes in remaining_config. */
export interface CpConfigRequired {
  id: string;
  type: CpItemType;
  name: string;
  address: string;
  created: string;
}

export type CpConfig = CpConfigRequired & Record<string, unknown>;

export interface CpBody {
  address: string;
  content: string;
}
