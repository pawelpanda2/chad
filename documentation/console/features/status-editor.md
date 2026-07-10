# Status Editor Feature

## Overview

The Status Editor is a feature in `chad-console` that allows managing and updating status items for leads (girls). It consists of two main options in the main menu:

- **Option 3: Statuses Setup** - For creating and initializing status items
- **Option 4: Statuses Update** - For updating existing status items

## Statuses Update (Option 4)

### Flow

1. **Main Menu Selection**: User selects `4. Statuses Update` from the main menu

2. **Data Loading**: The system:
   - Fetches all leads using `GetAllLeads()`
   - Fetches all statuses using `chad_GetLeadsStatuses()`
   - Merges leads with their corresponding statuses
   - Shows diagnostic information:
     ```
     Loaded leads: 63
     Loaded statuses: X
     Merged leads: 63
     Missing status: X
     Empty status: X
     Outdated status: X
     Valid status: X
     ```

3. **Range Selection (Text Input)**: User is prompted to select a range of leads:
   ```
   Który zakres leadów pokazać?
     all       - wszystkie
     1,4,5     - konkretne pozycje
     1-10      - zakres
     -10       - ostatnie 10 najnowszych
   
   Zakres:
   ```
   
   Supported formats:
   - `all` - all leads
   - `1,4,5` - specific positions (comma-separated)
   - `1-10` - range (dash-separated)
   - `-10` - last N newest leads (negative number prefix)

4. **Interactive Picker (Arrow Keys)**: After selecting the range, an interactive picker opens using `@clack/prompts`:
   ```
   ◆ Wybierz leada do edycji:
   │  ○ 75. 26-05-29_pn_Amelia [ważny]
   │  ○ 77. 26-05-30_pn_Roksana_Characzko [nieaktualny]
   │  ● 88. 26-07-04_pi_Karolina [brak statusu]
   │  ○ 0. Wróć
   ```
   
   **Important**: 
   - The default selection is the **last real lead** in the range (not the "Wróć" option)
   - This is because the list is sorted oldest-to-newest, and users typically work with the newest leads
   - `all`, `1-10`, `-10` are entered at the range selection stage, NOT in the picker

5. **Sorting**: The lead list is sorted by date extracted from the lead name:
   - Format: `YY-MM-DD_name` (e.g., `26-05-30_pn_Roksana`)
   - Oldest leads at the top
   - Newest leads at the bottom

6. **Editing a Lead**:
   - If lead has `[brak statusu]` (missing status):
     - Ask: "Status nie istnieje. Utworzyć teraz? (t/n)"
     - If yes: Create status using `createStatusForLead()` + `putStatusContent()`
     - If no: Return to picker
   - If lead has existing status:
     - Open status editor with field selection
     - Show current values and old values
     - Allow editing individual fields
     - Show preview before saving
     - After saving, return to the same picker

7. **After Editing**:
   - Return to the same picker with the same range
   - Do NOT automatically advance to next lead
   - Do NOT return to main menu
   - User can continue editing other leads in the range

8. **Back Option**: Selecting `0. Wróć` in the picker returns to the main menu

## Key Architecture Decisions

### Source of Truth
- The lead list is built from `GetAllLeads().Body` - this is the source of truth
- Status is only metadata attached to leads
- Leads without statuses are included in the list with `[brak statusu]` category

### Two-Stage Selection
1. **Stage 1**: Text input for range selection (`all`, `1-10`, `-10`, etc.)
2. **Stage 2**: Interactive picker with arrow keys for individual lead selection

The `all` command is entered at Stage 1, NOT in the picker.

### Default Selection
The picker defaults to the last real lead in the selected range because:
- List is sorted oldest-to-newest
- Users typically work with newest leads
- Avoids having to scroll down manually

### No Batch Auto-Edit
- After editing one lead, user returns to the picker
- No automatic advancement to next lead
- User explicitly selects each lead to edit