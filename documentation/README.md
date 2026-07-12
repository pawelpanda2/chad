# Architecture Docs

> **Zacznij od [`documentation/ai-docs/what-and-where.md`](ai-docs/what-and-where.md)**
> — to jest aktualny indeks całej dokumentacji przeznaczonej dla AI (deploy,
> dashboard, dba, Content Provider, console, Beeper, standardy). Treść
> poniżej opisuje strukturę sprzed migracji do monorepo `chad` i jest w
> dużej części nieaktualna (np. `general/SCREENS-ARCHITECTURE.md` nie
> istnieje w tym repo) — zachowana jako zapis historyczny, nie jako źródło
> prawdy o strukturze.

## Źródło projektu

Ten projekt jest oparty na:

**[shadcn-nextjs-dashboard](https://github.com/NaveenDA/shadcn-nextjs-dashboard)**

- Autor: NaveenDA
- Licencja: Sprawdź plik LICENSE w repozytorium źródłowym
- Projekt został zmodyfikowany i rozszerzony o dodatkowe funkcje.

---

Ten katalog zawiera dokumentację architektoniczną dla obu implementacji aplikacji (.NET i Node.js),
z naciskiem na spójność feature'ów i ochronę przed regresją.

## Dlaczego taki format

- **Markdown (`.md`)**: lekki, czytelny w VS Code, dobry dla ludzi i AI.
- **Mermaid w Markdown**: diagramy działają natywnie w podglądzie VS Code.
- **Jeden rejestr feature'ów**: łatwo sprawdzić, co musi działać identycznie w obu technologiach.

## Struktura

- `general/`
  - dokumenty przekrojowe (kontekst systemu, ekrany, przepływy)
- `features/`
  - szczegółowe feature'y i kontrakty zachowania

## Szybki start

1. Najpierw przeczytaj `features/FEATURE-REGISTRY.md`.
2. Potem sprawdz `general/SCREENS-ARCHITECTURE.md`.
3. Dla architektury docelowej i roadmapy pamieci przeczytaj `general/TARGET-SYSTEM-ARCHITECTURE.md`.
4. Plan realizacji równoległej (.NET + Node): `general/SPRINT-PLAN-S1-S2.md`.
5. Przy każdej zmianie aktualizuj feature'y i kryteria akceptacji.

## Zasady utrzymania

- Każdy feature ma mieć:
  - cel biznesowy,
  - kontrakt API/UI,
  - zachowanie błędów,
  - kryteria akceptacji.
- Jeśli implementacja zmienia zachowanie użytkowe, dokument też musi być zaktualizowany.

## Zasady skryptów Docker (QNAP)

- `build_docker_image.sh` buduje obraz (`docker compose build`).
- `run_docker_image.sh` tylko uruchamia kontener (`docker compose up --no-build`).
- `stop_docker_image.sh` zatrzymuje kontener i sprząta środowisko zgodnie z opcjami.
- Jeśli obraz nie istnieje, najpierw uruchom `build_docker_image.sh`, a dopiero potem `run_docker_image.sh`.

### Tagowanie obrazów (QNAP Prod)

- Obrazy produkcyjne są tagowane datą ostatniego commita w formacie `YY-MM-DD__HH-MM-SS` (np. `26-06-05__17-43-50`).
- `run_docker_image.sh` domyślnie wybiera i uruchamia najnowszy dostępny tag.
- `run_docker_image.sh --tag <TAG>` uruchamia konkretną wersję obrazu.
- `run_docker_image.sh --list-tags` wypisuje dostępne tagi czasowe.
