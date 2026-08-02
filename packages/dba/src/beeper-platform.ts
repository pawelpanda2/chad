/**
 * Beeper platform (network) normalization + selection for GUI icons.
 *
 * Real Beeper/Bridge `network` values in this repo are NOT short names —
 * live inventory (pawel_f, 2026-08-02) found:
 *   identity/message: local-whatsapp_ba_…, local-instagram_ba_…, matrix, hungryserv
 *   channel: same + $other, $space
 * Docs also mention short forms (whatsapp, telegram, imessage, signal, gcm/sms).
 * Mapping matches substrings / aliases of those real values — never guesses
 * from a contact's display name.
 */

export type BeeperPlatformKey =
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "facebook"
  | "signal"
  | "sms"
  | "imessage"
  | "unknown";

export interface BeeperPlatformMeta {
  key: BeeperPlatformKey;
  label: string;
}

const META: Record<BeeperPlatformKey, BeeperPlatformMeta> = {
  whatsapp: { key: "whatsapp", label: "WhatsApp" },
  instagram: { key: "instagram", label: "Instagram" },
  telegram: { key: "telegram", label: "Telegram" },
  facebook: { key: "facebook", label: "Facebook" },
  signal: { key: "signal", label: "Signal" },
  sms: { key: "sms", label: "SMS" },
  imessage: { key: "imessage", label: "iMessage" },
  unknown: { key: "unknown", label: "Unknown" },
};

/** Internal Beeper/Matrix plumbing — never shown as a user-facing platform. */
const NON_PLATFORM_NETWORKS = new Set(["$other", "$space", "hungryserv", "matrix"]);

export function getBeeperPlatformMeta(key: BeeperPlatformKey): BeeperPlatformMeta {
  return META[key] ?? META.unknown;
}

/**
 * Map a raw Beeper `network` string to a platform key. Case-insensitive;
 * matches bridge ids (`local-whatsapp_ba_…`) and short aliases (`whatsapp`).
 */
export function normalizeBeeperNetwork(raw: string | null | undefined): BeeperPlatformKey {
  if (raw == null) return "unknown";
  const s = String(raw).trim().toLowerCase();
  if (!s || NON_PLATFORM_NETWORKS.has(s)) return "unknown";

  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("telegram")) return "telegram";
  if (s.includes("signal")) return "signal";
  if (s.includes("imessage") || s.includes("local-imessage") || s.includes("applemessaging")) {
    return "imessage";
  }
  if (
    s === "gcm" ||
    s === "sms" ||
    s.includes("googlemsg") ||
    s.includes("googlemessages") ||
    s.includes("local-sms") ||
    s.includes("androidsms")
  ) {
    return "sms";
  }
  if (s.includes("facebook") || s.includes("messenger") || s.includes("meta-messenger")) {
    return "facebook";
  }

  return "unknown";
}

function uniqueMeaningfulNetworks(networks: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of networks) {
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    if (NON_PLATFORM_NETWORKS.has(trimmed.toLowerCase())) continue;
    if (normalizeBeeperNetwork(trimmed) === "unknown") continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Pick the network string that represents the conversation/contact row.
 * Priority (Story platform icons):
 *   1. lastMessage.network for the presented conversation
 *   2. single unambiguous channel network
 *   3. single unambiguous identity network
 *   4. null → unknown (never identities[0] when ambiguous)
 */
export function resolveBeeperPlatformNetwork(input: {
  lastMessageNetwork?: string | null;
  channelNetworks?: Array<string | null | undefined>;
  identityNetworks?: Array<string | null | undefined>;
}): string | null {
  const last = input.lastMessageNetwork?.trim();
  if (last && normalizeBeeperNetwork(last) !== "unknown") return last;

  const channels = uniqueMeaningfulNetworks(input.channelNetworks ?? []);
  if (channels.length === 1) return channels[0];
  if (channels.length > 1) return null;

  const identities = uniqueMeaningfulNetworks(input.identityNetworks ?? []);
  if (identities.length === 1) return identities[0];
  return null;
}
