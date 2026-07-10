# Content Provider - Częste błędy i typy (Frequent Bugs)

## Najczęstsze błędy do unikania

### 1. Folder content/ jest ZABRONIONY

**BŁĘDNIE:**
```text
repos/{repoGuid}/
  config.yaml
  content/
    01/
      02/
```

**POPRAWNIE:**
```text
repos/{repoGuid}/
  config.yaml
  01/
    02/
      03/
```

**Zasada:** Folder `content/` jest CAŁKOWICIE ZABRONIONY. Nody są przechowywane bezpośrednio w folderze repozytorium. Wszystkie foldery nodów muszą mieć nazwy jako 2- lub 3-cyfrowe liczby (01, 02, 03). Logiczne nazwy (Active, Users) są TYLKO w polu `name` w `config.yaml`.

### 2. Niepoprawne nazwy folderów

**BŁĘDNIE:**
```text
repos/{repoGuid}/
  Active/
  Users/
  Documents/
```

**POPRAWNIE:**
```text
repos/{repoGuid}/
  01/
    02/
      03/
```

**Zasada:** Wszystkie foldery w repozytorium muszą mieć nazwy jako 2- lub 3-cyfrowe liczby (01, 02, 03). Logiczne nazwy są TYLKO w polu `name` w `config.yaml`.

### 3. Dane domenowe w config.yaml

**BŁĘDNIE:**
```yaml
# config.yaml
id: "..."
type: "Text"
name: "Users"
address: "01"
permissions:
  - userId: "pawelf"
    role: "owner"
```

**POPRAWNIE:**
```yaml
# config.yaml
id: "..."
type: "Text"
name: "Users"
address: "01"
primaryBody: "body.yaml"

# body.yaml
users:
  - id: "..."
    email: "user@example.com"
    name: "John Doe"
```

**Zasada:** `config.yaml` zawiera TYLKO techniczne metadane. Dane domenowe (użytkownicy, uprawnienia) są w `body.yaml` lub `body.json`.

### 4. Używanie niedozwolonych typów

**BŁĘDNIE:**
- `type: "Repository"` - nie ma takiego typu
- `type: "Ref"` - na razie niedozwolone dla AI/kodu

**POPRAWNIE:**
- `type: "Folder"` - dla folderów
- `type: "Text"` - dla dokumentów

**Zasada:** Używaj tylko typów `Folder` i `Text`.

### 5. Plain text hasła

**BŁĘDNIE:**
```yaml
# body.yaml
users:
  - email: "user@example.com"
    password: "mysecretpassword"  # ŹLE!
```

**POPRAWNIE:**
```yaml
# body.yaml
users:
  - email: "user@example.com"
    passwordHash: "$2b$12$..."  # bcrypt hash
```

**Zasada:** Nigdy nie zapisuj haseł jako plain text. Używaj bcrypt/argon2.

### 6. googleDocId w podstawowej logice

**BŁĘDNIE:**
```yaml
# config.yaml
id: "..."
type: "Text"
googleDocId: "470ece57-..."  # Nie używaj tego!
```

**POPRAWNIE:**
```yaml
# config.yaml
id: "..."
type: "Text"
primaryBody: "body.yaml"
```

**Zasada:** `googleDocId` może być w przyszłości dla eksportu, ale nie w podstawowej logice.

### 7. Sztuczne GUID-y z placeholderów

**BŁĘDNIE:**
```yaml
# config.yaml
id: "11111111-1111-4111-8111-111111111111"  # ŹLE - sztuczny placeholder
type: "Folder"
name: "users"
address: "01"

# config.yaml
id: "22222222-2222-4222-8222-222222222222"  # ŹLE - sztuczny placeholder
type: "Text"
name: "users-list"
address: "01/01"
primaryBody: "body.yaml"
```

**POPRAWNIE:**
```yaml
# config.yaml
id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  # prawdziwy UUID v4
type: "Folder"
name: "users"
address: "01"

# config.yaml
id: "f9e8d7c6-b5a4-3210-9876-543210fedcba"  # prawdziwy UUID v4
type: "Text"
name: "users-list"
address: "01/01"
primaryBody: "body.yaml"
```

**Zasada:** Każdy node musi mieć prawdziwy, losowy UUID v4 wygenerowany automatycznie. Nie używaj sztucznych GUID-ów z samych jedynek/dwójek ani stałych placeholderów w seedzie ani w przykładach generowanych jako realne pliki.

### 8. Backend używa ścieżek technicznych zamiast logicznych

**BŁĘDNIE:**
```typescript
// Backend zna techniczne ścieżki
const node = readNodeByAddress(repoId, "01/01");
```

**POPRAWNIE:**
```typescript
// Backend używa logicznych nazw
const node = await contentProvider.getByNames(
  repoId,
  "users",
  "users-list"
);
```

**Zasada:** Backend powinien używać `getByNames()` do nawigacji po logicznych nazwach, nie po technicznych ścieżkach typu `01/01`.

### 9. Cache bez invalidacji przy ręcznej edycji body.txt

**BŁĘDNIE:**
- Aplikacja nie widzi zmian w body.txt po ręcznej edycji
- Cache jest trzymany w pamięci bez mechanizmu invalidacji
- Restart serwera jest potrzebny, żeby zobaczyć zmiany

**POPRAWNIE:**
- Każdy request do `getByNames()` czyta aktualny stan z dysku
- Jeśli używasz cache, musi mieć jawny mechanizm invalidacji (np. po zmianie pliku, po czasie, ręcznie)
- Dla danych użytkowników na razie nie używaj cache bez invalidacji

**Zasada:** Jeżeli ręcznie zmieniamy body.txt w Content Provider, aplikacja powinna widzieć zmianę przy kolejnym requestcie/odświeżeniu, chyba że celowo włączony jest jawny cache z mechanizmem invalidacji.

## Podsumowanie zasad

1. **Foldery:** Tylko numeryczne nazwy (01, 02, 03) - NIE używaj `content/`
2. **config.yaml:** Tylko techniczne metadane
3. **body.txt:** Dane domenowe (obecnie jedyny wspierany format)
4. **Typy:** Tylko `Folder` i `Text`
5. **Hasła:** Zawsze hashowane (bcrypt/argon2)
6. **GUID-y:** Prawdziwe losowe UUID v4, NIE sztuczne placeholdery
7. **Nawigacja:** Używaj `getByNames()` po logicznych nazwach
8. **Fizyczna ścieżka:** `cp-root/repos/{repoGuid}/01/01/body.txt` (bez `content/`)

> **Uwaga:** W przyszłości można rozważyć wsparcie dla alternatywnych formatów (`body.yaml`, `body.json`), ale na ten moment system obsługuje wyłącznie `body.txt`.

---

## Beeper Desktop / JSON Export Bugs

### 10. Connection error podczas eksportu JSON

**BŁĘDNIE:**
- Uruchomienie skryptu eksportu JSON bez sprawdzenia dostępności Beeper Desktop API
- Zakładanie, że Beeper Desktop jest zawsze dostępny
- Brak restartu aplikacji przed eksportem

**POPRAWNIE:**
- Przed eksportem JSON wykonaj restart Beeper Desktop
- Użyj `simple_run_scroll_v7.py` z domyślnie włączonym `--restart-beeper-at-start`
- Jeśli występuje błąd "Connection error", ręcznie zrestartuj Beeper Desktop

**Procedura restartu (macOS):**
```bash
# 1. Zamknij Beeper Desktop
osascript -e 'tell application "Beeper Desktop" to quit'

# 2. Poczekaj 3 sekundy
sleep 3

# 3. Dobij proces (jeśli nadal działa)
pkill -x "Beeper Desktop"
pkill -f "Beeper Desktop"

# 4. Otwórz Beeper Desktop
open -a "Beeper Desktop"

# 5. Poczekaj 15-20 sekund na uruchomienie API
sleep 15
```

**Zasada:** Przed każdym eksportem JSON przez Beeper Desktop API, zrestartuj aplikację aby zapewnić świeże połączenie.

### 11. Brak obsługi błędów połączenia

**BŁĘDNIE:**
```python
# Skrypt nie sprawdza czy Beeper Desktop jest dostępny
result = export_json(chat_id)  # Może zwrócić "Connection error"
```

**POPRAWNIE:**
```python
# Restart przed eksportem
restart_beeper_desktop()
result = export_json(chat_id)
if result.get("error") == "Connection error":
    # Spróbuj ponownie po restarcie
    restart_beeper_desktop()
    result = export_json(chat_id)
```

**Zasada:** Zawsze obsługuj błędy połączenia i miej mechanizm retry z restartem aplikacji.
