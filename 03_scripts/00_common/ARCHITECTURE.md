# Docker Architecture Detection

## Overview

Scripts in `03_local-mac_docker/` now automatically detect the system architecture and build Docker images natively, without QEMU emulation.

## Problem

On Apple Silicon (M1/M2/M3) Macs, the previous scripts forced `--platform linux/amd64`, which caused Docker to use QEMU emulation. This led to:
- Segmentation faults after some time
- Slower performance
- Unstable containers

## Solution

The `detect_arch.sh` script automatically detects the processor architecture:

| Processor | Detected Platform | Docker Build |
|-----------|------------------|--------------|
| Apple Silicon (M1/M2/M3) | `linux/arm64` | Native ARM64 |
| Intel Mac | `linux/amd64` | Native AMD64 |
| x86_64 Linux | `linux/amd64` | Native AMD64 |
| ARM64 Linux | `linux/arm64` | Native ARM64 |

## Files Changed

1. **`00_common/detect_arch.sh`** (NEW)
   - Detects architecture using `uname -m`
   - Returns appropriate Docker platform string

2. **`03_local-mac_docker/01_image_api_charp.sh`** (MODIFIED)
   - Now uses detected platform instead of hardcoded `linux/amd64`

3. **`03_local-mac_docker/03_image_blazor.sh`** (MODIFIED)
   - Now uses detected platform instead of hardcoded `linux/amd64`

## Testing

### Verify Architecture Detection

```bash
cd content-provider/03_scripts
./00_common/detect_arch.sh
# Should output: linux/arm64 (on Apple Silicon)
# Should output: linux/amd64 (on Intel Mac)
```

### Build and Verify Image

```bash
# Build the image
./03_local-mac_docker/01_image_api_charp.sh

# Check the image architecture
docker image inspect cp_webapi:$(docker images cp_webapi --format "{{.Tag}}" | head -1) --format '{{.Architecture}}'
# Should show: arm64 (on Apple Silicon)

# Run the container
./03_local-mac_docker/02_run_api_charp.sh

# Test health endpoint
curl http://localhost:12024/health

# Test invoke endpoint
curl -X POST http://localhost:12024/invoke \
  -H "Content-Type: application/json" \
  -d '["IRepoService","IMethodWorker","GetAllReposNames"]'
```

### Verify No QEMU (Native ARM64)

After starting the container, verify it's running natively:

```bash
# Get container name
CONTAINER=$(docker ps --format "{{.Names}}" | grep cp_api_csharp)

# Check container architecture via docker inspect
docker inspect --format='{{.Architecture}}' $CONTAINER
# Should show: arm64 (on Apple Silicon)

# Check architecture inside container
docker exec $CONTAINER uname -m
# Should show: aarch64 (on Apple Silicon)
# If it shows x86_64, QEMU emulation is being used (BAD!)
```

Expected results on Apple Silicon:
- `docker inspect` shows: `arm64`
- `docker exec ... uname -m` shows: `aarch64`

If you see `amd64` or `x86_64`, the image was built for the wrong architecture.

## QNAP Compatibility

The scripts maintain compatibility with QNAP (which typically uses x86_64 processors). The architecture detection works the same way on all platforms.

## Why Not Use `linux/amd64` Always?

Using `linux/amd64` on Apple Silicon forces Docker to use QEMU emulation, which:
1. Is significantly slower (can be 5-10x slower)
2. Can cause segmentation faults in .NET applications
3. Consumes more memory
4. Is unnecessary when native ARM64 builds work perfectly

The only reason to use `linux/amd64` on Apple Silicon is when:
- Deploying to an x86_64 server
- The application has ARM64 compatibility issues

For local development on Apple Silicon, always use native `linux/arm64`.