# AI start — read this first

Status: utworzone 2026-07-14 jako nowy punkt startowy dla AI (wydzielony z
`what-and-where.md`, które teraz jest indeksem, nie punktem wejścia).

To jest **pierwszy dokument**, który AI ma przeczytać przed jakimkolwiek
większym zadaniem w tym repo. Jest celowo krótki — to tylko wskazanie
kolejności czytania, nie opis standardów samych w sobie.

## Kolejność

1. **Ten dokument** — jesteś tu.
2. [`02_what-and-where.md`](02_what-and-where.md) — spis treści całej wiedzy
   (knowledge) i indeks całej pozostałej dokumentacji projektu. Otwórz go
   dalej i użyj jako indeksu — nie czytaj całej dokumentacji projektu za
   każdym razem, tylko sekcje potrzebne do aktualnego zadania.
3. [`03_story-standard.md`](03_story-standard.md) — opisuje obowiązujący
   standard realizacji Story (kiedy zakładać katalog `documentation/stories/<N>/`,
   sześć plików, **obowiązkowy `05_tasks_and_checklist.md`** — Checklist
   RAZEM z opisem każdego tasku, to najważniejszy plik całego standardu —
   opcjonalny `06_others_from_report.md` na decyzje/problemy/propozycje).
4. [`04_deployment-rules.md`](04_deployment-rules.md) — zasady buildu/startu/
   stopu/deploymentu wyłącznie oficjalnymi skryptami projektu.

## Podczas pracy nad Story

- Regularnie aktualizuj `documentation/stories/<N>/04_todos.md`. Służy
  wyłącznie do zapisywania bieżącego stanu pracy, żeby po przerwaniu sesji
  AI mogło wznowić pracę tam, gdzie skończyło.
- Po zakończeniu Story `04_todos.md` ma być puste — to sygnał, że nie
  zostały żadne nierozwiązane wątki (szczegóły w `03_story-standard.md`).

**Dopiero po przeczytaniu powyższego** rozpocznij analizę kodu i
implementację.
