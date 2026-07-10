# Docker Images - Git Commit Tracking

## Cel

Dodajemy informacje o commicie Git do obrazów Docker, aby:

1. **Śledzenie wersji** - każdy obraz ma powiązanie z konkretnym commitem w repozytorium
2. **Debugowanie** - można łatwo zidentyfikować, która wersja kodu jest w obrazie
3. **Reprodukowalność** - można odtworzyć build z konkretnego commita
4. **Automatyzacja** - CI/CD może automatycznie tagować obrazy na podstawie commita

## Docker Labels

Każdy obraz Docker otrzymuje standardowe OCI labels:

| Label | Opis | Przykład |
|-------|------|----------|
| `org.opencontainers.image.revision` | Pełny hash commita Git | `a1b2c3d4e5f6...` |
| `org.opencontainers.image.created` | Data buildu w ISO 8601 | `2026-06-16T18:00:00Z` |
| `org.opencontainers.image.source` | URL repozytorium | `git@github.com:user/repo.git` |
| `content-provider.git.short` | Skrócony hash commita | `a1b2c3d` |

## Sprawdzenie informacji o obrazie

### Pełne labelki:
```bash
docker inspect cp_webapi:260616_200307 \
  --format '{{ json .Config.Labels }}'
```

### Tylko commit:
```bash
docker inspect cp_webapi:260616_200307 \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

### Skrócony commit:
```bash
docker inspect cp_webapi:260616_200307 \
  --format '{{ index .Config.Labels "content-provider.git.short" }}'
```

### Data buildu:
```bash
docker inspect cp_webapi:260616_200307 \
  --format '{{ index .Config.Labels "org.opencontainers.image.created" }}'
```

## Powiązanie tagu z commitem

Tag obrazu w formacie `YYMMDD_HHMMSS` (np. `260616_200307`) wskazuje **kiedy** obraz został zbudowany, natomiast labelki OCI wskazują **z którego commita** został zbudowany.

Przykład:
- Tag: `260616_200307` → build 16 czerwca 2026, godz. 20:03:07
- Label `org.opencontainers.image.revision`: `79be8e01a2e493fb741844ae4e1bfd01a9b1d777` → konkretny commit

Dzięki temu:
1. Można znaleźć obraz po dacie buildu (tag)
2. Można sprawdzić, która wersja kodu jest w środku (label)
3. Można odtworzyć build z konkretnego commita

## Workflow

```bash
# 1. Build (automatycznie dodaje informacje o commicie)
./03_scripts/03_local-mac_docker/01_image_webapi.sh

# 2. Sprawdź informacje o obrazie
docker inspect cp_webapi:260616_200307 --format '{{ json .Config.Labels }}'

# 3. Push na Docker Hub
./03_scripts/11_push_dockerhub/push_webapi.sh 260616_200307

# 4. Na produkcji można sprawdzić wersję
docker pull pawelfluder/cp_webapi:260616_200307
docker inspect pawelfluder/cp_webapi:260616_200307 \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

## Implementacja

### Build args przekazywane do Docker:
```bash
--build-arg GIT_COMMIT=$(git rev-parse HEAD)
--build-arg GIT_COMMIT_SHORT=$(git rev-parse --short HEAD)
--build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
--build-arg GIT_REMOTE_URL=$(git config --get remote.origin.url || echo "unknown")
```

### Dockerfile otrzymuje:
```dockerfile
ARG GIT_COMMIT=unknown
ARG GIT_COMMIT_SHORT=unknown
ARG BUILD_DATE=unknown
ARG GIT_REMOTE_URL=unknown

LABEL org.opencontainers.image.revision=$GIT_COMMIT
LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.source=$GIT_REMOTE_URL
LABEL content-provider.git.short=$GIT_COMMIT_SHORT