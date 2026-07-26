/**
 * Central registry of CP folders that represent dedicated GUI tables
 * (Daily Tracker, Dates, …). Generic Folders browser must treat these as
 * read-only; dedicated Daily/Dates APIs may still mutate their children.
 */

export type SystemFolderManagedBy = "Daily Tracker" | "Dates" | "Leads";

export interface SystemFolderSpec {
  /** Logical name chain under the repo root, e.g. ["views","daily"]. */
  namePath: string[];
  managedBy: SystemFolderManagedBy;
  reason: string;
}

export const SYSTEM_FOLDERS: readonly SystemFolderSpec[] = [
  {
    namePath: ["views", "daily"],
    managedBy: "Daily Tracker",
    reason: "Rows are owned by Daily Tracker / Daily Entry — edit there, not in Folders.",
  },
  {
    namePath: ["views", "dates"],
    managedBy: "Dates",
    reason: "Rows are owned by Dates / Date Entry — edit there, not in Folders.",
  },
  {
    namePath: ["leads"],
    managedBy: "Leads",
    reason: "Lead items are owned by the Leads GUI — edit there, not in Folders.",
  },
] as const;

export type SystemFolderErrorCode = "SYSTEM_FOLDER_READ_ONLY";

export class SystemFolderReadOnlyError extends Error {
  readonly code: SystemFolderErrorCode = "SYSTEM_FOLDER_READ_ONLY";
  constructor(
    public readonly managedBy: SystemFolderManagedBy,
    message: string
  ) {
    super(message);
    this.name = "SystemFolderReadOnlyError";
  }
}

export function findSystemFolderByNamePath(namePath: string[]): SystemFolderSpec | null {
  const key = namePath.join("/");
  return SYSTEM_FOLDERS.find((f) => f.namePath.join("/") === key) ?? null;
}

/**
 * Returns the system-folder spec when `namePath` is exactly a registered
 * folder, or is a descendant of one (e.g. views/daily/01).
 */
export function findProtectingSystemFolder(namePath: string[]): SystemFolderSpec | null {
  for (let len = namePath.length; len >= 1; len--) {
    const hit = findSystemFolderByNamePath(namePath.slice(0, len));
    if (hit) return hit;
  }
  return null;
}

export interface ReadOnlyFolderRow {
  name: string;
  /** Logical path shown in Settings, e.g. "views/daily". */
  address: string;
  managedBy: SystemFolderManagedBy;
  reason: string;
  status: "read-only";
}

export function listReadOnlyFolders(): ReadOnlyFolderRow[] {
  return SYSTEM_FOLDERS.map((f) => ({
    name: f.namePath[f.namePath.length - 1] ?? f.namePath.join("/"),
    address: f.namePath.join("/"),
    managedBy: f.managedBy,
    reason: f.reason,
    status: "read-only" as const,
  }));
}

/**
 * @param namePath Logical names from repo root to the item being written,
 *   or — for create-child — the parent folder's name path.
 * @param action create-child checks the parent; update/delete check the item
 *   (folder itself or any descendant).
 */
export function assertNotSystemFolderWrite(
  namePath: string[],
  action: "create-child" | "update-body" | "delete"
): void {
  if (action === "create-child") {
    const parent = findSystemFolderByNamePath(namePath);
    if (parent) {
      throw new SystemFolderReadOnlyError(
        parent.managedBy,
        `SYSTEM_FOLDER_READ_ONLY: "${parent.namePath.join("/")}" is managed by ${parent.managedBy}. ${parent.reason}`
      );
    }
    return;
  }

  const protecting = findProtectingSystemFolder(namePath);
  if (protecting) {
    throw new SystemFolderReadOnlyError(
      protecting.managedBy,
      `SYSTEM_FOLDER_READ_ONLY: "${protecting.namePath.join("/")}" is managed by ${protecting.managedBy}. ${protecting.reason}`
    );
  }
}
