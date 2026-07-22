# AI start — read this first

Status: utworzone 2026-07-14 jako nowy punkt startowy dla AI (wydzielony z
`what-and-where.md`, które teraz jest indeksem, nie punktem wejścia).

To jest **pierwszy dokument**, który AI ma przeczytać przed jakimkolwiek
większym zadaniem w tym repo. Jest celowo krótki — to tylko wskazanie
kolejności czytania, nie opis standardów samych w sobie.

## Najczęstszy błąd AI w tym repo — przeczytaj to PIERWSZE

**(dodane 2026-07-22, po realnym incydencie: AI zapytało o zgodę na deploy
PROD tak, jakby to była ryzykowna, osobna operacja budowania — mimo że
odpowiedź jest już opisana w `04_deployment-rules.md` i
`deploy/ai-start.md`, tylko AI ich nie zastosowało w praktyce.)**

- **Obraz Dockera buduje się WYŁĄCZNIE podczas deployu na TEST**
  (`bash-scripts/dashboard/08_registry_test/deploy.sh` albo
  `06_qnap_test_ssh/06_deploy.sh`). **Deploy na PROD nigdy nie buduje
  niczego od nowa** — to wyłącznie promocja/przełączenie na TEN SAM,
  już zbudowany i zweryfikowany na TEST obraz
  (`07_qnap_prod_ssh/06_last_from_test.sh`). Nie ma czegoś takiego jak
  "osobny build dla PROD".
- TEST i PROD to **osobne kontenery** (celowo — żeby oddzielić GUI/proces
  dashboardu i najpierw zweryfikować na TEST, zanim ten sam obraz trafi na
  PROD), ale **współdzielą te same, prawdziwe dane** przez
  `docker-compose.qnap.shared.yml` — TEST **nie jest środowiskiem z
  fejkowymi/testowymi danymi**. Od Story 76 (2026-07-22) shared zawiera
  DWIE bazy Mongo: `chad-mongodb` (cp_items/cp_history, replica set) oraz
  `beeper-mongodb` (dane Beepera, standalone) — obie współdzielone przez
  TEST i PROD.
- **Wniosek praktyczny:** deploy na PROD (promocja już przetestowanego na
  TEST obrazu) to rutynowa, niskiego ryzyka operacja przez oficjalny
  skrypt — nie wymaga tego samego poziomu ostrożności co np. migracja
  danych czy zmiana schematu. Nie pytaj o zgodę na "zbudowanie i wdrożenie
  na PROD" jakby to był nowy build — to zawsze tylko przełączenie na obraz,
  który już działa na TEST.
- Pełny kontrakt: `04_deployment-rules.md` (niżej w tej kolejności) i
  `deploy/ai-start.md` → `deploy/dashboard-deployment-scripts.md`.

## Kolejność

1. **Ten dokument** — jesteś tu.
2. [`02_what-and-where.md`](02_what-and-where.md) — spis treści całej wiedzy
   (knowledge) i indeks całej pozostałej dokumentacji projektu. Otwórz go
   dalej i użyj jako indeksu — nie czytaj całej dokumentacji projektu za
   każdym razem, tylko sekcje potrzebne do aktualnego zadania.
3. [`03_story-standard.md`](03_story-standard.md) — opisuje obowiązujący
   standard realizacji Story (kiedy zakładać katalog `backlog/stories/<N>/`,
   sześć plików, **obowiązkowy `05_tasks_and_checklist.md`** — Checklist
   RAZEM z opisem każdego tasku, to najważniejszy plik całego standardu —
   opcjonalny `06_others_from_report.md` na decyzje/problemy/propozycje).
4. [`05_endpoint-rules.md`](05_endpoint-rules.md) — zasady dodawania/zmiany
   endpointów i metod `dba`: kiedy wolno dodać brakującą obsługę zapisu,
   zakaz pozornego Save/stuba, kompatybilność przy zmianie istniejącego
   endpointu. Czytaj przed implementacją **każdego** feature'a, który
   zapisuje/modyfikuje dane (numer `05` odzwierciedla kiedy plik powstał,
   nie kolejność czytania — stąd czytany tu, przed `04_deployment-rules.md`).
5. [`04_deployment-rules.md`](04_deployment-rules.md) — zasady buildu/startu/
   stopu/deploymentu wyłącznie oficjalnymi skryptami projektu.

## Podczas pracy nad Story

- Regularnie aktualizuj `backlog/stories/<N>/04_todos.md`. Służy
  wyłącznie do zapisywania bieżącego stanu pracy, żeby po przerwaniu sesji
  AI mogło wznowić pracę tam, gdzie skończyło.
- Po zakończeniu Story `04_todos.md` ma być puste — to sygnał, że nie
  zostały żadne nierozwiązane wątki (szczegóły w `03_story-standard.md`).

**Dopiero po przeczytaniu powyższego** rozpocznij analizę kodu i
implementację.
