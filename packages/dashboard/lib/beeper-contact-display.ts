/**
 * Some Beeper/WhatsApp contacts sync with `displayName` set to the raw
 * Matrix-style sender id (e.g. `@jtW4D5VS...:local-whatsapp.localhost`) —
 * no proper name was ever resolved for them at sync time. When that
 * happens, prefer `identities[].senderName` if any identity actually has
 * one; otherwise there's genuinely no better name available, so the raw
 * id is still shown rather than fabricating a placeholder.
 */
const RAW_MATRIX_ID_PATTERN = /^@[^:@\s]+:\S+$/;

export function beeperContactDisplayName(
  displayName: string,
  identities?: Array<{ senderName?: string }>
): string {
  if (!RAW_MATRIX_ID_PATTERN.test(displayName)) return displayName;
  const withName = identities?.find((i) => i.senderName?.trim());
  return withName?.senderName?.trim() || displayName;
}
