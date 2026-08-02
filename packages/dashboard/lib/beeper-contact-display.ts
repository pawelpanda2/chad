/**
 * Some Beeper/WhatsApp contacts sync with `displayName` set to the raw
 * Matrix-style sender id (e.g. `@jtW4D5VS...:local-whatsapp.localhost`) —
 * no proper name was ever resolved for them at sync time. When that
 * happens, prefer, in order: `identities[].senderName` (a real name), then
 * `identities[].username` (phone number for WhatsApp / handle for
 * Instagram — see `packages/beeper-sync/lib/sqlite-sync.mjs`
 * `fetchParticipants()`, only populated going forward from the fix that
 * wired it through; contacts synced before that still show the raw id
 * until they message again). Otherwise there's genuinely no better name
 * available, so the raw id is still shown rather than fabricating a
 * placeholder.
 */
const RAW_MATRIX_ID_PATTERN = /^@[^:@\s]+:\S+$/;

export function beeperContactDisplayName(
  displayName: string,
  identities?: Array<{ senderName?: string; username?: string }>
): string {
  if (!RAW_MATRIX_ID_PATTERN.test(displayName)) return displayName;
  const withName = identities?.find((i) => i.senderName?.trim());
  if (withName?.senderName?.trim()) return withName.senderName.trim();
  const withUsername = identities?.find((i) => i.username?.trim());
  if (withUsername?.username?.trim()) return withUsername.username.trim();
  return displayName;
}
