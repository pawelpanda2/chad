import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const AUDIT_PATH =
  process.env.DEV_DATA_SOURCE_AUDIT_PATH || "/app/data/dev-data-source-audit.log";

export function appendDevDataSourceAudit(entry: {
  from: string;
  to: string;
  at: string;
}): void {
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    appendFileSync(
      AUDIT_PATH,
      JSON.stringify({ event: "chad_data_source_switch", ...entry }) + "\n",
      "utf8"
    );
  } catch {
    // Best-effort audit log.
  }
}

export function devDataSourceAuditPath(): string {
  return AUDIT_PATH;
}
