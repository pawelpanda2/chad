# bash-scripts/ standard — od czego zacząć

Status: utworzone 2026-07-19 (wydzielone z `ai-docs/deploy/`, gdzie
mieszały się dwie różne rzeczy: ogólny standard pisania skryptów i
architektura konkretnie CHAD-owego deploymentu). Ten dokument jest
**wyłącznie indeksem kolejności czytania** dla `ai-docs/bash-scripts/` —
nie opisuje żadnego standardu sam w sobie, tylko wskazuje gdzie go czytać.
Analogiczny do `ai-docs/begin_here/01_ai_start.md` i
`ai-docs/deploy/ai-start.md`.

**Różnica względem `ai-docs/deploy/`:** ten katalog opisuje wzorzec
pisania skryptów, który obowiązuje w KAŻDYM środowisku
`bash-scripts/dashboard/*` (numeracja slotów, git preflight, tagowanie
obrazów, SSH) — niezależnie od tego, czy chodzi o QNAP, lokalny Mac, czy
przyszłe, jeszcze nieistniejące środowisko. `ai-docs/deploy/` opisuje, jak
CHAD konkretnie z tego wzorca korzysta (architektura shared/test/prod,
GHCR, MongoDB, Content Provider). Czytaj ten katalog PIERWSZY, jeśli
piszesz/zmieniasz jakikolwiek skrypt w `bash-scripts/` — dopiero potem
`ai-docs/deploy/` dla kontekstu konkretnej aplikacji.

## Kolejność czytania

1. **[conventions.md](conventions.md)** — GŁÓWNY dokument. Kontrakt
   numeracji operacji (`01_config`...`07_logs`), kiedy pełna rodzina plików
   a kiedy prosty `config.sh`+`deploy.sh`, podział sekrety/konfiguracja,
   git preflight (`[y/N/d]`, ignorowanie submodułów), wzorce SSH
   (keepalive, brak `-tt`, base64 dla zagnieżdżonych cudzysłowów, detached+
   polling dla długich operacji, `--platform` przy cross-arch buildach),
   konwencja pisania każdego skryptu, nazewnictwo, zasady bezpieczeństwa.
2. **[image-tagging-standard.md](image-tagging-standard.md)** — pełny
   standard tagowania własnych obrazów Docker (nigdy `:latest`, plik
   `.image-tag.<obraz>.env`, zapis tylko po udanym buildzie, twardy
   odczyt w build/restart vs łagodny w status/end). Konkretny przykład tego
   ogólnego wzorca — czytaj po `conventions.md`.
3. **[bash-scripts-structure.md](bash-scripts-structure.md)** — jawnie
   oznaczone jako **PRZESTARZAŁE** wewnątrz pliku. Historyczny zapis
   struktury sprzed podziału na numerowane pod-katalogi, zachowany
   wyłącznie dla uzasadnienia nazewnictwa (`begin`/`end` zamiast
   `start`/`stop`). **Nie ufaj mu jako źródłu prawdy o aktualnej
   strukturze** — użyj `ls bash-scripts/dashboard/` albo `conventions.md`.

## Czego tu NIE ma

Architektura konkretnie CHAD-owego deploymentu (QNAP, shared MongoDB/Content
Provider, GHCR, porty, Beeper) żyje w `ai-docs/deploy/` — zacznij od
`ai-docs/deploy/ai-start.md`.
