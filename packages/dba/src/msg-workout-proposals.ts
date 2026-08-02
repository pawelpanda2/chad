/**
 * Msg workout ↔ Beeper proposal storage (Story 99).
 *
 * Logical CP tree `links/msg workout/<leadName>/<workoutName>` — physical
 * folders are numeric, logical names live in `config.name` (same model as
 * every other CP folder chain in this repo, e.g. `views/dates`). One Text
 * item per analyzed-but-not-auto-linkable workout, named after the
 * workout's own logical name (unique within one lead's `msg workout`
 * folder — see `generateWorkoutName` in leads.ts) so the item name is both
 * a stable proposal key and the "already analyzed" marker.
 */

import yaml from "js-yaml";
import type { CpItem } from "./cp-model.js";
import { resolveByNames, getChildrenOf, createOrGetChild, findOrCreateFolderChain, putItemBody } from "./item-ops.js";
import type { MatchCandidate, ProposalReason } from "./msg-workout-matching.js";

export type MsgWorkoutProposalStatus = "proposed" | "accepted" | "rejected" | "obsolete";

export interface MsgWorkoutProposal {
  lead: string;
  msgWorkoutItemId: string;
  msgWorkoutItemName: string;
  status: MsgWorkoutProposalStatus;
  analyzedAt: string;
  reason: ProposalReason;
  candidates: MatchCandidate[];
}

const PROPOSALS_ROOT = ["links", "msg workout"];

/**
 * Read-only existence check — never creates the `links/msg workout/<lead>`
 * chain just to discover it's empty (that would litter empty proposal
 * folders on every lead ever analyzed, including ones with nothing to
 * propose).
 */
export async function getExistingProposal(leadName: string, workoutName: string): Promise<CpItem | null> {
  const leadFolder = await resolveByNames([...PROPOSALS_ROOT, leadName]);
  if (!leadFolder) return null;
  const children = await getChildrenOf(leadFolder.config.address);
  return children.find((c) => c.config.name === workoutName) ?? null;
}

export async function hasExistingProposal(leadName: string, workoutName: string): Promise<boolean> {
  return (await getExistingProposal(leadName, workoutName)) !== null;
}

function serializeProposal(proposal: MsgWorkoutProposal): string {
  return yaml.dump(proposal, { lineWidth: -1 });
}

export function parseProposalBody(body: string): MsgWorkoutProposal | null {
  try {
    const parsed = yaml.load(body);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MsgWorkoutProposal;
  } catch {
    return null;
  }
}

/**
 * Creates the proposal item if (and only if) it doesn't already exist —
 * never overwrites an existing proposal, which is what makes rerunning the
 * analysis safe (spec 1.6 "nie twórz duplikatów", 1.7 rerun idempotency).
 * Returns the existing item unchanged if one is already there.
 */
export async function writeProposal(leadName: string, workoutName: string, proposal: MsgWorkoutProposal): Promise<CpItem> {
  const leadFolder = await findOrCreateFolderChain([...PROPOSALS_ROOT, leadName]);
  const existingChildren = await getChildrenOf(leadFolder.config.address);
  const existing = existingChildren.find((c) => c.config.name === workoutName);
  if (existing) {
    return existing;
  }

  const created = await createOrGetChild(leadFolder, workoutName, "Text");
  return putItemBody(created.config.address, serializeProposal(proposal));
}

/**
 * Flips an existing proposal's status (manual assignment via the GUI's
 * numeric combobox — see msg-workout-linking.ts's `setMsgWorkoutBeeperLinkManual`).
 * No-op (not an error) if there's no proposal item for this workout — a
 * workout can be manually linked without ever having had a proposal at all
 * (e.g. one of the "undated" ones).
 */
export async function setProposalStatusIfExists(
  leadName: string,
  workoutName: string,
  status: MsgWorkoutProposalStatus
): Promise<void> {
  const existing = await getExistingProposal(leadName, workoutName);
  if (!existing) return;
  const proposal = parseProposalBody(existing.body);
  if (!proposal) return;
  await putItemBody(existing.config.address, serializeProposal({ ...proposal, status }));
}

export interface ProposalListEntry {
  name: string;
  loca: string;
  proposal: MsgWorkoutProposal | null;
}

/** For the GUI/report — every proposal currently stored for a lead. */
export async function listProposalsForLead(leadName: string): Promise<ProposalListEntry[]> {
  const leadFolder = await resolveByNames([...PROPOSALS_ROOT, leadName]);
  if (!leadFolder) return [];
  const children = await getChildrenOf(leadFolder.config.address);
  const { addressToRepoAndLoca } = await import("./cp-model.js");
  return children.map((c) => ({
    name: c.config.name,
    loca: addressToRepoAndLoca(c.config.address).loca,
    proposal: parseProposalBody(c.body),
  }));
}
