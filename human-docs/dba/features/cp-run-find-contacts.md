# Feature: CP Run - Find Contacts

## Overview

This feature provides tools for discovering leads in Content Provider and finding which ones have contact information. It's the foundation for intelligent lead matching between Beeper exports and CP data.

## Menu Structure

```
CP Run v1

1. PrintAllLeads
2. FindContacts
0. Exit
```

**Note**: Only these 3 options. No other menu items.

### Option 1: PrintAllLeads

Displays all leads from Content Provider in a numbered list.

**Purpose**: Quick overview of all available leads in the system.

**Implementation**:
- Calls `chad-dba` method `getAllLeadNames()`
- Parses the response to extract lead names
- Displays in a clean, numbered format

**Example Output**:
```
[1] 26-05-03_pi_Elena
[2] 26-05-12_pi_Agata
[3] 26-06-07_pt_Ariadna

Total: 3
```

### Option 2: FindContacts

Analyzes all leads to find which ones have contact information.

**Purpose**: Identify leads with contacts vs leads without contacts.

**Implementation**:
1. Fetch all leads from CP using `chad-dba`
2. For each lead, attempt to fetch the `contacts` item
3. Parse YAML content if present
4. Split leads into two categories:
   - **Matched**: leads with contacts
   - **Unmatched**: leads without contacts
5. Display results in two sections

**Output Format**:
```
=== Niedopasowane / brak contacts ===

[1] 26-05-12_pi_Agata
[2] 26-05-30_pn_Roksana

=== Dopasowane / znalezione contacts ===

[1] 26-06-07_pt_Ariadna

facebook:
  - https://www.facebook.com/aleksandra.karpiuk.714
  - https://www.facebook.com/messages/e2ee/t/9867519229946152

instagram:
  - https://instagram.com/profile

Summary:
matched: 1
unmatched: 2
total: 3
```

## Technical Implementation

### Python Script Structure

```python
# Core functions with clear separation of concerns

def load_cp_leads():
    """Fetch all leads from Content Provider via chad-dba."""
    # Calls chad-dba through subprocess
    # Returns list of lead names
    
def load_lead_contacts(lead_name):
    """Fetch contacts YAML for a specific lead."""
    # Calls chad-dba getLeadContacts(lead_name)
    # Returns YAML string or None
    
def parse_contacts_yaml(yaml_content):
    """Parse YAML contacts into structured data."""
    # Uses PyYAML to parse
    # Returns dict of contact types -> URLs
    
def split_matched_unmatched(leads_data):
    """Categorize leads into matched/unmatched."""
    # Returns (matched_leads, unmatched_leads)
```

### chad-dba Methods Used

1. **GetAllLeads()** / **getAllLeadNames()**
   - Fetches all leads from `leads/all-items`
   - Returns array of lead names or full item data

2. **getLeadContacts(leadName)**
   - Fetches the `contacts` item for a specific lead
   - Path: `leads/all-items/[leadName]/contacts`
   - Returns YAML body content or null

3. **getAllLeadsWithContacts()**
   - Optimized method that gets all leads and checks for contacts in one call
   - Returns array with `name`, `hasContacts`, and `loca`

### Error Handling

All CP API errors should be clearly reported:

```python
def get_lead_contacts_safe(lead_name):
    """Safe wrapper that catches and logs errors."""
    try:
        return load_lead_contacts(lead_name)
    except Exception as e:
        print(f"ERROR getLeadContacts: {lead_name} -> {e}")
        return None
```

## Dependencies

### Python Dependencies

- **PyYAML**: For parsing YAML contact files
  ```bash
  pip install pyyaml
  ```

### chad-dba Dependencies

- Existing methods in `src/leads.ts`
- No new dependencies needed

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ cp_run_v1   │────▶│  chad-dba    │────▶│ Content Provider │
│  .py        │     │  (TypeScript)│     │      API         │
└─────────────┘     └──────────────┘     └──────────────────┘
      │                    │                      │
      │                    │                      │
      ▼                    ▼                      ▼
  Menu & Display     API Methods            Data Storage
  - PrintAllLeads    - GetAllLeads()        - leads/all-items
  - FindContacts     - getLeadContacts()    - contacts items
                     - getAllLeadsWith...   - YAML content
```

## Future Enhancements

### Phase 2: Beeper Integration
- Load leads from `AA_output` (Beeper exports)
- Match Beeper leads with CP leads
- Show which Beeper leads are missing in CP

### Phase 3: Writing
- Create missing lead items in CP
- Save Beeper conversation content to CP
- Update contact information

### Phase 4: Advanced Matching
- Fuzzy name matching
- Contact-based lead linking
- Duplicate detection

## Testing

### Manual Testing

1. **PrintAllLeads**:
   ```bash
   python src/_01_cp_run/cp_run_v1.py
   # Select option 1
   ```

2. **FindContacts**:
   ```bash
   python src/_01_cp_run/cp_run_v1.py
   # Select option 2
   ```

### Expected Results

- **PrintAllLeads**: Should show all leads from CP
- **FindContacts**: Should categorize leads correctly
- Error messages should be clear and informative

## Diagnostics

On startup, the script should display:

```
CP Run v1
Project root: /path/to/python_beeper
chad-dba path: /path/to/chad-dba
repo/user: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641 / pawel_f
```

## Implementation Checklist

- [x] Add `getLeadContacts()` to chad-dba
- [x] Add `getAllLeadNames()` to chad-dba
- [x] Add `getAllLeadsWithContacts()` to chad-dba
- [x] Rewrite `cp_run_v1.py` with new menu structure
- [x] Implement `PrintAllLeads` mode
- [x] Implement `FindContacts` mode
- [x] Add YAML parsing with PyYAML
- [x] Add error handling and diagnostics
- [x] Test with real CP data

---

# CP Run v2 - zapis rozmów WhatsApp/Beeper do CP

## Overview

CP Run v2 rozszerza v1 o możliwość:
1. Analizy rozmów z wybranego runu AA_output względem leadów CP
2. Zapisywania dopasowanych rozmów do Content Provider
3. Przeglądania zapisanych wiadomości (ShowMessages)

## Option 3: ShowMessages

Pozwala wybrać leada z listy i wyświetlić jego zapisane rozmowy z CP.

**Źródło danych**: `beeper / whatsup / [lead_name] / beeper`

**Metoda**: GET (tylko odczyt)

```text
GetByNames(
  repoId,
  "beeper",
  "whatsup", 
  lead_name,
  "beeper"
)
```

**Wybór leada**:
- Jeśli zainstalowane `questionary`: strzałki góra/dół
- Fallback: wybór numerem z listy

**Output**:
```text
=== Messages: 26-05-03_pi_Elena ===

[11/05/2026, 15:11:51] you: ...
[11/05/2026, 15:25:23] she: ...
```

Lub jeśli brak wiadomości:
```text
Brak zapisanych wiadomości dla: [lead_name]
```

## Menu Structure

```
CP Run v2

1. PrintAllLeads
2. FindContacts
3. ShowMessages
0. Exit
```

**Note**: 4 options total.

## Flow FindContacts

### 1. Wybór runu z AA_output (na początku)

Po wybraniu opcji `2. FindContacts`, najpierw wyświetlana jest lista dostępnych runów:

```text
AA_output path:
  /Users/pawelfluder/03_synch/01_files_programming/10_my_python/python_beeper/AA_output

Dostępne runy:
[1] pawel_f_woman / simple_run_260702_101055
[2] pawel_f_woman / simple_run_260702_122549
...

Wybierz run do analizy [1-11] albo Enter, żeby wrócić:
```

### 2. Wczytanie rozmów z wybranego runu

### 3. Pobranie leadów i contacts z Content Provider

### 4. Porównanie rozmów z runu z contacts z CP

### 5. Wyświetlenie wyników

```text
Analizowany run:
pawel_f_woman / simple_run_260702_122549

=== Dopasowane rozmowy z runu do leadów CP ===

[1]
CP lead: 26-05-11_pn_Luba
Beeper/run chat: Luba
match reason:
  - name matching: exact-name

=== Rozmowy z runu bez dopasowania w CP ===

[1] Some Person (42 messages)
...
```

### 6. Pytanie o zapis (dopiero po pokazaniu dopasowań)

```text
Czy zapisać dopasowane rozmowy do CP? [y/n]:
```

### Jeśli użytkownik wybierze pusty Enter albo `n`:

```text
Pominięto zapis rozmów.
```

i wraca do menu.

### Jeśli użytkownik wybierze `y`:

Rozpoczyna się flow zapisu rozmów.

## Flow zapisu rozmów

### 1. Wybór runu z AA_output

Wypisywana jest numerowana lista runów z:

```text
AA_output/[nazwa-zrodlowego-pliku-csv]/[nazwa-uruchomienia]
```

Przykład:

```text
[1] woman-1 / simple_run_260609_162626
[2] woman-1 / simple_run_260610_180000
[3] woman-2 / simple_run_260611_090000
```

Użytkownik wybiera jeden run.

### 2. Znalezienie rozmów w wybranym runie

Z wybranego runu pobierana jest lista rozmów / leadów dostępnych w JSON-ach.

### 3. Dopasowanie rozmów z AA_output do leadów CP

Rozmowy z Beepera są dopasowywane do leadów z CP, używając inteligentnego matchingu:

* **exact match** po nazwie
* **normalizacja nazw**:
  * lowercase
  * usunięcie podwójnych spacji
  * zamiana spacji/underscore/myślników na jeden separator
  * ignorowanie polskich znaków
* jeśli są kontakty z CP, używane są do dopasowania numerów / linków

Wyświetlana jest tabela dopasowań:

```text
[1] CP: 26-05-11_pn_Luba
    Beeper: 26-05-11_pn_Luba
    confidence: exact-name

[2] CP: 26-05-30_pn_Roksana_Characzko
    Beeper: Roksana Characzko
    confidence: normalized-name
```

Osobno pokazane są niedopasowane rozmowy z Beepera.

### 4. Wybór dopasowań do zapisu

Pytanie:

```text
Które dopasowania zapisać? [all / 1,3,5 / 2-8 / Enter=pomiń]:
```

Obsługiwane formaty:
* `all` - wszystkie dopasowania
* pojedynczy numer - np. `3`
* kilka numerów po przecinku - np. `1,3,5`
* zakres - np. `2-8`
* pusty Enter - pomiń zapis

### 5. Format rozmowy

Rozmowa zapisywana jest w prostym formacie WhatsApp:

```text
[11/05/2026, 15:11:51] you: ok, to już wychodzę
[11/05/2026, 15:24:54] you: juz jestem, a Ty jak tam? ‎<This message was edited>
‎[11/05/2026, 15:25:14] she: ‎<attached: 00000013-PHOTO-2026-05-11-15-25-14.jpg>
[11/05/2026, 15:25:23] she: Jestem ty
[12/05/2026, 18:28:41] you: hej Luba 😊 wracając do naszej gorącej czekolady, kiedy byś miała wolny wieczór?
[13/05/2026, 10:46:39] she: cześć) Nie wiem, kiedy będę mógł się spotkać...
```

Zasady:
* moje wiadomości = `you`
* jej wiadomości = `she`
* załączniki jako `‎<attached: filename>`
* edytowane wiadomości jako `‎<This message was edited>`

## Zasada zapisu do Content Provider

**Bardzo ważne**: zapis zawsze idzie przez:

```text
POST -> PUT
```

Nie przez GET.

### POST

Najpierw wykonywany jest POST jako create-or-get dla ścieżki:

```text
beeper / whatsup / [lead_name] / beeper
```

POST ma:
* utworzyć item, jeśli nie istnieje
* albo zwrócić istniejący item, jeśli istnieje
* zwrócić `loca`

### PUT

Potem wykonywany jest PUT na zwrócony `loca`:

```text
Put(repoId, loca, Text, content)
```

### GET

GET używamy tylko wtedy, gdy chcemy pobrać istniejące dane, np. leady albo contacts.

**Nie używaj GET do zapisu rozmowy.**

## chad-dba helper

Helper w chad-dba:

```typescript
saveBeeperWhatsappConversation(leadName: string, content: string)
```

W środku helper robi:

```text
POST ["beeper", "whatsup", leadName, "beeper"]
PUT returned_loca, Text, content
```

Python tylko wywołuje helper z `chad-dba`.

**Nie duplikuj logiki CP w Pythonie.**

## Żadnych backupów

* Nie twórz backupów
* Nie kopiuj JSON-ów
* Nie modyfikuj `AA_output`

`AA_output` jest tylko do czytania.

## Raport

Po zapisie wypisywany jest dla każdego leadu:

```text
POST OK: [lead_name] -> loca: ...
PUT OK: [lead_name] -> zapisano X wiadomości
```

albo:

```text
ERROR: [lead_name] -> [opis błędu]
```

Na końcu:

```text
Summary:
matched selected: X
saved: Y
errors: Z
```

## Technical Implementation

### Python Script Structure

```python
# Core functions for v2

def list_runs():
    """List all available runs from AA_output."""
    # Scans AA_output/[source]/[run] directories
    # Returns list of {source_file, run_name, path}
    
def load_beeper_conversations(run_path):
    """Load conversations from a specific run."""
    # Reads chat.json and messages.json from each chat directory
    # Returns list of BeeperConversation objects
    
def normalize_name(name):
    """Normalize name for matching."""
    # lowercase, remove diacritics, replace separators
    
def match_conversations_to_leads(cp_leads, beeper_convs):
    """Match Beeper conversations to CP leads."""
    # Returns (matched_results, unmatched_conversations)
    
def format_conversation(chat_dir):
    """Format conversation to WhatsApp-style text."""
    # Reads messages.json and formats as WhatsApp export
    
def invoke_chad_dba(method_name, args):
    """Invoke a specific chad-dba helper method."""
    # Calls saveBeeperWhatsappConversation etc.
```

### chad-dba Methods Used

1. **saveBeeperWhatsappConversation(leadName, content)**
   - Full POST -> PUT flow
   - Creates beeper/whatsup/[leadName]/beeper path
   - Saves conversation content

2. **postItemByNames(repoId, names)**
   - Creates or gets items by names path
   - Used internally by saveBeeperWhatsappConversation

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ cp_run_v2   │────▶│  chad-dba    │────▶│ Content Provider │
│  .py        │     │  (TypeScript)│     │      API         │
└─────────────┘     └──────────────┘     └──────────────────┘
      │                     │                      │
      │                     │                      │
      ▼                     ▼                      ▼
  Load AA_output      POST -> PUT flow      beeper/whatsup/
  Parse JSONs         saveBeeperWhatsapp      [lead]/beeper
  Match names         Conversation           conversation text
```

## Testing

### Manual Testing

1. **Run the script**:
   ```bash
   cd /Users/pawelfluder/03_synch/01_files_programming/10_my_python/python_beeper
   python3 src/_01_cp_run/cp_run_v2.py
   ```

2. **Select option 2 (FindContacts)**:
   - Should show matched/unmatched leads
   - Should ask: "Czy zapisać rozmowy WhatsApp/Beeper do dopasowanych leadów?"

3. **Answer 'y'**:
   - Should list available runs
   - Select a run
   - Should show matches and ask which to save

4. **Select matches to save**:
   - Use `all`, `1,3,5`, `2-8`, or Enter to skip
   - Should show POST OK / PUT OK for each saved conversation

### Expected Results

- Conversations should be saved to `beeper/whatsup/[leadName]/beeper` in CP
- Format should match WhatsApp export style
- No modifications to AA_output files
- Clear error messages for any failures
