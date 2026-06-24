#!/usr/bin/env bash
#
# Build the kiosk web bundle, zip it, compute its checksum, and publish it as
# an OTA update via the v0-payment-system-kiosk Next.js repo.
#
# Usage:
#   ./scripts/release-kiosk-ota.sh 1.0.1
#
# Expects sibling repos:
#   ~/projects/Kiosk-Sync-Hub       (this repo)
#   ~/v0-payment-system-kiosk       (Next.js app served at tcpdca.com)
#
# Devices in the field hit https://tcpdca.com/api/kiosk-update/manifest on next
# launch and self-update via @capgo/capacitor-updater.

set -euo pipefail

VERSION="${1-}"
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>   e.g. $0 1.0.1" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KIOSK_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
V0_REPO="${V0_REPO:-$HOME/v0-payment-system-kiosk}"
BASE_URL="${OTA_BASE_URL:-https://tcpdca.com}"

if [ ! -d "$V0_REPO" ]; then
  echo "v0-payment-system-kiosk repo not found at $V0_REPO" >&2
  echo "Set V0_REPO=/path/to/v0-payment-system-kiosk if it lives elsewhere." >&2
  exit 1
fi

BUNDLE_DIR="$V0_REPO/public/kiosk-bundles"
mkdir -p "$BUNDLE_DIR"

echo "==> Building web bundle in $KIOSK_REPO"
cd "$KIOSK_REPO"
npm run build

# Vite build target. Capacitor's webDir in capacitor.config.ts is dist/public.
SRC_DIR="$KIOSK_REPO/dist/public"
if [ ! -d "$SRC_DIR" ]; then
  echo "Expected built bundle at $SRC_DIR — adjust this script for your build output." >&2
  exit 1
fi

ZIP_NAME="kiosk-bundle-v${VERSION}.zip"
TMP_ZIP="$(mktemp -d)/$ZIP_NAME"
echo "==> Zipping bundle → $TMP_ZIP"
(cd "$SRC_DIR" && zip -qr "$TMP_ZIP" .)

CHECKSUM=$(shasum -a 256 "$TMP_ZIP" | awk '{print $1}')
SIZE=$(wc -c < "$TMP_ZIP" | awk '{print $1}')
echo "==> sha256: $CHECKSUM (${SIZE} bytes)"

cp "$TMP_ZIP" "$BUNDLE_DIR/$ZIP_NAME"

cat > "$BUNDLE_DIR/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "url": "${BASE_URL}/kiosk-bundles/${ZIP_NAME}",
  "checksum": "${CHECKSUM}",
  "size": ${SIZE},
  "published_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "==> Wrote $BUNDLE_DIR/manifest.json:"
cat "$BUNDLE_DIR/manifest.json"

echo "==> Done. Next steps (manual):"
echo "    cd $V0_REPO"
echo "    git add public/kiosk-bundles/$ZIP_NAME public/kiosk-bundles/manifest.json"
echo "    git commit -m 'kiosk: publish OTA bundle v${VERSION}'"
echo "    git push"
echo
echo "Once Vercel finishes deploying, kiosks will pick up the new bundle on their next launch."
