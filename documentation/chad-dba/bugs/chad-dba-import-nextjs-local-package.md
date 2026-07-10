# Bug: Module not found: Can't resolve 'chad-dba'

## Status
Naprawione.

## Kontekst
Projekt:
- `chad-dashbord`

Funkcjonalnosc:
- zakladka `Messages`

Miejsce awarii:
- `app/api/beeper/leads/route.ts`

Import:

```ts
import { getAllBeeperWhatsappLeads } from "chad-dba";
```

## Objawy
1. Build error w Next.js/Turbopack:

```text
Module not found: Can't resolve 'chad-dba'
```

2. API route zwracal HTML strony bledu (500), nie JSON.
3. Frontend probowal parsowac HTML jako JSON i pokazywal:

```text
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

## Dlaczego to bylo mylace
- dane w Content Provider istnialy i byly poprawne,
- helpery beeper zaczely zwracac poprawne dane po poprawkach,
- login i inne route dzialaly,
- blad wygladal jak problem danych, ale byl stricte resolver/bundler.

## Bledne tropy, ktore pojawily sie po drodze
- podejrzenie, ze CP nie zwraca leadow,
- podejrzenie parsera rozmow,
- podejrzenie query param vs dynamic route,
- alias do absolutnej sciezki poza projektem,
- alias do `../chad-dba/dist/index.js`.

W tym setupie Turbopack odrzucal mapowanie poza projekt i nadal nie resolve'owal paczki po nazwie.

## Przyczyna
Lokalna paczka `file:../chad-dba` + Turbopack w Next 15 wymagaly doprecyzowania resolve po stronie projektu zaleznego.

Sama obecna zaleznosc i symlink w `node_modules` nie wystarczaly.

## Co naprawilo problem
1. Poprawne `chad-dba/package.json` z `exports`:

```json
{
  "name": "chad-dba",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

2. Build `chad-dba` przed uruchomieniem dashboardu.

3. W `chad-dashbord/next.config.ts`:

```ts
experimental: {
  externalDir: true,
},
turbopack: {
  resolveAlias: {
    "chad-dba": "./node_modules/chad-dba/dist/index.js",
  },
},
transpilePackages: ["chad-dba"],
```

4. API routes zostaly na bezposrednim imporcie:

```ts
import { getAllBeeperWhatsappLeads } from "chad-dba";
```

## Komendy naprawcze (kolejnosc)

```bash
cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dba
npm run build

cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dashbord
rm -rf .next
npm install
npm run dev
```

## Jak testowac

### 1) Login (wymagany przez middleware)

```bash
COOKIE_JAR=/tmp/chad_dash_cookie_12020.txt
rm -f "$COOKIE_JAR"
curl -sS -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"pawel_f","password":"changeme"}' \
  http://localhost:12020/api/auth/login
```

### 2) Leads API

```bash
curl -sS -b "$COOKIE_JAR" http://localhost:12020/api/beeper/leads
```

Oczekiwany wynik: lista leadow (JSON array), np.:

```json
["26-05-11_pn_Luba","26-05-29_pn_Amelia","26-05-30_pn_Olia"]
```

### 3) Conversation API

```bash
curl -sS -b "$COOKIE_JAR" \
  'http://localhost:12020/api/beeper/conversation/26-05-11_pn_Luba'
```

Oczekiwany wynik: JSON z `ok: true` i `content`.

### 4) UI
- zaloguj sie: `pawel_f / changeme`,
- wejdz: `/dashboard/messages`,
- sprawdz, czy lista leadow nie pokazuje `0 leads`,
- kliknij lead i potwierdz ladowanie rozmowy.

## Szybkie rozpoznanie problemu w przyszlosci
Jesli widzisz jednoczesnie:
- `Module not found: Can't resolve 'chad-dba'` w route,
- HTML `<!DOCTYPE ...>` zamiast JSON na `/api/beeper/...`,
- `Unexpected token '<'` w UI,
to najpierw sprawdz resolver/import lokalnej paczki, a nie dane CP.
