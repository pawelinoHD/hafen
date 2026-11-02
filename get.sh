#!/bin/bash
# Hafen mit einem Befehl installieren:
#   curl -fsSL https://raw.githubusercontent.com/pawelinoHD/hafen/main/get.sh | bash
# Lädt die neueste Fassung von GitHub, prüft ihre Prüfsumme und startet install.sh.
set -euo pipefail

BASIS="https://github.com/pawelinoHD/hafen/releases/latest/download"
ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT

echo "==> Lade Hafen …"
curl -fsSL "$BASIS/hafen.zip" -o "$ARBEIT/hafen.zip"
curl -fsSL "$BASIS/hafen.zip.sha256" -o "$ARBEIT/hafen.zip.sha256"

erwartet="$(awk '{print $1}' "$ARBEIT/hafen.zip.sha256")"
tatsaechlich="$(shasum -a 256 "$ARBEIT/hafen.zip" | awk '{print $1}')"
if [ "$erwartet" != "$tatsaechlich" ]; then
  echo "Die Prüfsumme stimmt nicht. Abbruch." >&2
  exit 1
fi

if command -v ditto >/dev/null; then ditto -x -k "$ARBEIT/hafen.zip" "$ARBEIT/inhalt"
else mkdir -p "$ARBEIT/inhalt" && unzip -q "$ARBEIT/hafen.zip" -d "$ARBEIT/inhalt"; fi

bash "$ARBEIT/inhalt/hafen/install.sh"
