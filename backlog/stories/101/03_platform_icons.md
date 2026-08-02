# Story 101 follow-up — Beeper platform icons + Permissions layout

## Network inventory (read-only, local Mongo `beeper_21d11bdc-…`, 2026-08-02)

| Source | Values (counts) |
|--------|-----------------|
| `identities.network` | `local-whatsapp_ba_…` 136, `local-instagram_ba_…` 18, `matrix` 5, `hungryserv` 2 |
| `channels.network` | whatsapp-bridge 151, instagram-bridge 20, `$space` 3, `hungryserv` 2, `$other` 1 |
| `messages.network` | whatsapp-bridge 3475, instagram-bridge 369, `matrix` 17, `hungryserv` 11 |
| contact.lastMessage on docs | unused on contact docs (list API computes last message) |

No whatsapp+instagram dual-identity contacts in this DB. Cross-network ambiguity still handled: never pick `identities[0]` when multiple real networks exist.

## Central mapper

- `packages/dba/src/beeper-platform.ts` — `normalizeBeeperNetwork`, `resolveBeeperPlatformNetwork`, `getBeeperPlatformMeta`
- `packages/dashboard/components/beeper/beeper-platform-icon.tsx` — one icon component for all four views
- List items gain `platformNetwork` (resolved in DBA without extra queries)

## Views

- Groups: `Group \| Platform \| Name`
- Conversations + Msg workout: platform icon replaces letter avatar (shared list)
- Permissions: `Include \| Exclude \| Platform \| Name`, Updated removed, compact left-aligned
