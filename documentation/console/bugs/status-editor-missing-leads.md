# Status Editor - Missing Leads Bug

## Problem Description

The interactive status editor shows fewer leads than actually exist in the Content Provider.

### Example

**Content Provider** - `leads/all items` returns 66 leads:

```json
{
  "02": "20-08-14_pn_Ola_Supera",
  "04": "24-05-02_ti_Ania_Przędzik",
  "05": "25-01-25_ti_Karolina_Morańda",
  "07": "25-02-23_wi_Adrianna_Bardowska",
  "08": "25-02-18_of_Joanna_Bochenek",
  "09": "25-02-25_sx_Ola_Adamaszek",
  "10": "25-03-19_pf_Aleksandra_Karpińska",
  "11": "25-03-21_pn_mala-blondynka",
  "12": "25-03-23_pi_cypryjka",
  "17": "25-09-22_nn_Patrycja_Ritual",
  "18": "25-10-22_pn_wodkaisex",
  "19": "25-10-31_oi_gruszka",
  "20": "25-10-31_oi_ania_konkosia",
  "21": "25-10-31_oi_ewelina",
  "22": "25-10-31_oi_sandra",
  "23": "25-10-31_oi_katherine",
  "24": "26-01-31_si_natalia",
  "25": "26-01-31_si_magda",
  "33": "26-01-31_si_patrycja",
  "34": "26-01-06_ni_Weronika_Szczepkowska",
  "35": "26-02-07_si_Natalia_Hot",
  "36": "26-02-07_si_Patrycja_Parzych",
  "37": "26-02-07_si_Wiktoria_Soroka",
  "38": "26-02-07_si_Aleksandra_Ilyinskaya",
  "39": "26-02-07_si_Klaudia_Pastuszek",
  "40": "26-02-07_si_Matryna_Jezierska",
  "41": "26-02-07_si_Karolina_Wlach",
  "42": "26-02-07_si_Aleksandra_Goździk",
  "43": "26-02-07_si_Marta_Wardens",
  "44": "26-02-07_si_Anna_Kovval",
  "46": "26-02-07_si_Natalia_Kazulo",
  "47": "26-02-17_pi_Ira_Babenko",
  "48": "26-03-15_nn_Patrycja",
  "49": "17-07-20_pn_Diana_Diaków",
  "50": "26-04-09_pn_Karina",
  "51": "26-04-09_pn_Veranika_Yarasheushkaya",
  "52": "26-04-19_pn_India_Marczak",
  "53": "21-05-11_pf_Ilona_Plucińska",
  "54": "23-01-23_pf_mak-feral",
  "55": "26-04-26_nn_Ania",
  "56": "26-05-03_pi_Elena_Zubristka",
  "57": "26-05-03_pi_Liza",
  "58": "19-04-16_tf_Agnieszka_Babiuch",
  "60": "26-05-07_pi_Ola_Solodka",
  "62": "26-05-11_pn_Luba",
  "64": "26-05-11_pn_Marina",
  "66": "26-05-11_pn_Daria",
  "68": "26-05-12_pn_Laura",
  "69": "26-05-12_pi_Agata_Szafrańska",
  "71": "26-05-12_pi_Marzenka_Styk",
  "73": "26-05-12_pn_Wiktoria",
  "75": "26-05-29_pn_Amelia",
  "77": "26-05-30_pn_Roksana_Characzko",
  "79": "26-05-30_pn_Olia",
  "80": "26-06-07_pt_Ariadna",
  "81": "26-05-29_wf_Paulina_Heller",
  "82": "26-06-20_pn_Marzenia",
  "83": "26-05-14_pi_Aleksandra",
  "84": "26-04-11_pi_Katarzyna_Wasowicz",
  "85": "23-08-16_pi_Natalia",
  "86": "26-06-22_pi_Ramona",
  "87": "26-05-04_pi_Magda_Kamińska",
  "88": "26-07-04_pi_Karolina"
}
```

**Status Editor** shows:
```
Dostępnych leadów: 57
```

**Missing leads** (at least):
- 81. 26-05-29_wf_Paulina_Heller
- 82. 26-06-20_pn_Marzenia
- 85. 23-08-16_pi_Natalia
- 86. 26-06-22_pi_Ramona
- 87. 26-05-04_pi_Magda_Kamińska
- 88. 26-07-04_pi_Karolina

## Probable Cause

The status editor likely builds the list from:
- existing statuses
or
- after merging statuses

instead of building it from the complete leads list.

## Expected Behavior

The source of truth must always be:

**GetAllLeads()**

i.e., the complete map: `leadId -> leadName`

For each lead, we should then:
- find the status
- determine:
  - [ważny] (valid)
  - [nieaktualny] (outdated)
  - [pusty] (empty)
  - [brakujący] (missing)

But no lead should disappear from the list.

## Investigation & Fix

### Investigation Steps

1. ✅ Find where the list is built for: Statuses Setup -> Uzupełnij statusy
2. ✅ Check:
   - How many leads does GetAllLeads() return
   - How many make it to the status list
   - Where records are lost
3. ✅ Fix:
   - Editor list must always contain all leads from GetAllLeads()
   - Status should only be additional information
   - Missing status cannot remove lead from list
4. ✅ Add diagnostic output after fix

### Root Cause Analysis

**Location:** `../chad-console/src/cli.ts`, lines 1385-1390 (before fix)

**Problem:** The `statusesToComplete` list was built only from leads that already have status items:

```typescript
// BEFORE (buggy):
let statusesToComplete = [
  ...statusCategories.empty,
  ...statusCategories.outdated,
  ...statusCategories.valid
];
```

This excluded `statusCategories.missing` - leads that don't have a status item yet.

**Why leads were missing:**
- Content Provider returns 66 leads via `GetAllLeads()`
- Only 57 leads had existing status items (empty, outdated, or valid)
- 9 leads had no status item (`category === 'missing'`)
- The editor only showed leads with existing statuses

**Missing leads from the example:**
- 81. 26-05-29_wf_Paulina_Heller
- 82. 26-06-20_pn_Marzenia
- 85. 23-08-16_pi_Natalia
- 86. 26-06-22_pi_Ramona
- 87. 26-05-04_pi_Magda_Kamińska
- 88. 26-07-04_pi_Karolina
- (and 3 more)

### Solution

**Changes made:**

1. **Include all leads in the editor list** (line ~1386):
```typescript
// AFTER (fixed):
// The source of truth is GetAllLeads() - every lead must appear in the list
let statusesToComplete = [
  ...statusCategories.missing,    // <-- ADDED
  ...statusCategories.empty,
  ...statusCategories.outdated,
  ...statusCategories.valid
];
```

2. **Added diagnostic output** (lines ~1395-1401):
```typescript
console.log(`\nDiagnostic: Loaded leads: ${girlsMap.size}`);
console.log(`Diagnostic: Loaded statuses: ${statusCategories.empty.length + statusCategories.outdated.length + statusCategories.valid.length}`);
console.log(`Diagnostic: Merged leads (total in editor): ${statusesToComplete.length}`);
console.log(`Diagnostic: Missing status: ${statusCategories.missing.length}`);
console.log(`Diagnostic: Empty status: ${statusCategories.empty.length}`);
console.log(`Diagnostic: Outdated status: ${statusCategories.outdated.length}`);
console.log(`Diagnostic: Valid status: ${statusCategories.valid.length}\n`);
```

3. **Handle missing status leads in the editor** (lines ~1520-1555):
   - When a user selects a lead with `category === 'missing'`, the editor now:
     - Creates a new status item via `createStatusForLead()`
     - Initializes it with an empty body
     - Updates the cached status info
     - Allows the user to edit the status

### Verification

After the fix, the diagnostic output should show:
- `Loaded leads` = total number of leads from `GetAllLeads()` (e.g., 66)
- `Merged leads` = same as `Loaded leads` (all leads are included)
- `Missing status` = number of leads without status items
- The sum of `Missing + Empty + Outdated + Valid` = `Merged leads`

The editor will now:
1. Show ALL leads from `GetAllLeads()`
2. Allow editing leads with missing statuses (creates status item on-the-fly)
3. Status is now just additional information, not a requirement for being in the list
