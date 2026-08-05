# Story 104 — Input

## Input 1

CHAD --- Prompt dla Claude Code: Links V2 (Claude21_links)

0. Specjalizacja

Jesteś specjalistą Claude21_links odpowiedzialnym za powiązaniedanych CHAD (Leads), Beeper oraz Google Contacts.

1. Zadanie

Powstaje nowa wersja funkcjonalności:

Links V2

Nie rozwijaj starego modułu Links. Pozostaw go bez zmian i utwórz nowąimplementację Links V2.

Celem jest automatyczne powiązanie jednego leada z:

rozmowami Beeper,

kontaktami Google Contacts,

kolejnymi źródłami w przyszłości.

Lead pozostaje głównym obiektem.

2. Model linków

Lead jest zapisany jako cp_item.

W folderze leada istnieją Text Itemy zawierające dane kontaktowe:

numer telefonu,

instagram,

telegram,

whatsapp,

messenger,

inne.

Po znalezieniu zgodności tworzony jest nowy Text Item:

links

w folderze leada.

Body ma być YAML.

Przykład:

beeper:
  - chatId: ...
    type: whatsapp

  - chatId: ...
    type: instagram

googleContacts:
  - resourceName: ...

Jeden lead może mieć wiele linków.

Nie zapisuj tych informacji w config ani w bazie Beeper.

3. Synchronizacja

Dodaj w Msg Automation → Links V2 przycisk:

Synchronize

Po kliknięciu:

wyszukaj nowe dopasowania,

zaktualizuj links,

pokaż raport.

Automatycznie synchronizacja ma uruchamiać się codziennie około05:00.

Nie wykonuj pełnego skanu przy każdym wejściu do strony.

4. Łączenie z Beeper

Dopasowanie przede wszystkim po:

numerze telefonu,

później innych identyfikatorach.

Jeżeli znaleziono zgodność:

dopisz chatId do links.

Jeden lead może być połączony z wieloma chatami.

5. Google Contacts

Nowy moduł Google Contacts również ma być używany.

Po numerze telefonu:

wyszukaj kontakt,

dopisz resourceName do links.

Nie kopiuj całego kontaktu do CHAD.

6. GUI

W Lead Details dodaj:

Beeper

Lista połączonych rozmów.

Każda pozycja:

typ komunikatora,

link do konwersacji.

Google Contacts

Lista dopasowanych kontaktów.

Każda pozycja:

nazwa,

numer,

link do Google Contacts,

opcjonalnie link do szczegółów.

7. Draft Leads

Jeżeli podczas synchronizacji pojawią się nowe kontakty Beeper, którenie mają leada:

utwórz Draft Lead.

Draft ma być widoczny na liście leadów.

Nie twórz duplikatów.

8. Architektura

Najpierw przeczytaj:

ai-docs/begin_here

dokumentację msg-automation

dokumentację Beeper

dokumentację Google Contacts

dokumentację DBA.

Nie zgaduj struktury.

Najpierw znajdź istniejące modele.

Nie umieszczaj całej logiki w Dashboard.

Logika ma być w odpowiednim package.

Przygotuj moduł rozszerzalny o kolejne providery.

Preferowany model:

Lead → Link Provider → Beeper Provider → Google Contacts Provider →przyszłe providery.

9. Story

Utwórz Story zgodnie z aktualnym standardem.

Podziel implementację na małe taski.

10. Testy

Obowiązkowo:

wiele chatów jednego leada,

wiele providerów jednego leada,

brak duplikatów,

synchronizacja ręczna,

synchronizacja automatyczna,

tworzenie Draft Lead,

brak tworzenia drugiego Draft Lead,

Google Contacts matching,

przebudowa lokalnego Dockera,

smoke test.

11. Kryteria akceptacji

✔ działa Links V2

✔ stare Links nadal działa

✔ Synchronize działa

✔ scheduler 05:00 działa

✔ Beeper linkuje

✔ Google Contacts linkuje

✔ tworzą się Draft Leads

✔ GUI pokazuje wszystkie powiązania

✔ brak duplikatów

✔ testy PASS

12. Przypomnienie

Przenieś obowiązkowo zabezpieczenia 2.x z promptu startowego v11(commit początkowy, dokumentacja, testy, rollback, Docker rebuild, brakregresji, uczciwy raport). Nie skracaj punktów krytycznych.
