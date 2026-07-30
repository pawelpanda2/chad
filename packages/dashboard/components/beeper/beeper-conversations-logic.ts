/**
 * Pure logic for the Beeper Conversations split-view (Story 94). No React,
 * no fetch — kept separate so it's directly unit-testable (same pattern as
 * components/msg-automation/ai-prompt-kind.ts).
 */

export interface BeeperConversationContactLike {
  _id: string;
  displayName: string;
}

/** Contacts whose displayName matches the search query (case-insensitive). */
export function filterBeeperContacts<T extends BeeperConversationContactLike>(
  contacts: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter((c) => c.displayName.toLowerCase().includes(q));
}

export interface SplitHandleProps {
  ariaLabel: string;
  /** "left" = ChevronLeft (list expanded, action collapses it), "right" = ChevronRight (list collapsed, action expands it). */
  icon: "left" | "right";
}

/** Icon + aria-label for the collapse/expand handle, keyed only by current collapsed state. */
export function splitHandleProps(isListCollapsed: boolean): SplitHandleProps {
  return isListCollapsed
    ? { ariaLabel: "Expand conversation list", icon: "right" }
    : { ariaLabel: "Collapse conversation list", icon: "left" };
}

/**
 * Whether the conversation panel should render the shared BeeperConversationView
 * at all. Deliberately false for both "nothing selected" and "selected but
 * empty" so the panel falls back to a bare empty div instead of the shared
 * renderer's own icon+text empty state (banned by this Story's spec).
 */
export function shouldRenderConversation(
  selectedContactId: string | null,
  messageCount: number
): boolean {
  return Boolean(selectedContactId) && messageCount > 0;
}
