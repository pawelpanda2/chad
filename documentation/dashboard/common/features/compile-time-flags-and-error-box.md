# Feature: Compile-time flags (Dev Panel / Diagnostics) + standardized ErrorBox

## Cel feature'a

Bezpieczeństwo i spójność diagnostyki. Panel dev oraz szczegóły diagnostyczne
błędów (stack trace, surowy JSON, `debug` z API) **nie mogą** trafiać widocznie
na test/prod. Dodatkowo wszystkie „okienka error" mają być jednym wspólnym,
małym komponentem: napis `error:` + `+` do rozwinięcia szczegółów.

**Kontekst bezpieczeństwa (2026-07-13):** na PROD w okienku błędu logowania
widać było listę użytkowników z Content Providera (bez haseł). Źródłem był
`debug` payload z `/api/auth/login`. Ten feature to zamyka.

## Zakres

Warstwa UI + build. Bez zmian w API, modelu danych, Content Providerze.

## Zmienione / nowe pliki

- `lib/flags.ts` — **nowy**. `DEV_PANEL_ENABLED`, `DIAGNOSTICS_ENABLED`.
- `components/shared/error-box.tsx` — **nowy**. Standardowy `ErrorBox`.
- `app/layout.tsx` — Dev Panel montowany tylko gdy `DEV_PANEL_ENABLED`.
- `app/(auth)/login/page.tsx` — błąd na dole, przez `ErrorBox`; `debug` →
  `details` (gated).
- `app/(dashboard)/dashboard/views/page.tsx` — błędy przez `ErrorBox`.
- `packages/dashboard/Dockerfile` — `ARG ENABLE_DEV_PANEL=false` /
  `ARG ENABLE_DIAGNOSTICS=false` ustawiane jako `NEXT_PUBLIC_*` przed
  `next build`.

## Flagi

`NEXT_PUBLIC_*` jest inline'owane przez Next w czasie builda.

- `DEV_PANEL_ENABLED` = `NEXT_PUBLIC_ENABLE_DEV_PANEL`
- `DIAGNOSTICS_ENABLED` = `NEXT_PUBLIC_ENABLE_DIAGNOSTICS`

Domyślne:

- lokalny `next dev` (`NODE_ENV !== production`): **ON** (wygodna praca).
- build produkcyjny (Docker): **OFF** — panel dev nie jest renderowany ani
  wykonywany, `ErrorBox` nie pokazuje szczegółów. Diagnostyka i lista
  użytkowników nie są widoczne.
- wymuszenie: ustaw env explicite na `"true"` / `"false"`.

**Jednorazowy build testowy z panelem dev:**
`docker compose build --build-arg ENABLE_DEV_PANEL=true`.

## ErrorBox — kontrakt

`<ErrorBox message={...} details={...} className=... />`

- `message` — zwięzły, zawsze widoczny komunikat.
- `details` — diagnostyka; renderowana tylko gdy `DIAGNOSTICS_ENABLED` i po
  kliknięciu `+`. Na test/prod nie ma `+` ani szczegółów.
- Zwraca `null` gdy brak `message`. Można wstawiać bezwarunkowo (zamiast
  `{error && ...}`).

## Route / API · Przepływ danych · Content Provider · Cache

Bez zmian. Feature nie dotyka API, danych, CP ani cache.

## Edge cases

- Gdy `DIAGNOSTICS_ENABLED` = ON lokalnie: pełny stack/JSON pod `+`.
- Login: `error` (np. „Invalid credentials") zawsze widoczny; `debug` (lista
  userów) tylko lokalnie.

## Znane ograniczenia

- Kod panelu dev nadal jest w bundlu (inert) — nie jest renderowany/wykonywany
  na test/prod, ale nie jest w pełni tree-shaken. Wystarcza to do
  niewidoczności; pełne usunięcie wymagałoby dynamic import.

## Dalsze etapy

- Migracja pozostałych inline'owych błerdów w zakładkach na `ErrorBox`.
