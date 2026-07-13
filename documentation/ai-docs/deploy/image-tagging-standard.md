# Image tagging standard — no `:latest` for own CHAD images

Status: wdrożone i zweryfikowane na realnym QNAP, 2026-07-13.

## Zasada

**Własne obrazy CHAD (`chad-dashboard`, `chad-content-provider-api`) nigdy
nie używają tagu `latest`.** Każdy build tworzy dokładnie jeden tag —
znacznik czasowy `YYMMDD_HHMMSS`. Zewnętrzne, wersjonowane obrazy (np.
`mongo:4.4` w `docker-compose.qnap.shared.yml`) pozostają bez zmian — ta
zasada dotyczy wyłącznie obrazów budowanych z tego repo.

## Incydent, który to spowodował (2026-07-13)

Podczas deployu wielu zmian dashboardu, TEST i PROD zostały uruchomione przez
`chad-dashboard:latest` zamiast przez wygenerowany tag release'u
(`260713_134936`). Root cause:

1. `02_build.sh` generował `IMAGE_TAG` jako **lokalną zmienną bash**,
   `export`owaną tylko w obrębie własnego procesu skryptu.
2. Tag **nigdy nie był zapisywany na dysk** — nie istniał żaden plik typu
   `.image-tag.env`.
3. `03_begin.sh` to **osobne uruchomienie skryptu** (osobny proces bash,
   często osobne połączenie SSH) — `IMAGE_TAG` z builda już nie istniał w
   jego środowisku.
4. Pliki compose miały `image: chad-dashboard:${IMAGE_TAG:-latest}` — skoro
   `IMAGE_TAG` nie był ustawiony w `begin.sh`, zawsze wygrywał fallback
   `:latest`.
5. Efekt: TEST i PROD zawsze uruchamiały to, co ostatnio otagowano jako
   `latest` — niezależnie od tego, który skrypt (`04_qnap_test/02_build.sh`
   czy `05_qnap_prod/02_build.sh`) faktycznie zbudował obraz ostatnio.

## Mechanizm (naprawiony)

### Plik ze znacznikiem release'u

Dla każdego własnego obrazu istnieje jeden, kanoniczny, **gitignored** plik w
rootcie repo (per-host — na QNAP i lokalnie osobno, jak `.env.qnap`):

```
.image-tag.chad-dashboard.env
.image-tag.chad-content-provider-api.env
```

Zawartość: jedna linia, `IMAGE_TAG=YYMMDD_HHMMSS`.

Ścieżki wylicza `bash-scripts/common/lib.sh`:

```bash
dashboard_image_tag_file()          # -> $REPO_ROOT/.image-tag.chad-dashboard.env
content_provider_image_tag_file()   # -> $REPO_ROOT/.image-tag.chad-content-provider-api.env
```

### `write_image_tag` — zapis tylko po udanym buildzie

`bash-scripts/common/lib.sh`:

```bash
write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"
```

Wywoływane jako **ostatni krok** każdego `02_build.sh`, już PO
`docker compose build --pull`. Dzięki `set -euo pipefail` ta linia jest
osiągalna tylko wtedy, gdy build faktycznie się powiódł — nieudany build nigdy
nie nadpisuje zapisanego tagu. Zapis jest atomowy (plik tymczasowy + `mv`).

Żaden skrypt buildowy już nie robi `docker tag ... latest`.

### `require_image_tag` — odczyt, bez fallbacku

```bash
require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1
```

Wywoływane przez każdy `03_begin.sh` PRZED `docker compose up`. Jeśli plik nie
istnieje albo `IMAGE_TAG` jest pusty — **czytelny błąd, exit 1**, żadnego
fallbacku do `:latest`.

### Compose — required-var jako druga linia obrony

Wszystkie 4 pliki compose (`docker-compose.qnap.test.yml`,
`docker-compose.qnap.prod.yml`, `docker-compose.qnap.shared.yml`,
`docker-compose.local.yml`) zmienione z:

```yaml
image: chad-dashboard:${IMAGE_TAG:-latest}
```

na:

```yaml
image: "chad-dashboard:${IMAGE_TAG:?IMAGE_TAG is required, see documentation/ai-docs/deploy/image-tagging-standard.md}"
```

Nawet gdyby `require_image_tag` w jakimś skrypcie zostało pominięte, sam
`docker compose` odmówi interpolacji i zwróci czytelny błąd — potwierdzone
(`docker compose config` bez `IMAGE_TAG` → `error while interpolating
services.dashboard.image: required variable IMAGE_TAG is missing a value`).

## Jedna komenda dla release'u — TEST i PROD używają tego samego obrazu

`04_qnap_test/02_build.sh` i `05_qnap_prod/02_build.sh` budują **dokładnie
ten sam** obraz `chad-dashboard` (identyczny `context`/`dockerfile`/`target`
w obu plikach compose) — więc oba zapisują do TEGO SAMEGO pliku
`.image-tag.chad-dashboard.env`. Build wystarczy uruchomić raz — z
KTÓREGOKOLWIEK z dwóch katalogów — żeby oba środowiska miały dostęp do tego
samego zapisanego tagu.

```bash
# 1) Zbuduj i uruchom TEST (albo tylko zbuduj: bash bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh
#    uruchamia build + begin + status za jednym razem)
bash bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh

# 2) Sprawdź TEST ręcznie / wizualnie.

# 3) Wypromuj DOKŁADNIE ten sam, już przetestowany obraz na PROD — bez
#    ponownego builda. Wymaga wpisania "PROD".
bash bash-scripts/dashboard/06_qnap_ssh/begin_prod.sh
```

`begin_prod.sh` woła `05_qnap_prod/03_begin.sh`, które czyta ten sam plik
`.image-tag.chad-dashboard.env` zapisany przez krok 1 — nie ma tam żadnego
buildu.

### Weryfikacja, że TEST i PROD mają ten sam obraz

```bash
docker inspect chad-dashboard-test  --format '{{.Config.Image}}'
docker inspect chad-dashboard-prod  --format '{{.Config.Image}}'
docker images chad-dashboard
```

Oba `Config.Image` powinny pokazywać ten sam tag (`chad-dashboard:YYMMDD_HHMMSS`),
a `docker images` — jeden wiersz z tym tagiem, bez `latest`.

## Content Provider (shared)

`00_qnap_shared/02_build.sh` / `03_begin.sh` używają dokładnie tego samego
mechanizmu, plik `.image-tag.chad-content-provider-api.env`. CP jest
zbudowany rzadziej niż dashboard (osobny cykl release'u) — ten sam wzorzec
mimo to.

## Local Mac Docker

`03_local_mac_docker/02_build.sh` buduje OBA obrazy w jednym wywołaniu i
zapisuje OBA pliki tagów (ten sam znacznik czasowy dla obu, bo budowane razem).
`03_begin.sh` wymaga obu przed `docker compose up`.

## Jak wymusić rebuild zamiast promocji

Czasem chcesz faktycznie zbudować nową wersję zamiast promować już
zbudowaną — po prostu uruchom `06_deploy.sh` (build+begin+status) dla
docelowego środowiska zamiast samego `03_begin.sh`/`begin_*.sh`:

```bash
bash bash-scripts/dashboard/06_qnap_ssh/deploy_prod.sh   # buduje NOWY obraz i od razu go uruchamia na PROD
```

To nadpisze `.image-tag.chad-dashboard.env` nowym znacznikiem — kolejne
`begin_test.sh` też zacznie go używać.

## Diagnostyka vs. jednorazowa naprawa vs. proces docelowy

Podczas naprawy tego konkretnego incydentu (2026-07-13) na QNAP już istniał
zbudowany obraz `chad-dashboard` z poprawnym tagiem czasowym
(`260713_134936`, potwierdzone `docker inspect` — `RepoTags` zawierał
zarówno `260713_134936` jak i `latest`, oba wskazujące na ten sam `Image ID`).
Zamiast rebuildować (którego użytkownik wyraźnie zabronił, skoro tag już
istniał), wykonano **jednorazową naprawę awaryjną**: ręcznie zapisano plik
`.image-tag.chad-dashboard.env` z zawartością `IMAGE_TAG=260713_134936` na
QNAP-ie, odzwierciedlającą stan już zbudowanego obrazu — bez `docker tag`,
bez rebuildu. Analogicznie dla `chad-content-provider-api`, który miał tylko
`:latest` (brak zachowanego tagu czasowego) — otagowano istniejący obraz
(`docker tag`, bez rebuildu) znacznikiem odpowiadającym jego rzeczywistej
dacie budowy, i zapisano ten tag w pliku. Od tego momentu oba pliki są w
pełni własnością zautomatyzowanego mechanizmu (`write_image_tag`/
`require_image_tag`) — to była naprawa startowa tego jednego przejścia, nie
równoległy, ukryty proces.

## `05_status.sh` i `04_end.sh` — te same compose pliki, inny wymóg

`docker compose ps` i `docker compose down` też muszą zinterpolować cały plik
compose (w tym pole `image:`), mimo że w przeciwieństwie do `up`/`build` NIE
potrzebują, żeby obraz istniał albo miał sensowny tag — `ps`/`down` nigdy go
nie pobierają ani nie uruchamiają. Twardy wymóg `require_image_tag` w tych
skryptach zablokowałby np. sprawdzenie statusu stacka, który nigdy nie został
zbudowany, albo zatrzymanie stacka, któremu ktoś ręcznie usunął plik tagu.

Dlatego `05_status.sh`/`04_end.sh` we wszystkich czterech środowiskach
(`00_qnap_shared`, `03_local_mac_docker`, `04_qnap_test`, `05_qnap_prod`) używają
łagodniejszego `image_tag_for_readonly()` zamiast `require_image_tag()`:
zwraca zapisany tag, jeśli istnieje, w przeciwnym razie nieszkodliwy
placeholder `"none"` — wystarczający, żeby `docker compose` się nie wywalił,
nigdy nie używany do faktycznego builda/startu.

## Znane ograniczenia

- Brak dedykowanego skryptu do "wymuś rebuild z powodem X" — `06_deploy.sh`
  zawsze buduje; jeśli chcesz zbudować i NIE uruchamiać automatycznie, użyj
  samego `02_build.sh`.
- Brak automatycznego czyszczenia starych, nieużywanych tagów `chad-dashboard`
  na QNAP (widziano kilkanaście starych tagów z ostatnich dni) — obrazy
  zajmują miejsce na dysku; ręczne `docker image prune` albo dedykowany
  skrypt czyszczący to potencjalna przyszła praca, celowo nie zrobiona w
  ramach tego zadania (nie kasuj obrazów bez wyraźnej potrzeby).
