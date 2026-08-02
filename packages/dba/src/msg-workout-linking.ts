/**
 * `config.links.beeper` read/write for msg workout items (Story 99).
 *
 * Storage: a free-form key on the workout Text item's own CP config
 * (`CpItemConfig` allows arbitrary keys — see cp-model.ts) — no new
 * collection, no new backend. Written via `item-ops.ts`'s `putItemConfig`
 * (config-only, body untouched), same convention every other CP write in
 * this repo already follows for config-only updates.
 */

import type { CpItem } from "./cp-model.js";
import { putItemConfig } from "./item-ops.js";

export interface MsgWorkoutBeeperLink {
  /** Stringified Mongo `_id` of the linked Beeper message — never the content-hash UI id. */
  messageId: string;
  /** ISO 8601 — the message's own timestamp. */
  timestamp: string;
  /** ISO 8601 — when this link was written. */
  linkedAt: string;
  method: "automatic" | "manual";
}

export type MsgWorkoutLinkEligibility = "eligible" | "already-linked" | "already-analyzed";

function readBeeperLink(item: CpItem): MsgWorkoutBeeperLink | null {
  const links = item.config.links as { beeper?: MsgWorkoutBeeperLink } | undefined;
  return links?.beeper ?? null;
}

export function getMsgWorkoutBeeperLink(item: CpItem): MsgWorkoutBeeperLink | null {
  return readBeeperLink(item);
}

/**
 * Spec 1.7: never re-analyze a workout that's already linked, or already
 * has a proposal in any status (proposed/accepted/rejected/obsolete — the
 * mere presence of a proposal item means "already analyzed", regardless of
 * its status). `hasProposal` is a caller-supplied fact (from
 * msg-workout-proposals.ts) since eligibility here is pure/synchronous.
 */
export function getMsgWorkoutLinkEligibility(item: CpItem, hasProposal: boolean): MsgWorkoutLinkEligibility {
  if (readBeeperLink(item)) return "already-linked";
  if (hasProposal) return "already-analyzed";
  return "eligible";
}

/**
 * Writes `config.links.beeper`, preserving every other existing config key
 * (including other `links.*` entries) untouched. Idempotent and safe to
 * call repeatedly: if `links.beeper` is already set, this is a no-op that
 * returns the item unchanged — it never overwrites an existing link,
 * manual or automatic (spec 1.3/1.7).
 */
export async function writeMsgWorkoutBeeperLink(
  item: CpItem,
  link: Omit<MsgWorkoutBeeperLink, "linkedAt" | "method"> & { linkedAt?: string; method?: MsgWorkoutBeeperLink["method"] }
): Promise<CpItem> {
  if (readBeeperLink(item)) {
    return item;
  }

  const existingLinks = (item.config.links as Record<string, unknown> | undefined) ?? {};
  const nextConfig = {
    ...item.config,
    links: {
      ...existingLinks,
      beeper: {
        messageId: link.messageId,
        timestamp: link.timestamp,
        linkedAt: link.linkedAt ?? new Date().toISOString(),
        method: link.method ?? "automatic",
      } satisfies MsgWorkoutBeeperLink,
    },
  };

  return putItemConfig({ ...item, config: nextConfig });
}
