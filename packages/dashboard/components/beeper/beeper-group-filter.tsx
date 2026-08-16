"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface BeeperGroupOption {
  _id: string;
  name: string;
}

export interface BeeperGroupFilterProps {
  value: string | undefined;
  onChange: (groupId: string | undefined) => void;
  /** Bumped by the Groups tab after creating/renaming a group, so this list stays fresh without a full page reload. */
  refreshKey?: number;
  /** Merged onto the base classes (e.g. a caller matching a shorter search input's height) — base styling is unaffected when omitted. */
  className?: string;
}

/**
 * Group filter combobox (Story 101) — sits in the tab row, to the left of
 * Conversations, and filters whichever contact-list tab is active
 * (Conversations / Permissions / Msg workout all read the same `?group=`
 * query param). "All groups" clears the filter.
 */
export function BeeperGroupFilter({ value, onChange, refreshKey, className }: BeeperGroupFilterProps) {
  const [groups, setGroups] = useState<BeeperGroupOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/beeper-crm/groups")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setGroups(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <select
      className={cn("h-10 rounded-[9px] border border-border bg-background px-2 text-sm", className)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label="Filter by contact group"
      title="Filter contacts by group"
    >
      <option value="">All groups</option>
      {groups.map((g) => (
        <option key={g._id} value={g._id}>
          {g.name}
        </option>
      ))}
      <option value="__none__">— no group —</option>
    </select>
  );
}
