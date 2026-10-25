#!/bin/bash
# Baut alles für eine eigenständige Hafen-VM in UTM (Debian 13 arm64):
#   hafen-disk.qcow2  – Systemplatte (Debian Cloud-Image, auf 64 GB vergrößert)
#   hafen-seed.iso    – cloud-init: richtet Docker, Node, Avahi und Hafen beim ersten Start ein
# Läuft auf macOS. Danach in UTM importieren, siehe vm/README.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="${1:-$HOME/hafen-vm}"
IMG_URL="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-arm64.qcow2"
DISK_GB="${HAFEN_VM_DISK:-64}"

command -v qemu-img >/dev/null || { echo "qemu-img fehlt: brew install qemu"; exit 1; }
mkdir -p "$OUT/seed"

if [[ ! -f "$OUT/hafen-disk.qcow2" ]]; then
  echo "==> Lade Debian-13-Cloud-Image (arm64) …"
  curl -fL --progress-bar -o "$OUT/debian.qcow2" "$IMG_URL"
  mv "$OUT/debian.qcow2" "$OUT/hafen-disk.qcow2"
  qemu-img resize "$OUT/hafen-disk.qcow2" "${DISK_GB}G"
else
  echo "==> hafen-disk.qcow2 existiert schon – wird wiederverwendet."
fi

echo "==> Packe Hafen …"
# COPYFILE_DISABLE: keine macOS-„._“-Begleitdateien ins Archiv
COPYFILE_DISABLE=1 tar -czf "$OUT/seed/hafen.tar.gz" -C "$ROOT" --exclude vm --exclude .git .

cp "$HERE/user-data.yaml" "$OUT/seed/user-data"
printf 'instance-id: hafen-%s\nlocal-hostname: hafen\n' "$(date +%s)" > "$OUT/seed/meta-data"

# Optional: eigenen SSH-Schlüssel hinterlegen
if [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
  KEY="$(cat "$HOME/.ssh/id_ed25519.pub")" perl -pi -e \
    's|# SSH_KEY_PLATZHALTER|ssh_authorized_keys:\n      - $ENV{KEY}|' "$OUT/seed/user-data"
fi

echo "==> Baue Seed-ISO …"
rm -f "$OUT/hafen-seed.iso"
hdiutil makehybrid -quiet -o "$OUT/hafen-seed.iso" -iso -joliet -default-volume-name cidata "$OUT/seed"

echo
echo "✓ Fertig in $OUT"
echo "  Weiter in UTM: siehe $HERE/README.md"
