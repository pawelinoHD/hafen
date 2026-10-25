#!/bin/bash
# Entfernt den Hafen-Autostart und auf Wunsch alle App-Container. Deine Daten in ~/hafen-daten bleiben.
set -uo pipefail
LABEL="de.hafen.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$PLIST"
echo "✓ Hafen-Dienst gestoppt und Autostart entfernt."

read -r -p "Auch alle Hafen-App-Container entfernen? [j/N] " a
if [[ "$a" =~ ^[jJyY]$ ]]; then
  for p in $(docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep '^hafen-' | sort -u); do
    docker compose -p "$p" down --remove-orphans && echo "✓ $p entfernt"
  done
fi
echo "Deine Daten liegen weiterhin in ~/hafen-daten – lösche den Ordner selbst, wenn du sie nicht mehr brauchst."
