/**
 * Story 86 — resolve Beeper contact sync mode from Mongo contact fields.
 * Shared by beeper-sync (copied into oplog as the same rules).
 *
 * include=true  → full messages
 * exclude=true  → skip entirely
 * both false    → metadata only (no messages)
 * unset         → include (pre-migration safety)
 */

export function resolveSyncMode(contact) {
  if (!contact) return "include";
  if (contact.exclude === true) return "exclude";
  if (contact.include === true) return "include";
  if (contact.include === false && contact.exclude !== true) return "metadata";
  if (contact.include == null && contact.exclude == null) return "include";
  return "metadata";
}
