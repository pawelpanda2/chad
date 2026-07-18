# Bug: Chat displays folder body instead of conversation

## Symptom

When using "Wyświetl chaty znalezione" (option 3 in the OpenAI submenu), the displayed content shows:

```text
CHAT: 26-05-29_pn_Amelia
Kanał: whatsup
------------------------------------------------------------
{"01":"beeper","02":"manual"}
```

This is NOT the conversation content. This is the Body of a Folder item that contains the children map.

## Root Cause

The `chad_FindConversationByLeadName` function in `chad-dba/src/beeper.ts` had two issues:

1. **Wrong property name**: The code was checking `Settings.itemType` but the Content Provider API returns the type in `Settings.type`. This caused the type check to always fail (returning `undefined`), falling through to the "unknown item type" error.

2. **Missing traversal logic**: Even if the type was detected, the code was returning the Body of the item at `beeper/whatsup/[lead_name]` directly, without checking if it was a Folder that needed further traversal.

The path `beeper/whatsup/[lead_name]` can return two types of items:

1. **Text item** — the Body contains the actual conversation
2. **Folder item** — the Body contains a map of children (e.g., `{"01":"beeper","02":"manual"}`), requiring traversal to the "beeper" child to get the actual conversation

## Debug Output

Before fix, the debug showed:
```
Settings: {"id":"c205138b-8a23-4cc2-8306-b5ad900cfe2c","type":"Folder","name":"26-05-29_pn_Amelia","address":"21d11bdc-f1f4-44d1-b61a-3fa6b039c641/01/01/02"}
Settings.itemType: undefined
Body: {"01":"beeper","02":"manual"}
```

This confirmed:
- The property is `Settings.type` (value: "Folder"), not `Settings.itemType`
- The item is a Folder with children "beeper" and "manual"
- The code was incorrectly trying to use `Settings.itemType` which was always `undefined`

## Text vs Folder Difference

### Text Item (direct conversation)
```
beeper/whatsup/26-05-29_pn_Amelia
└── Settings.type = "Text"
└── Body = "Hello, how are you?\nI'm fine..."
```

### Folder Item (needs traversal)
```
beeper/whatsup/26-05-29_pn_Amelia
└── Settings.type = "Folder"
└── Body = {"01":"beeper","02":"manual"}
    ├── 01/beeper → Text item with actual conversation
    └── 02/manual → Text item with manual reference
```

## Correct Flow

1. Get item at `beeper/whatsup/[lead_name]`
2. Check `Settings.type`:
   - If **Text**: return `Body` as conversation
   - If **Folder**: 
     - Read Body to find child with value "beeper"
     - Get that child item
     - Return child's Body as conversation
3. If Folder has no "beeper" child, return diagnostic error with list of children

## Fix

Updated `chad_FindConversationByLeadName` in `src/beeper.ts` to:

1. Check the item type using `Settings.type` (NOT `Settings.itemType`)
2. If Text, return Body directly
3. If Folder, look for "beeper" child and traverse into it
4. Provide diagnostic error if folder has no "beeper" child

## Manual Test

1. Run `chad-console`
2. Select: `6. Ask OpenAI about girl`
3. Select lead: `26-05-29_pn_Amelia`
4. Select: `3. Wyświetl chaty znalezione`
5. Verify output is NOT `{"01":"beeper","02":"manual"}`
6. Verify output shows actual conversation content
7. After viewing chat, verify it returns to the lead submenu (not main menu)
8. Test with another lead where chat might be directly a Text item
9. Verify both variants work correctly

## Regression Note

During the fix, a regression was introduced where after viewing a chat, the CLI would return to the main menu instead of the lead submenu. This was fixed by removing the early exit logic and letting the `while (true)` loop in `showSummaryAndSubmenu` continue naturally.

## Related Documentation

- `architecture/chad-dba/cp-paths.md` — Updated with beeper/whatsup conversation path documentation
