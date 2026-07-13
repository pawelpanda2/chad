# chad.biz.pl / test.chad.biz.pl — domena i SSL przez istniejący Nginx Proxy Manager

Status: wdrożone i zweryfikowane 2026-07-11/12 na realnym QNAP (s12,
`193.43.242.55` / Tailscale `100.117.139.83`).

## 1. Architektura

```
Internet
  │
  ▼
DNS (home.pl): chad.biz.pl, test.chad.biz.pl → A → 193.43.242.55
  │
  ▼
Router: port forwarding 80→QNAP, 443→QNAP (QuFirewall na QNAP musiało
        dopuścić te porty — pierwotny problem był właśnie w QuFirewall,
        nie w samym routerze)
  │
  ▼
QNAP: kontener `npm` (jc21/nginx-proxy-manager), network_mode: host,
      nasłuchuje bezpośrednio na 80/443 (panel admina 81, NIE przekierowany
      publicznie — dostępny tylko lokalnie / przez Tailscale)
  │
  ├─ chad.biz.pl      → SNI routing → forward_host=127.0.0.1:12030 → chad-dashboard-prod
  └─ test.chad.biz.pl → SNI routing → forward_host=127.0.0.1:12020 → chad-dashboard-test
```

NPM łączy się z dashboardami przez `127.0.0.1:<port>`, nie przez nazwę
kontenera/sieć Docker `chad-shared` — bo `npm` działa w `network_mode: host`
i nie jest podłączony do żadnej sieci bridge Dockera. To odróżnia go od
`chad-dashboard-test`/`chad-dashboard-prod`, które komunikują się z
`chad-content-provider-api` przez `container_name` w sieci `chad-shared`
(patrz `documentation/ai-docs/deploy/shared-qnap-services.md`) — dwa różne mechanizmy sieciowe
współistniejące na tym samym hoście.

## 2. Mapowanie domen na kontenery

| Domena | Cel (forward) | Kontener | Certyfikat Let's Encrypt |
|---|---|---|---|
| `chad.biz.pl` | `http://127.0.0.1:12030` | `chad-dashboard-prod` | id=2, `CN=chad.biz.pl`, ważny do 2026-10-09 |
| `test.chad.biz.pl` | `http://127.0.0.1:12020` | `chad-dashboard-test` | id=3, `CN=test.chad.biz.pl`, ważny do 2026-10-09 |

Oba proxy hosts: `ssl_forced: true` (wymuszone przekierowanie HTTP→HTTPS),
`allow_websocket_upgrade: true`, `http2_support: true`.

## 3. Lokalizacja konfiguracji NPM i danych Let's Encrypt

- Konfiguracja proxy hosts / certyfikatów: `/share/qnap/npm/data` (bind mount
  na hoście QNAP, poza warstwą kontenera `npm`).
- Certyfikaty Let's Encrypt: `/share/qnap/npm/letsencrypt` (bind mount).
- Panel admina: `http://<QNAP-LAN-IP>:81` lub `http://100.117.139.83:81`
  (Tailscale) — **nigdy nie przekierowany publicznie**.
- Repo `chad` **nie zawiera** żadnej konfiguracji Nginx/Certbot dla tego —
  celowo, bo NPM już istniał i obsługuje to sam (patrz uzasadnienie w
  rozmowie: budowa drugiego, równoległego stosu Nginx+Certbot była
  pierwotnym, zbyt szerokim pomysłem, odrzuconym po odkryciu istniejącego
  NPM).

## 4. Pierwsze wygenerowanie certyfikatów — dokładna sekwencja, która zadziałała

NPM w wersji **2.13.5** (starsza niż najnowsza 2.15.1 dostępna jako update)
ma inny schemat API niż powszechnie udokumentowany w internecie — konkretnie
`POST /api/nginx/certificates` **odrzuca** `meta.letsencrypt_email` i
`meta.letsencrypt_agree` jako nieznane właściwości
(`data/meta must NOT have additional properties`). Zweryfikowany, działający
payload dla tej wersji:

```bash
POST /api/nginx/certificates
{
  "provider": "letsencrypt",
  "nice_name": "chad.biz.pl",
  "domain_names": ["chad.biz.pl"],
  "meta": { "dns_challenge": false }
}
```

(bez `letsencrypt_email`/`letsencrypt_agree` — ta wersja NPM najwyraźniej
przyjmuje e-mail administratora/ToS niejawnie). Kolejność, jaka faktycznie
zadziałała:

1. Utworzenie proxy hosta **bez SSL** (`certificate_id: 0, ssl_forced:
   false`) — weryfikacja, że routing HTTP działa (`curl` → HTTP 307 z
   dashboardu) **zanim** poproszono o certyfikat.
2. Weryfikacja DNS (3 niezależne resolvery: `8.8.8.8`, `1.1.1.1`,
   `dns.home.pl`) i zewnętrznej dostępności portu 80 (`curl --resolve`).
3. `POST /api/nginx/certificates` (payload wyżej) — NPM sam obsługuje
   `/.well-known/acme-challenge/` wewnętrznie, nie trzeba niczego
   dodatkowo konfigurować.
4. `PUT /api/nginx/proxy-hosts/<id>` z `certificate_id` z kroku 3 i
   `ssl_forced: true`.
5. Weryfikacja: HTTPS (`curl --resolve ... https://`), przekierowanie
   HTTP→HTTPS (`301` → `Location: https://...`), łańcuch certyfikatu
   (`openssl s_client ... | openssl x509 -noout -subject -issuer -dates`).

Zrobione osobno dla każdej domeny (najpierw `chad.biz.pl`, potwierdzone
działające, dopiero potem `test.chad.biz.pl`) — świadomie, żeby nie
wystrzelić dwóch prób jednocześnie w razie błędu i nie ryzykować limitu
Let's Encrypt.

## 5. Automatyczne odnawianie

NPM ma wbudowany, wewnętrzny mechanizm odnawiania certyfikatów Let's
Encrypt (cron wewnątrz kontenera `npm`) — nie wymaga osobnego `certbot
renew` ani zewnętrznego crona. Nic dodatkowego nie trzeba konfigurować.
Certyfikaty ważne 90 dni od wystawienia (do 2026-10-09), NPM standardowo
próbuje odnowić ok. 30 dni przed wygaśnięciem.

**Nie zweryfikowano w tej sesji:** `certbot renew --dry-run` nie ma
bezpośredniego odpowiednika w API NPM 2.13.5 (nie znaleziono endpointu do
wymuszenia symulacji odnowienia). Weryfikacja faktycznego odnowienia zostaje
do sprawdzenia bliżej daty wygaśnięcia (np. przez `openssl s_client ...
-dates` we wrześniu 2026) albo przez logi kontenera `npm`
(`docker logs npm`).

## 6. Diagnostyka

| Sprawdzenie | Komenda |
|---|---|
| DNS | `dig +short @8.8.8.8 chad.biz.pl A` (i `test.chad.biz.pl`) |
| Port 80 zewnętrznie | `curl -s -o /dev/null -w '%{http_code}' --resolve chad.biz.pl:80:193.43.242.55 http://chad.biz.pl` |
| Port 443 zewnętrznie | `curl -sk -o /dev/null -w '%{http_code}' --resolve chad.biz.pl:443:193.43.242.55 https://chad.biz.pl` |
| Łańcuch certyfikatu | `openssl s_client -connect 193.43.242.55:443 -servername chad.biz.pl \| openssl x509 -noout -subject -issuer -dates` |
| Lista proxy hosts (przez API) | `POST /api/tokens` → `GET /api/nginx/proxy-hosts` z tokenem Bearer |
| Logi NPM | `docker logs npm` (na QNAP) |
| Czy backend żyje niezależnie od NPM | `curl http://localhost:12030` / `:12020` bezpośrednio na QNAP |

**Typowa pułapka odkryta w tej sesji:** lokalny DNS cache na urządzeniu
klienckim (Mac/telefon) może przez chwilę pokazywać `ERR_NAME_NOT_RESOLVED`
mimo poprawnych rekordów na serwerach DNS — zawsze weryfikuj przez
`dig @8.8.8.8`/`@1.1.1.1` (publiczne resolwery) zamiast ufać lokalnemu
cache przeglądarki/systemu.

## 7. Procedura przywrócenia po awarii

- Konfiguracja NPM (proxy hosts, certyfikaty) żyje w
  `/share/qnap/npm/data` i `/share/qnap/npm/letsencrypt` na hoście QNAP —
  przetrwa restart/usunięcie kontenera `npm` (bind mount, nie warstwa
  kontenera). `docker restart npm` lub odtworzenie kontenera z tymi samymi
  mountami przywraca pełny stan bez ponownego generowania certyfikatów.
- Jeśli trzeba odtworzyć proxy host ręcznie: dane w tabeli w sekcji 2 +
  sekwencja z sekcji 4.
- Jeśli padnie DNS/port forwarding: dashboardy nadal działają bezpośrednio
  po IP:port (`http://193.43.242.55:12020`/`:12030` — o ile router
  przekierowuje też te porty, albo lokalnie/przez Tailscale
  `100.117.139.83:12020`/`:12030`) — SSL/domena to warstwa dodatkowa, nie
  jedyny punkt dostępu.
- Certyfikaty wygasają 2026-10-09 — jeśli auto-renewal zawiedzie, ręczne
  odnowienie to powtórzenie kroku 3-4 z sekcji 4 (nowy `POST
  /api/nginx/certificates` + `PUT` z nowym `certificate_id`).

## 8. Jak dodać kolejną subdomenę

1. Dodaj rekord A w home.pl: `<subdomena>.chad.biz.pl → 193.43.242.55`.
2. Poczekaj na propagację (`dig +short @8.8.8.8 <subdomena>.chad.biz.pl A`).
3. `POST /api/nginx/proxy-hosts` (login przez `POST /api/tokens` jak w
   sekcji 4) — najpierw **bez** SSL (`certificate_id: 0, ssl_forced:
   false`), zweryfikuj routing HTTP.
4. `POST /api/nginx/certificates` z minimalnym payloadem (sekcja 4).
5. `PUT /api/nginx/proxy-hosts/<id>` z nowym `certificate_id`, `ssl_forced:
   true`.
6. Zweryfikuj HTTPS + redirect + łańcuch certyfikatu (sekcja 6).

Dane logowania do API NPM (e-mail/hasło administratora) **nigdy nie są
zapisywane w żadnym pliku** — używane wyłącznie doraźnie, w pojedynczym
wywołaniu `POST /api/tokens` do uzyskania tokenu Bearer.

## 9. Legacy — porządkowanie starych wpisów

Przy okazji tej migracji usunięto dwa nieaktualne wpisy Content Providera
(`contentprovider.online`, `ai.contentprovider.online`) z NPM — pełny opis
stanu sprzed zmiany i uzasadnienie w
`documentation/dashboard/common/features/nginx-proxy-manager-domains.md`.
Wpis `jf.contentprovider.online` (Jellyfin, myląca nazwa domeny) świadomie
pozostawiony bez zmian.

## 10. Znane ograniczenia

- `certbot renew --dry-run` nie zweryfikowany (brak bezpośredniego
  odpowiednika w API tej wersji NPM) — patrz sekcja 5.
- Restart całego stosu QNAP (reboot urządzenia) nie został przetestowany w
  tej sesji — `restart: unless-stopped` na kontenerze `npm` powinno
  zapewnić auto-start, ale nie potwierdzone realnym rebootem QNAP-a.
- Panel admina NPM (`:81`) pozostaje dostępny lokalnie/przez Tailscale —
  świadoma decyzja, nie błąd.
