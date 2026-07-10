# Lead Form Redesign - Feature Documentation

## Overview

This document describes the redesigned "Add Lead" form in the Forms tab, including its layout, name generation logic, and integration with the Content Provider.

## Form Structure

The form is located in the **Forms** tab and is accessed by clicking the **Add Lead** card.

### Section 1: Lead Name/Id

A bordered section containing the lead identification fields. The frame title includes a live preview of the generated lead name.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `Meeting Date` | Date picker | Date of meeting/contact (required) | `2026-06-07` → displayed as `26-06-07` |
| `Source` | Dropdown | Source of meeting (required, maps to 1st letter of code) | `Daygame` → `p` |
| `Name` | Text input | Lead's first name | `Ania` |
| `Surname` | Text input | Optional surname | `Styk` |
| `Postfix` | Text input | Optional distinguishing postfix | `ruda`, `z_browarow` |

**Field Order:** Meeting Date → Source → Name → Surname → Postfix

#### Live Preview in Header

The generated lead name is displayed inline with the frame title "Lead Name/Id":

```
Lead Name/Id   26-07-09_px_Ania
```

The preview updates live as fields are filled in.

### Section 2: Contacts

A dynamic section for adding multiple contacts:
- Select contact type from dropdown
- Click "+ New" to add a contact line
- Each line has a type label and value input
- Click "X" to remove a contact line
- Empty lines are not saved

Contact types available:
- `Number`
- `WhatsApp`
- `Instagram`
- `Facebook`
- `Telegram`

## Lead Name Generation Logic

The lead name is generated automatically in the format:
```
YY-MM-DD_<two-letter-code>_<Name>[_Surname][_Postfix]
```

### Two-Letter Code

#### First Letter: Source (Approach Kind)

| Code | Label |
|------|-------|
| `p` | Daygame |
| `n` | Nightgame |
| `t` | Tinder |
| `s` | Organized event |
| `z` | Friends |
| `w` | Her initiative |

#### Second Letter: First Contact Type

The second letter is derived from the **first contact** in the Contacts section:

| Code | Contact Type |
|------|--------------|
| `n` | Number |
| `w` | WhatsApp |
| `i` | Instagram |
| `f` | Facebook |
| `t` | Telegram |
| `x` | No contact (default) |

**Important:** The second letter is automatically determined:
- If no contacts are added → `x`
- If first contact is `number` → `n`
- If first contact is `instagram` → `i`
- etc.

### Examples

| Source | Contacts | Name | Generated Name |
|--------|----------|------|----------------|
| Daygame | (none) | Ania | `26-07-09_px_Ania` |
| Daygame | number: +48 123... | Ania | `26-07-09_pn_Ania` |
| Nightgame | instagram: @ania | Karolina | `26-07-09_ni_Karolina` |
| Tinder | whatsapp: +48..., instagram: @... | Marzenka | `26-07-09_tw_Marzenka` |

Note: Only the **first** contact determines the second letter. Additional contacts are stored in the contacts YAML but don't affect the code.

### Name Generation Code

```typescript
function generateLeadNamePreview(data, contacts) {
  const formattedDate = formatMeetingDay(data.meetingDay); // YY-MM-DD
  const firstLetter = data.approachKind || "x";
  const secondLetter = getSecondLetter(contacts); // from first contact, or "x"
  const code = `${firstLetter}${secondLetter}`;
  
  const parts = [formattedDate, code];
  if (data.name?.trim()) parts.push(data.name.trim().replace(/\s+/g, "_"));
  if (data.surname?.trim()) parts.push(data.surname.trim().replace(/\s+/g, "_"));
  if (data.postfix?.trim()) parts.push(data.postfix.trim().replace(/\s+/g, "_"));
  
  return parts.join("_");
}
```

## Content Provider Integration

### Backend Function (`chad-dba`)

Functions in `src/leads.ts`:

```typescript
// Check if a lead exists
export async function leadExists(leadName: string): Promise<boolean>

// Create a new lead with optional contacts
export async function createLead(
  leadName: string, 
  contactsYaml?: string
): Promise<CreateLeadResult>
```

### API Endpoint

`POST /api/forms/lead`

Request body:
```json
{
  "leadName": "26-06-07_pn_Ania",
  "meetingDay": "2026-06-07",
  "approachKind": "p",
  "name": "Ania",
  "surname": "",
  "postfix": "",
  "contacts": "number:\n  - +48 123 456 789\ninstagram:\n  - @user"
}
```

Note: `firstRealContact` is **not** sent in the request. It is encoded in the second letter of the `leadName` code.

Response on success:
```json
{
  "success": true,
  "leadName": "26-06-07_pn_Ania",
  "leadLoca": "03/06/123"
}
```

Response on duplicate:
```json
{
  "success": false,
  "error": "Lead \"26-06-07_pn_Ania\" już istnieje. Nie można utworzyć duplikatu.",
  "duplicate": true
}
```

### Storage Location

Leads are stored in the shared repository with the following structure:
```
<SHARED_REPO_ID>/leads/all-items/<leadName>/
  contacts (Text item with YAML content)
  msg workout (Folder item for message workouts)
```

Both child items are created automatically when a new lead is created:
- `contacts` - contains the contacts YAML (even if empty)
- `msg workout` - folder for storing message workout items

## Validation

### Required Fields
- `Meeting Date` - date of meeting
- `Source` - source of meeting
- `Name` - lead's first name (validated on backend)

### Optional Fields
- `Surname`
- `Postfix`
- `Contacts` - can be empty; no contact = second letter is `x`

### Duplicate Check
- Before creating, the system checks if a lead with the same name already exists
- If duplicate, returns error with status 409 (Conflict)
- Existing leads are never overwritten

## Files Modified

### chad-dba
- `src/leads.ts` - Contains `createLead()` and `leadExists()` functions

### chad-dashbord
- `app/(dashboard)/dashboard/forms/page.tsx` - Lead form UI with redesigned layout
- `app/api/forms/lead/route.ts` - API endpoint for creating leads

## Bug Fixes

### Bug: Missing Child Items After Lead Creation

**Problem:** When creating a new lead via the Add Lead form, only the main lead folder was created. The required child items `contacts` (text item) and `msg workout` (folder item) were not created, causing:
- "No contacts" displayed even when contacts were provided
- "Empty response body from /invoke" error when trying to access msg workouts

**Solution:** Updated `createLead()` function to always create the complete lead structure:
1. Create the main lead folder under `leads/all-items/[leadName]`
2. Create `contacts` text item under the lead
3. Write contacts YAML content to the `contacts` item (empty string if no contacts)
4. Create `msg workout` folder under the lead

This ensures the lead structure matches existing leads and the Leads tab can properly display contacts and msg workouts.

## Manual Testing

1. Navigate to **Forms** tab
2. Verify two cards are visible: **Action** and **Add Lead**
3. Click **Add Lead** card
4. Verify frame is titled **Lead Name/Id** with preview on the same line
5. Verify field order: Meeting Date | Source | Name | Surname | Postfix
6. Verify there is no separate "First Contact" field
7. Select **Source = Daygame**, enter **Name = Ania**
8. Verify preview shows: `26-07-09_px_Ania` (second letter is `x` = no contact)
9. In **Contacts** section:
   - Select type: `Number`
   - Click **+ New**
   - Enter value: `+48 123 456 789`
10. Verify preview changes to: `26-07-09_pn_Ania` (second letter changed to `n`)
11. Click **Save to Content Provider**
12. Verify success message appears
13. Verify no error "Pierwszy kontakt jest wymagany" appears
14. Navigate to **Leads** tab
15. Verify new lead `26-07-09_pn_Ania` appears in the list
16. Click on the lead to view details
17. Verify contacts are displayed correctly
18. Try creating the same lead again
19. Verify error message about duplicate lead appears