import type { GoogleContactGroupDto } from "./types.js";

export interface GoogleContactGroupLike {
  resourceName?: string | null;
  name?: string | null;
  formattedName?: string | null;
  groupType?: string | null;
  memberCount?: number | null;
  metadata?: { deleted?: boolean | null } | null;
}

export function mapContactGroup(group: GoogleContactGroupLike | null | undefined): GoogleContactGroupDto | null {
  if (!group || typeof group !== "object") return null;
  if (group.metadata?.deleted) return null;
  const resourceName = typeof group.resourceName === "string" ? group.resourceName.trim() : "";
  if (!resourceName) return null;
  const name = (group.formattedName?.trim() || group.name?.trim() || "").trim();
  if (!name) return null;
  return {
    resourceName,
    name,
    groupType: typeof group.groupType === "string" && group.groupType.trim() ? group.groupType.trim() : null,
    memberCount: typeof group.memberCount === "number" ? group.memberCount : null,
  };
}
