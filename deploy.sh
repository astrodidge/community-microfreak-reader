#!/usr/bin/env bash
# Build the React app and rsync the output to Strato.
# Live URL: https://innospiring.de/microfreak-reader/
#
# SSH alias `strato` → ssh.strato.de (configured in ~/.ssh/config).
# Target dir is WP-innospiring/microfreak-reader/, NOT htdocs root —
# innospiring.de is mapped to WP-innospiring/ at Strato's panel level.
#
# Usage:
#   ./deploy.sh              # build + deploy
#   ./deploy.sh --dry-run    # build + show what rsync would transfer
#   ./deploy.sh --skip-build # rsync the existing build/ as-is

set -euo pipefail
cd "$(dirname "$0")"

DRY_RUN=""
SKIP_BUILD=""
for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN="--dry-run" ;;
        --skip-build) SKIP_BUILD=1 ;;
        *) echo "Unknown flag: $arg" >&2; exit 1 ;;
    esac
done

if [ -z "$SKIP_BUILD" ]; then
    echo "==> Building (NODE_OPTIONS=--openssl-legacy-provider)..."
    NODE_OPTIONS=--openssl-legacy-provider npm run build
fi

if [ ! -d build ]; then
    echo "build/ not found — run without --skip-build first." >&2
    exit 1
fi

echo "==> rsync build/ -> strato:WP-innospiring/microfreak-reader/ ${DRY_RUN:+(dry run)}"
rsync -avz $DRY_RUN --exclude='.DS_Store' build/ strato:WP-innospiring/microfreak-reader/

if [ -z "$DRY_RUN" ]; then
    echo "==> Done. https://innospiring.de/microfreak-reader/"
fi
