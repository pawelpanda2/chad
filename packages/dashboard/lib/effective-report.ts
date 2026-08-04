/**
 * Single rule for which report feeds AI preview / Send.
 * Keep in sync with `effectiveReportAddress` in `packages/dba/src/report-browse.ts`
 * (tested there). Client-safe — no DBA provider imports.
 */

export type UserReportSelection =
  | { status: "unset" }
  | { status: "none" }
  | { status: "report"; address: string };

export function effectiveReportAddress(
  autoReportAddress: string | null,
  userReport: UserReportSelection,
): string | null {
  if (userReport.status === "unset") return autoReportAddress;
  if (userReport.status === "none") return null;
  return userReport.address;
}
