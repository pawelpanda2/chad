# QNAP data path — the `/share` tmpfs trap

Status: naprawione i zwalidowane skryptowo, 2026-07-13.

## Incydent

`chad-mongodb` crash-loopował z WiredTiger panic:

```
WiredTiger error: [...] connection: __log_fs_write, 218:
journal/WiredTigerTmplog.0000000001: fatal log failure: No space left on device
[...] the process must exit and restart: WT_PANIC: WiredTiger library panic
```

Pierwsza diagnoza (`df -h /share`) pokazała `tmpfs 16.0M 100%` i błędnie
zasugerowała "dysk pełny". To było mylące — właściciel słusznie to zakwestionował:
główny wolumen danych (`/share/CACHEDEV1_DATA`, `/dev/mapper/cachedev1`) miał
**4.5TB, 2.9TB wolne, 36% wykorzystania**. Dysk nie był pełny.

## Prawdziwa przyczyna

`.env.qnap` miało `QNAP_CONTAINER_DATA_PATH=/share/ContainerData`.
`/share/ContainerData` to zwykły katalog leżący bezpośrednio na `/share` —
a samo `/share` na tym QNAP-ie jest **16MB tmpfs**, nie punktem montowania
prawdziwego wolumenu. `docker inspect chad-mongodb` potwierdził bind mount:

```
/share/ContainerData/chad-shared/mongodb/db -> /data/db
```

`df -h /share/ContainerData/chad-shared/mongodb/db` pokazywało dokładnie ten
sam tmpfs `16.0M 100%` co samo `/share` — katalog mongo (340K) mieścił się,
ale nie mógł urosnąć ponad ~16MB, więc dziennik WiredTiger (journal) w końcu
się nie zmieścił.

Prawdziwy wolumen danych: `/share/CACHEDEV1_DATA` (potwierdzone
`readlink -f /share/Dropbox` → `/share/CACHEDEV1_DATA/Dropbox`, i właśnie
dlatego Content Provider — który czyta `/share/Dropbox` — był cały czas
zdrowy, mimo że Mongo obok niego padał).

## Naprawa

`.env.qnap` na QNAP-ie:

```diff
-QNAP_CONTAINER_DATA_PATH=/share/ContainerData
+QNAP_CONTAINER_DATA_PATH=/share/CACHEDEV1_DATA/ContainerData
```

Potem `bash bash-scripts/dashboard/06_qnap_ssh/begin_shared.sh` (wymaga
wpisania `SHARED`) — odtwarza `chad-mongodb`/`chad-content-provider-api` pod
nową ścieżką. Dane Mongo na starej ścieżce były puste (340K, świeża baza) —
nic do migrowania.

`.env.qnap.example` (szablon w repo) zaktualizowany na ten sam,
poprawny domyślny wzorzec ścieżki, z komentarzem ostrzegającym o tmpfs.

## Walidacja skryptowa (żeby to się nie powtórzyło po cichu)

`bash-scripts/common/lib.sh`: `require_data_path_writable <path> [min_free_kb]`.

Wywoływane przez `00_qnap_shared/03_restart.sh` na
`$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb` PRZED `docker compose up`:

1. `mkdir -p` — tworzy katalog (i w dalszym kroku podkatalogi
   `db`/`configdb`/`backups`), jeśli nie istnieje.
2. Test zapisu (`touch`/`rm` pliku próbnego) — czytelny błąd, jeśli
   niezapisywalne.
3. `df -Pk <path>` — sprawdza wolne miejsce; **domyślny próg: 1GB
   (1 048 576 KB)**. Poniżej progu: czytelny błąd, exit 1, z bezpośrednim
   odniesieniem do tego dokumentu.
4. `df -PT <path>` — jeśli filesystem to `tmpfs`, **ostrzeżenie** (nie
   twardy błąd — tmpfs bywa też celowym wyborem gdzie indziej), że dane nie
   przetrwają restartu i tmpfs bywa mały.

To jest tripwire na "oczywiście źle skonfigurowaną ścieżkę", nie pełny
planner pojemności — 1GB nie gwarantuje, że starczy miejsca na lata danych,
tylko wyłapuje dokładnie tę klasę błędu (ścieżka na malutkim tmpfs zamiast na
prawdziwym wolumenie).

## Jak zdiagnozować podobny problem w przyszłości

Nie ufaj samemu `df -h /share` — `/share` na QNAP-ie bywa samo w sobie
tmpfs. Zawsze:

```bash
docker inspect <container> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
df -h "<faktyczne Source z powyższego>"
readlink -f "<faktyczne Source>"   # potwierdź, że to nie symlink na coś innego
```

Duży wolumen na tym konkretnym QNAP-ie (s12, `100.117.139.83`) to
`/share/CACHEDEV1_DATA` (`/dev/mapper/cachedev1`). Jeśli kiedykolwiek pojawi
się inny `CACHEDEV*`, potwierdź przez `df -h`, nie zakładaj nazwy.

## Znane ograniczenia

- Próg 1GB jest arbitralny (tripwire, nie capacity planning) — dostosuj
  drugim argumentem `require_data_path_writable`, jeśli kiedyś okaże się za
  niski/wysoki.
- Walidacja dotyczy wyłącznie `QNAP_CONTAINER_DATA_PATH` (Mongo). Nie dodano
  analogicznej walidacji dla `CP_REPOS_HOST_PATH` (Dropbox) — ta ścieżka była
  cały czas zdrowa i nie była źródłem tego incydentu; do rozważenia w
  przyszłości, jeśli kiedykolwiek okaże się problematyczna.
