# Nginx Proxy Manager — domeny publiczne na QNAP

Status: 2026-07-12. Dokumentuje istniejącą instancję **Nginx Proxy Manager**
(`jc21/nginx-proxy-manager`, kontener `npm` na QNAP s12), jej stan sprzed
migracji na `chad.biz.pl`/`test.chad.biz.pl`, oraz co po niej.

## Instancja NPM — fakty infrastrukturalne

- Kontener `npm`, `restart: unless-stopped`, **`network_mode: host`** — nasłuchuje
  bezpośrednio na portach hosta QNAP (80, 443, panel admina 81), bez
  publikowania portów przez Compose/`docker run -p`.
- Trwałe dane: `/share/qnap/npm/data` (konfiguracja, w tym proxy hosts) i
  `/share/qnap/npm/letsencrypt` (certyfikaty) — bind mounty na hoście, poza
  warstwą kontenera.
- Panel admina: `http://<QNAP-IP>:81` — **celowo nie jest publicznie
  przekierowany** na routerze (tylko port 80/443 są).
- Ponieważ NPM działa w `network_mode: host`, do usług na tym samym hoście
  (np. kontenery Dockera publikujące port na `0.0.0.0`) odwołuje się przez
  `127.0.0.1:<port>` lub LAN IP QNAP-a (`192.168.0.114:<port>`) — **nie**
  przez nazwę kontenera/sieć Docker, bo NPM nie jest podłączony do żadnej
  sieci bridge.

## Stan PRZED migracją (2026-07-12, przed usunięciem czegokolwiek)

Pobrane z realnego API NPM (`GET /api/nginx/proxy-hosts`), nie z samego UI —
UI (widok "Proxy Hosts") nie pokazuje kolumny "Source" bez rozwinięcia
wiersza, co pierwotnie doprowadziło do niejednoznaczności.

| ID | Domena (`domain_names`) | `forward_scheme://forward_host:forward_port` | SSL | Co to jest |
|---|---|---|---|---|
| 1 | `contentprovider.online` | `http://192.168.0.114:5156` | HTTP only (`ssl_forced:false`, `certificate_id:0`) | Stary, samodzielny Content Provider (Blazor `cp_pub_assembly`/`cp2`, niepowiązany z monorepo `chad`) |
| 3 | `ai.contentprovider.online` | `http://127.0.0.1:7050` | HTTP only | Kolejny stary endpoint związany z Content Providerem (port 7050, lokalny) |
| 2 | `jf.contentprovider.online` | `http://192.168.0.114:8096` | HTTP only | **Jellyfin** (domyślny port 8096) — nazwa domeny sugeruje Content Provider, ale to inny, aktywnie używany serwis. **Świadomie NIE usunięty.** |

Wszystkie trzy: `enabled:true`, `access:Public`, brak certyfikatu SSL
(`certificate_id:0`, `ssl_forced:false`) — czysty HTTP.

## Co zadziałało (do wzorowania się przy kolejnych subdomenach)

- Dla usług na tym samym hoście co NPM: `forward_host` = `127.0.0.1` (jeśli
  usługa nasłuchuje tylko lokalnie) albo LAN IP QNAP-a `192.168.0.114`
  (jeśli usługa publikuje port na `0.0.0.0` i jest też dostępna z sieci
  lokalnej) — oba działały stabilnie (`Online`, wpisy sprzed miesięcy nadal
  aktywne).
- `forward_scheme: http` (nie https) do backendu — SSL terminowany tylko na
  NPM, backend nie musi mieć własnego certyfikatu.
- Autoryzacja API NPM: `POST /api/tokens` z `{"identity": "<email>",
  "secret": "<hasło>"}` → token Bearer, ważny do wywołań
  `/api/nginx/proxy-hosts` (GET/POST/DELETE). Dane logowania używane
  wyłącznie doraźnie w pojedynczym wywołaniu — **nigdy nie zapisywane do
  pliku** (ani lokalnie, ani na QNAP).

## Migracja 2026-07-12: chad.biz.pl / test.chad.biz.pl

Wpisy #1 i #3 (faktyczny stary Content Provider) usunięte — zastąpione przez
monorepo `chad` (patrz `shared-qnap-services.md`). Wpis #2 (Jellyfin pod
myląco podobną domeną) pozostawiony bez zmian.

Nowe wpisy:

| Domena | Cel | SSL |
|---|---|---|
| `chad.biz.pl` | `http://127.0.0.1:12030` (chad-dashboard-prod) | Let's Encrypt, Force SSL |
| `test.chad.biz.pl` | `http://127.0.0.1:12020` (chad-dashboard-test) | Let's Encrypt, Force SSL |

Szczegóły procesu, weryfikacji i rollbacku: patrz
`documentation/dashboard/common/features/chad-domain-ssl.md` (do uzupełnienia
po zakończeniu wdrożenia).
