# Story 119 — Input

## Input 1

Claude/Cursor — Folders item-id + frame fix + CP-item links we wspólnym Preview (v11)

1. Zadania

1.1 Folders — item-id

W Folders, bezpośrednio pod istniejącym address, pokaż:

item-id: [GUID prawdziwego CpItem.id]

Nie generuj UUID i nie myl go z address/loca/repo id. Zachowaj styl address i możliwość łatwego kopiowania.

1.2 Folders — popraw tylko zewnętrzną ramkę

Na screenie /mnt/data/Screenshot 2026-08-13 at 18.44.57.png większa zewnętrzna ramka kończy się za wysoko i przecina wizualnie elementy drzewa. Same itemy są ułożone poprawnie i dochodzą do dołu.

BARDZO WAŻNE:

nie przesuwaj itemów;

nie zmieniaj ich układu;

nie ucinaj ich;

popraw wyłącznie wysokość/geometrię zewnętrznej ramki, aby obejmowała całą faktyczną zawartość.

Znajdź root cause (height, max-height, flex, overflow, absolute positioning, błędne 100%, wrapper itd.). Nie maskuj problemu losowym dużym min-height.

1.3 Shared Preview — link do CP Item po UUID

Dodaj składnię CHAD:

//pamiętać
    [21d11bdc-f1f4-44d1-b61a-3fa6b039c641]
    - Wyluzować co najmniej 2h

W Preview UUID ma być niewidoczny, a:

Wyluzować co najmniej 2h

ma stać się linkiem do CP Item o id = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641.

Semantyka:

[VALID_UUID]
- następny element

UUID jest metadanym targetem następnego myślnika. Link ma identyfikować item po stabilnym id, NIE po address. Przeniesienie itemu i zmiana address nie mogą zepsuć linku.

Obsłuż taby/wcięcia używane w notatkach.

1.4 Tylko hdr1 i hdr2

Nową interpretację [UUID] wdroż dla Preview:

hdr1
hdr2

md pozostaje zwykłym rendererem Markdown i nie może dostać tej semantyki.

Nie zgaduj implementacji — znajdź realne renderery hdr1/hdr2/md w HEAD.

1.5 Funkcja ma działać wszędzie przez wspólny Preview

Preview jest używane m.in.:

Folders;

Knowledge po otwarciu dokumentu;

inne ekrany korzystające ze wspólnego edytora/Preview.

Nie implementuj parsera osobno w Folders i Knowledge. Znajdź wspólny renderer/Preview i dodaj funkcję raz. Jeżeli któryś ekran ma lokalny duplikat Preview, dla ekranów w zakresie podepnij shared implementation bez szerokiego refaktoru reszty aplikacji.

1.6 Nawigacja po ID

Najpierw sprawdź, czy istnieje resolver/nawigacja CpItem.id → aktualny item/address. Użyj istniejącego rozwiązania.

Jeśli go nie ma, dodaj najmniejszy prawidłowy mechanizm przez:

Dashboard → DBA → Content Provider → provider

Nie rób query do DB z Reacta. Zachowaj repo/user permissions i cross-user isolation.

Nieistniejący/niedostępny UUID nie może crashować Preview ani ujawniać cudzych danych.

1.7 Fail-safe parsera

Specjalnie interpretuj wyłącznie prawidłowy UUID związany z następnym elementem listy. Jeśli składnia jest niepełna/niepoprawna, zachowaj dotychczasowe renderowanie. Nie zmieniaj istniejącej semantyki //nagłówków, myślników, tabów, hdr1/hdr2 ani Markdown.

2. Zabezpieczenia v11 — obowiązkowe

Przed pracą przeczytaj nadrzędne instrukcje z ai-docs/begin_here/ i dokumentację wskazaną przez nie.

Na początku:

sprawdź git status, HEAD i working tree;

zrób checkpoint commit PRE-EXISTING zmian, jeżeli zgodnie z instrukcjami repo jest to wymagane, tak aby stan rozpoczęcia pracy był jednoznaczny i można było natychmiast wrócić do niego;

zapamiętaj dokładny commit startowy;

nie nadpisuj ani nie cofaj cudzych zmian;

commituj własne logiczne etapy swobodnie, ale NIE pushuj bez wyraźnej zgody użytkownika;

nie rób szerokich refaktorów „przy okazji";

nie zgaduj struktury repo ani API — najpierw czytaj kod i dokumentację;

używaj istniejących shared components zamiast tworzyć duplikaty;

przy rozbieżności dokumentacja ↔ działający kod ustal źródło prawdy i popraw dokumentację, jeśli jest ewidentnie nieaktualna;

testuj celowanie; nie twórz nadmiarowych raportów, diffów i podsumowań tylko dla formalności;

nie uruchamiaj PROD ani push/deploy bez zgody;

jeśli w working tree pracuje drugi agent, stage/commituj wyłącznie jawnie własne pliki, nigdy git add -A.

3. Analiza i implementacja

Najpierw znajdź rzeczywiste pliki po:

Folders
address:
TextEditorWithToolbar
Preview
hdr1
hdr2
md
CpItem
item.id
GetById

Przeczytaj dokumentację Folders/CP GUI, shared editor/preview, Knowledge i DBA/Content Provider.

Dla ramki porównaj realny widok ze screenshotem i po fixie upewnij się, że itemy pozostały dokładnie w dotychczasowych pozycjach.

Parser CP-link wydziel jako czystą testowalną część shared Preview. Parser nie powinien wykonywać fetchy; powinien oznaczyć tekst + targetCpItemId, a resolver/nawigacja ma być osobną odpowiedzialnością.

4. Testy

Minimum:

[valid UUID]
- tekst
→ tekst linkowany

tab + [valid UUID]
tab + - tekst
→ tekst linkowany

invalid UUID + myślnik
→ brak specjalnego CP-link behavior

UUID bez następnego myślnika
→ fail-safe

dwa kolejne UUID/linki
→ każdy ma własny target

hdr1 bez UUID
→ bez regresji

hdr2 bez UUID
→ bez regresji

md + [UUID]
→ zwykły Markdown, bez CP-link extension

klik linku
→ właściwy CP Item po id

nieistniejący UUID
→ kontrolowany not-found

UUID spoza repo/user
→ brak dostępu

Zweryfikuj wspólny Preview co najmniej w Folders i Knowledge.

Dla Folders sprawdź:

address + item-id;

długie drzewo jak na screenie;

zewnętrzna ramka obejmuje ostatni element;

brak zmiany pozycji itemów;

brak nowego overflow/scrollbara.

Uruchom właściwe unit/component tests, typecheck/build oraz local Docker smoke zgodnie z oficjalnymi skryptami repo.

5. Zakazy

Nie:

przesuwaj itemów przy naprawie ramki;

naprawiaj ramki sztucznym ogromnym min-height;

generuj nowego UUID;

zapisuj address jako target linku;

implementuj parsera osobno w wielu ekranach;

modyfikuj semantyki md;

traktuj każdego [tekst] jako UUID;

rób DB query z komponentu;

obchodź DBA → Content Provider;

osłabiaj permissions;

twórz drugiego shared Preview;

pushuj bez zgody.

6. Kryteria akceptacji

Folders pokazuje item-id: <GUID> pod address.

To prawdziwy CpItem.id.

Ramka obejmuje całe drzewo bez przesunięcia itemów.

[UUID] nad - tekst tworzy link w hdr1 i hdr2.

UUID nie jest widoczny w Preview.

md pozostaje bez zmian.

Link rozwiązuje CP Item po UUID, niezależnie od jego aktualnego address.

Funkcja jest wdrożona we wspólnym Preview.

Działa w Folders i Knowledge.

Brak crasha/leaku dla niedostępnego UUID.

Testy/build/typecheck/local smoke PASS.

Commit zawiera tylko własny zakres.

Brak push.

7. Raport końcowy

Punkt startowy:
Folders item-id:
Folders frame root cause:
Folders frame fix:
Shared Preview:
hdr1/hdr2:
md regression:
CP id resolver/navigation:
Permissions:
Testy:
Local Docker:
Smoke Folders:
Smoke Knowledge:
Commit:
Niewykonane:
Blockery:

Bez wielkiego diffu i zbędnego podsumowania. Szczegóły zapisz w Story.

Screenshot referenced by user: /mnt/data/Screenshot 2026-08-13 at 18.44.57.png (not accessible in this environment — not read).
