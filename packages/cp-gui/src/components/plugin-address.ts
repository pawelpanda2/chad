/**
 * Converts a Content Provider address (slash-joined, e.g.
 * "<repoGuid>/01/02" — what CpItem.Address/loca use everywhere else) into
 * cp-plugin's own dash-joined address format (e.g. "<repoGuid>-01-02" —
 * see packages/cp-plugin/ADDRESS_FORMATS.md). These are genuinely
 * different conventions (see cp-core/types.ts and
 * plugin-adapter.ts) — this is the one place components need to bridge
 * them, since plugin-adapter.ts intentionally does not do this conversion
 * itself (it takes cp-plugin-shaped addresses as-is).
 */
export function toPluginAddress(address: string): string {
  return address.replace(/\//g, "-");
}
