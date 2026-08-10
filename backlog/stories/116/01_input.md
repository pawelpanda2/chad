# Story 116 — Input

## Input 1

CHAD — Claude Code: Settings → Display + Payments / Stripe (zmienna kwota)

1. Opis konkretnego zadania użytkownika

To jest NOWE zadanie. Nie zakładaj, że wcześniejszy prompt Stripe został wykonany. Najpierw sprawdź rzeczywisty stan repo.

1.1. Settings — oczekiwany rezultat

W Settings istnieją zakładki pozostałe z początkowego template. Uporządkuj ten obszar:

usuń z nawigacji Notifications, ponieważ jest atrapą;

usuń z nawigacji API / API Keys, ponieważ jest atrapą;

zachowaj Display, ale zamień jego atrapową zawartość na realną konfigurację wyglądu;

dodaj nową zakładkę Payments;

nie przebudowuj pozostałych działających ustawień bez potrzeby.

1.2. Theme → Display

Obecny prawdziwy mechanizm wyboru motywu (ThemeModeSelector lub jego aktualny odpowiednik) ma zostać przeniesiony do:

Settings → Display

Display ma zawierać prawdziwy wybór:

Theme
Light
Dark
System

Wymagania:

wykorzystaj istniejący provider i istniejącą persistencję;

nie twórz drugiego mechanizmu Theme;

usuń atrapowe switche Dark Mode / System Theme, jeżeli rzeczywiście nadal istnieją;

Theme nie ma być już globalnie wyświetlany ponad każdą podstroną Settings;

Light/Dark/System muszą działać po refreshu i przy nawigacji.

1.3. Payments

Dodaj realną stronę:

Settings → Payments

Ma umożliwiać jednorazową płatność kartą przez Stripe Checkout.

To NIE jest subskrypcja. Każda płatność jest osobną transakcją.

Najważniejsza zmiana względem wcześniejszych koncepcji: cena NIE jest stała.

Użytkownik wpisuje kwotę przed każdą płatnością, np.:

Amount
[ 500.00 ] PLN

[ Pay with card ]

Następnym razem może wpisać np. 2000.00.

Waluta na tym etapie:

PLN

Nie używaj stałego STRIPE_PRICE_ID.

1.4. Stripe Checkout — architektura

Preferowany flow:

Settings / Payments
→ użytkownik wpisuje kwotę
→ server-side endpoint CHAD
→ walidacja kwoty
→ Stripe Checkout Session
→ Stripe-hosted Checkout
→ success/cancel wraca do CHAD
→ zweryfikowany webhook Stripe potwierdza płatność

Użyj oficjalnego Stripe SDK i aktualnej oficjalnej dokumentacji Stripe.

Nie buduj własnego formularza danych karty.

Checkout Session ma używać dynamicznej ceny, np. aktualnego wspieranego mechanizmu line_items.price_data, zamiast tworzenia osobnego trwałego Stripe Price dla każdej kwoty.

1.5. Walidacja zmiennej kwoty

Frontend może walidować dla UX, ale bezpieczeństwo musi być server-side.

Backend ma:

przyjmować wyłącznie poprawną kwotę;

odrzucać 0;

odrzucać wartości ujemne;

odrzucać tekst, NaN, infinity i błędne formaty;

odrzucać więcej niż 2 miejsca po przecinku;

poprawnie zamieniać PLN na grosze bez błędów floating point;

nie ufać wartości przesłanej przez browser;

nie pozwalać klientowi podmienić waluty;

stosować sensowny konfigurowalny techniczny limit maksymalny, jeżeli jest potrzebny.

Nie hardcoduj limitu 2400/2403 PLN. Payments nie ma zawierać logiki PUP ani podatkowej.

1.6. Auth i bezpieczeństwo

Endpoint tworzący Checkout Session:

wymaga zalogowanej sesji CHAD;

identyfikuje użytkownika z sesji/repo context;

nie ufa dowolnemu repoGuid/userId z requestu;

używa STRIPE_SECRET_KEY wyłącznie server-side;

tworzy mode: payment;

ustawia bezpieczne success/cancel URLs zgodnie z aktualną konfiguracją origin aplikacji.

Nie wolno:

przechowywać numerów kart ani CVC;

logować sekretów;

wysyłać secret key do browsera;

używać Stripe LIVE do developmentu;

uznawać samego wejścia na success URL za dowód zapłaty.

1.7. Webhook

Dodaj webhook Stripe:

weryfikuj Stripe-Signature;

użyj STRIPE_WEBHOOK_SECRET;

użyj raw request body zgodnie z wymaganiami aktualnego Stripe SDK;

odrzucaj brak/błędny podpis;

obsłuż wymagane zdarzenie potwierdzające Checkout, np. checkout.session.completed, jeśli aktualna dokumentacja nadal wskazuje je dla tego flow;

zapewnij idempotencję;

ponowne dostarczenie tego samego eventu nie może powodować podwójnego skutku biznesowego.

Nie wymyślaj rozbudowanego billing database/entitlement systemu, jeśli nie jest potrzebny do tego Story. Jeżeli trwały zapis jest konieczny, najpierw zastosuj aktualną architekturę DBA.

1.8. Success / Cancel

Po Checkout:

success pokazuje czytelny stan sukcesu;

cancel pokazuje anulowanie i pozwala wrócić do Payments;

query parameter sam w sobie nie jest wiarygodnym potwierdzeniem zapłaty;

refresh nie tworzy kolejnej Checkout Session.

1.9. Konfiguracja

Minimalnie przewidź:

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

Jeżeli repo ma inną obowiązującą konwencję nazw env, zastosuj ją.

Nie dodawaj STRIPE_PRICE_ID, ponieważ kwota jest dynamiczna.

Prawdziwe sekrety:

tylko w odpowiednim lokalnym env/secrets;

nigdy w Git;

nigdy w .env.example.

Do example dodaj tylko puste placeholdery/nazwy.

1.10. Sandbox

Implementacja i testy mają używać Stripe Sandbox/Test Mode.

Jeżeli użytkownik nie przekazał jeszcze lokalnych kluczy, nie blokuj implementacji:

przygotuj pełny kod;

testuj walidację i integrację przez mocki;

jasno oznacz realny Stripe E2E jako niewykonany/zablokowany.

Nie przechodź na LIVE i nie wykonuj prawdziwych obciążeń.

1.11. Cleanup atrap

Usuń Notifications oraz API/API Keys z nawigacji Settings.

Jeżeli ich route/pliki są wyłącznie martwymi atrapami template i nie mają żadnych realnych referencji, mogą zostać usunięte. Najpierw to sprawdź.

Nie rób szerokiego cleanup całego Settings.

1.12. Story

Utwórz nowe Story według aktualnego: ai-docs/begin_here/03_story-standard.md.

Nie zgaduj numeru Story.

Logiczny podział:

Settings navigation cleanup

Theme → Display

Payments UI

dynamic Stripe Checkout

webhook/security

tests

local Docker rebuild + smoke

documentation

Jeżeli aktualny standard Story mówi inaczej, stosuj repo jako źródło prawdy.

1.13. Testy

Obowiązkowo:

Settings:

brak Notifications w nav;

brak API w nav;

Display działa;

Payments działa;

brak regresji pozostałych Settings.

Theme:

Light;

Dark;

System;

persistence po refreshu;

brak starego globalnego Theme;

brak atrapowych switchy.

Payments:

poprawne kwoty, np. 1, 500, 500.50, 2000;

0 odrzucone;

ujemne odrzucone;

tekst/NaN odrzucone;

2 miejsc po przecinku odrzucone;

prawidłowa konwersja PLN → grosze;

klient nie może podmienić waluty;

niezalogowany użytkownik nie tworzy Checkout Session;

brak konfiguracji Stripe daje kontrolowany błąd, nie crash;

Checkout Session używa kwoty po walidacji server-side;

webhook bez/błędnego podpisu jest odrzucony;

poprawny webhook działa;

powtórzony event jest idempotentny;

żaden sekret nie trafia do klienta.

Na końcu:

typecheck;

właściwe testy;

build;

oficjalny local Mac Docker rebuild/restart/status/healthcheck;

realny smoke test Display i Payments.

1.14. Kryteria akceptacji

Gotowe dopiero gdy:

Notifications i API zniknęły z Settings nav;

Theme Light/Dark/System jest w Display i realnie działa;

Payments jest realną zakładką;

użytkownik może podać inną kwotę dla każdej płatności;

PLN jest ustalane server-side;

nie istnieje zależność od stałego STRIPE_PRICE_ID;

Stripe Checkout jest server-side i używa test mode;

webhook weryfikuje podpis;

success/cancel działa;

brak sekretów w repo/client bundle;

testy PASS w faktycznie uruchomionym zakresie;

lokalny Docker został przebudowany i funkcja sprawdzona.

2. Zabezpieczenia przekazywane do AI Codera

(pełna treść sekcji 2.1–2.15 z oryginalnego promptu — reguły minimalizacji tokenów, dokumentacji, punktu powrotu w Git, zakazu zgadywania struktury systemu, celowanej analizy repo, testów regresyjnych przed commitem, bezpieczeństwa danych/migracji, architektury DBA, izolacji użytkowników, pracy równoległej w Git, deploymentu, autonomii, uczciwości testów/raportu, wznowienia pracy, oraz obowiązkowego przebudowania lokalnego środowiska Docker po zmianach — pominięta tu dosłownie ze względu na długość, patrz oryginalny prompt użytkownika w historii sesji; kluczowe zasady zastosowane w tym Story są streszczone w `03_knowledge.md`).

3. Kolejność pracy i raport (jak w oryginalnym promptcie, sekcja 3) — zabezpiecz punkt startowy Git, przeczytaj dokumentację, sprawdź kod, sprawdź czy Stripe już częściowo dodany, sprawdź dokumentację Stripe, utwórz Story, wykonaj zakres 1.x, uruchom testy regresyjne, commituj własny zakres (bez push), wykonaj lokalny Docker rebuild/restart/status/healthcheck i smoke test, uzupełnij Story, krótki raport końcowy.

## Input 2

WAŻNA POPRAWKA ARCHITEKTONICZNA

Utwórz nowy package:

packages/payments

Cała logika płatności i integracji Stripe ma znajdować się w `packages/payments`, a nie bezpośrednio w Dashboardzie.

Obowiązkowy przepływ:

Dashboard
→ packages/dba
→ packages/payments
→ Stripe

Dashboard ma być wyłącznie cienką warstwą UI/API. DBA udostępnia kontrakt/metody płatności, a `packages/payments` implementuje logikę Stripe: walidację kwoty, Checkout Session, webhooki i komunikację ze Stripe.

Nie omijaj DBA przez bezpośrednie importowanie `packages/payments` w Dashboardzie.

## Input 3

Daję Ci w tej wiadomości testowy Stripe Secret Key:

sk_test_[REDACTED — real value never recorded in this Story per this same input's own instruction not to put the secret in any documentation/Story; the real value was placed only in the local `.env.local` used by local Mac Docker]

1. Umieść go w odpowiednim PRAWDZIWYM lokalnym env CHAD używanym przez local Mac Docker. Nie dodawaj sekretu do żadnego `.example`, dokumentacji, Story, logów ani Git.
2. Sprawdź, czy docker-compose faktycznie przekazuje `STRIPE_SECRET_KEY` do właściwego kontenera.
3. Wykonaj wymagany restart/rebuild oficjalnymi skryptami CHAD i sprawdź Checkout.

Dodatkowo przygotuj webhook tak, aby docelowo działał publicznie pod:

https://chad.biz.pl/api/webhooks/stripe

Webhook ma:
- działać bez sesji/logowania użytkownika;
- przyjmować POST od Stripe;
- weryfikować `Stripe-Signature`;
- używać `STRIPE_WEBHOOK_SECRET` wyłącznie server-side;
- korzystać z raw request body zgodnie z wymaganiami Stripe;
- zachować idempotencję;
- obsługiwać `checkout.session.completed`;
- nie ufać success URL jako potwierdzeniu płatności.

WAŻNE:
Nie deployuj teraz PROD i nie konfiguruj LIVE Stripe. Przygotuj kod, env/docker i endpoint tak, żeby po późniejszym deployu na chad.biz.pl wystarczyło skonfigurować endpoint w Stripe Dashboard i dodać otrzymany `whsec_...` jako `STRIPE_WEBHOOK_SECRET`.

Nie wypisuj mojego STRIPE_SECRET_KEY w odpowiedzi ani w komendach diagnostycznych.
