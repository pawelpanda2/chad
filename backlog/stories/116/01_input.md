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

## Input 5

CHAD — Claude Code: Payments — naprawa Checkout + Dev Panel logs + Admin Payments

1. Zadanie

To jest kontynuacja aktualnego Story Payments/Stripe. Nie zaczynaj od nowa.

Użytkownik wykonał realny test Stripe Sandbox:

Settings → Payments,

podał kwotę,

wszedł do Stripe Checkout,

wpisał kartę testową,

po zatwierdzeniu płatności spinner kręcił się bez końca,

brak potwierdzenia,

w Stripe Sandbox → Payments nie widać transakcji.

Najpierw ustal dokładny etap awarii. Nie zakładaj automatycznie, że winny jest webhook.

Oczekiwany flow: CHAD tworzy Checkout Session → Stripe zwraca URL → browser przechodzi do Stripe Checkout → klient zatwierdza płatność → Stripe kończy Session / PaymentIntent → checkout.session.completed → webhook CHAD zapisuje wynik → klient wraca success_url.

Sprawdź CHAD server logs, Stripe Workbench/API request logs i Events. Potwierdź: czy powstała Checkout Session, jej session.id i session.url, amount/currency/mode, czy powstał PaymentIntent, czy używany jest właściwy testowy Stripe account/key, czy Checkout kończy się błędem po stronie Stripe, czy success/cancel URL są poprawne.

Nie loguj żadnych sekretów ani danych kart.

1.1. Napraw spinner — UI nie może wisieć bez końca: przy tworzeniu Checkout pokaż stan loading; po otrzymaniu session.url natychmiast redirect; przy błędzie zatrzymaj spinner i pokaż komunikat; dodaj sensowny timeout/error handling; cancel przywraca normalny stan; success pokazuje status płatności; refresh nie tworzy kolejnej sesji; sam success query param nie jest dowodem zapłaty.

1.2. Dev Panel → Payments — osobna zakładka/sekcja jako narzędzie diagnostyczne: timestamp, environment CHAD, Stripe mode test/live, etap (checkout_create_requested/checkout_created/checkout_create_failed/webhook_received/webhook_verified/webhook_rejected/payment_completed/payment_failed/inne rzeczywiste statusy), Checkout Session ID, PaymentIntent ID, repo/user context, amount + currency, status, krótki sanitized error/message. Nie zapisuj numerów kart, CVC, secret key, webhook secret, Stripe-Signature ani pełnych payloadów. Log ma przetrwać refresh. Przed zmianą schematu sprawdź aktualną migrację 0005_stripe_payments.sql i istniejący model. Nie twórz konkurencyjnego źródła prawdy bez potrzeby.

1.3. Admin — nowa struktura menu: Aktualną bezpośrednią pozycję Users zastąp strukturą: Admin → Users, Admin → Payments. Nie usuwaj Users; przenieś je logicznie pod Admin. Jeżeli repo ma już sekcję/route Admin, użyj jej zamiast tworzenia drugiej.

1.4. Admin → Payments — read-only lista transakcji/płatności. Kolumny minimum: data/czas, user/repo, amount, currency, Stripe mode test/live, environment CHAD jeśli jest dostępne, Checkout Session ID, PaymentIntent ID, status płatności. Rozróżniaj test/live na podstawie rzeczywistych danych Stripe (np. livemode), a nie po nazwie. Admin Payments nie służy do logów technicznych — te są w Dev Panelu. Nie dodawaj refund/delete/manual status change.

1.5. Architektura — zachowaj: Dashboard → packages/dba → packages/payments → Stripe. Dla trwałych danych: Dashboard → packages/dba → PostgreSQL. Dashboard ma być cienkim adapterem. Nie importuj Stripe bezpośrednio do komponentów Dashboardu.

1.6. Webhook — POST /api/webhooks/stripe, gotowy do późniejszego działania pod https://chad.biz.pl/api/webhooks/stripe: bez sesji użytkownika, Stripe signature verification, raw body, STRIPE_WEBHOOK_SECRET server-side, idempotencja, szybka odpowiedź, checkout.session.completed zapisuje końcowy stan, błędny podpis niczego nie mutuje. Nie deployuj PROD bez zgody.

1.7. Test2 / test3 — dla integracyjnych testów PostgreSQL nie wymyślaj fake repoGuid, jeśli test przechodzi przez realny repo context. Używaj test2 (resetowalny/śmieciowy sandbox) i test3 (kontrolowane testy środowiska), pobierz ich rzeczywisty repoGuid istniejącym mechanizmem CHAD. Fake repoGuid tylko w czystych unit testach bez realnej bazy. Nigdy nie mutuj pawel_f, kamil_s ani innych realnych użytkowników.

1.8. Testy — Checkout (poprawne utworzenie Sandbox Session, Session ma URL, prawidłowa kwota i PLN, błędy zatrzymują spinner, brak nieskończonego loading, realny test kartą testową jeśli network/credentials dostępne); Stripe (znajdź Session w Workbench/API logs, po sukcesie płatność jest widoczna w Sandbox, jeśli nie jest — podaj konkretny Stripe error); Webhook (brak podpisu → kontrolowany 4xx, zły podpis → kontrolowany 4xx, brak secret → kontrolowany config error, poprawny event → zapis, duplicate → bez podwójnego skutku, test/live zapisane poprawnie); Dev Panel (lifecycle widoczny, brak sekretów, błędy widoczne po refreshu); Admin (Admin → Users działa, Admin → Payments działa, lista pokazuje status i test/live, auth/admin permissions zgodne z projektem); Regresje (login/auth, Settings → Payments, Dev Panel, Admin Users, DBA, typecheck/build, oficjalny local Docker rebuild/restart/status/healthcheck, realny smoke test).

1.9. Najważniejsze kryterium — Nie kończ na buildzie/mockach. Masz ustalić DLACZEGO testowa płatność wisiała i DLACZEGO nie pojawiła się w Stripe Sandbox. Jeżeli realny Sandbox E2E nadal jest zablokowany, podaj: etap, Session ID/status, PaymentIntent ID/status jeśli istnieje, konkretny błąd, czego brakuje.

2. Zabezpieczenia przekazywane do AI Codera (pełna treść sekcji 2.1–2.15 — minimalizacja tokenów, dokumentacja i standardy według specjalizacji, obowiązkowy punkt powrotu przed rozpoczęciem pracy, zakaz zgadywania struktury systemu, celowana analiza repo, testy regresyjne przed commitem, bezpieczeństwo danych i migracji, architektura DBA, izolacja użytkowników, git i równoległa praca, deployment, autonomia, uczciwość testów i raportu, wznowienie pracy, obowiązkowe przebudowanie lokalnego środowiska po zmianach — identyczna treść jak w Input 1, pominięta tu dosłownie ze względu na długość; zastosowana zasada z 03_knowledge.md).

3. Kolejność pracy — wznów Story od pierwszego niewykonanego kroku; zapisz aktualny punkt Git; odtwórz problem; sprawdź CHAD logs + Stripe Workbench/API logs; ustal root cause; napraw Checkout/spinner; dodaj trwałą sanitizowaną diagnostykę przez DBA; dodaj Dev Panel → Payments; przebuduj Admin → Users/Payments; dodaj testy; uruchom regresje; commituj własny zakres; oficjalny local Docker rebuild/restart/status/healthcheck; powtórz realny Sandbox Checkout kartą testową; uzupełnij Story.

4. Raport końcowy — krótko: root cause spinnera, czy Session powstała, czy PaymentIntent/płatność pojawiła się w Stripe Sandbox, wynik realnego testu kartą, Dev Panel → Payments, Admin → Payments, testy, Docker/smoke, commit SHA, prawdziwe blokady. Nie drukuj sekretów ani pełnych danych Stripe.

## Input 6

chcialem zebys zlaczyl user i peyments w taki sposob ze pod others na dole daj admin
i po jego kliknieciu nowe menu tkaie jak w Msg Auto
i tam przyciski takie jak w Msg Auto przyciski Users i Payments, gdzie admin moze podgladac platnosci roznych uzytkownikow
2)a w settings payments zmien gui payments tak zeby uzytkownik pod przyciskiem platnosci widial swoje poprzednie udane tranzakcje platnosci
3) i usun ten przycisk back to payments to to jest ta sama zakladka i to jest bez sensu niech po prostu bedzie komunikat ze sie udala

## Input 7

wypierdol ten napis:
Payments
Make a one-off card payment via Stripe Checkout. This is not a subscription — every payment is its own transaction, and you choose the amount each time.
nie lubie takich dodatkowych opisow
