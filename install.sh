#!/bin/bash
# Hafen-Installer für macOS (Apple Silicon).
# Richtet Node, Docker (Colima) und einen Autostart-Dienst ein. Kann beliebig oft erneut laufen.
set -euo pipefail

APP_DIR="$HOME/hafen"
DATA_DIR="$HOME/hafen-daten"
LABEL="de.hafen.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${HAFEN_PORT:-8420}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

blau()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
gruen() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
gelb()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fehler(){ printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fehler "Dieses Skript ist für macOS. Für Linux/VM siehe vm/README.md."
[[ "$(uname -m)" == "arm64" ]] || gelb "Kein Apple-Silicon-Mac erkannt – Hafen läuft trotzdem, ist aber auf arm64 abgestimmt."

# ---------- Homebrew ----------
if ! command -v brew >/dev/null; then
  [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
fi
if ! command -v brew >/dev/null; then
  fehler "Homebrew fehlt. Installiere es zuerst mit:
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
und starte dieses Skript danach erneut."
fi
BREW_PREFIX="$(brew --prefix)"
gruen "Homebrew gefunden ($BREW_PREFIX)"

# ---------- Node ----------
NODE_OK=0
if command -v node >/dev/null; then
  [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]] && NODE_OK=1
fi
if [[ $NODE_OK -eq 0 ]]; then
  blau "Installiere Node.js …"
  brew install node
fi
NODE_BIN="$(command -v node)"
gruen "Node $("$NODE_BIN" --version)"

# ---------- Docker ----------
# Läuft schon OrbStack oder Docker Desktop, wird das benutzt. Sonst Colima (schlank, kostenlos).
if docker info >/dev/null 2>&1; then
  gruen "Docker läuft bereits ($(docker info --format '{{.OperatingSystem}}' 2>/dev/null))"
else
  blau "Installiere Colima + Docker-CLI …"
  brew install colima docker docker-compose
  # brew legt das compose-Plugin außerhalb des Standardpfads ab
  mkdir -p "$HOME/.docker"
  CFG="$HOME/.docker/config.json"
  [[ -f "$CFG" ]] || echo '{}' > "$CFG"
  if ! grep -q cliPluginsExtraDirs "$CFG"; then
    "$NODE_BIN" -e '
      const fs = require("fs"), f = process.argv[1];
      const c = JSON.parse(fs.readFileSync(f, "utf8") || "{}");
      c.cliPluginsExtraDirs = [...new Set([...(c.cliPluginsExtraDirs || []), process.argv[2] + "/lib/docker/cli-plugins"])];
      fs.writeFileSync(f, JSON.stringify(c, null, 2));' "$CFG" "$BREW_PREFIX"
  fi

  # Ressourcen: halber RAM (max. 8 GB), alle Kerne bis auf zwei
  MEM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 / 2 )); (( MEM_GB > 8 )) && MEM_GB=8; (( MEM_GB < 2 )) && MEM_GB=2
  CPUS=$(( $(sysctl -n hw.ncpu) - 2 )); (( CPUS < 2 )) && CPUS=2
  blau "Starte Colima ($CPUS Kerne, $MEM_GB GB RAM) …"
  colima start --vm-type vz --vz-rosetta --mount-type virtiofs \
    --cpu "$CPUS" --memory "$MEM_GB" --disk 100 \
    --mount "$DATA_DIR:w" || colima start
  # Colima beim Anmelden automatisch starten
  brew services start colima >/dev/null 2>&1 || gelb "Colima-Autostart konnte nicht eingerichtet werden (brew services)."
  docker info >/dev/null 2>&1 || fehler "Docker antwortet nicht. Prüfe mit: colima status"
  gruen "Docker läuft über Colima"
fi
docker compose version >/dev/null 2>&1 || fehler "„docker compose“ fehlt. Bitte: brew install docker-compose"

# ---------- Hafen-Dateien ----------
mkdir -p "$DATA_DIR"
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  blau "Kopiere Hafen nach $APP_DIR …"
  mkdir -p "$APP_DIR"
  rsync -a --delete --exclude '.git' "$SRC_DIR/" "$APP_DIR/"
fi
gruen "Hafen liegt in $APP_DIR, Daten in $DATA_DIR"

# ---------- Autostart (LaunchAgent) ----------
blau "Richte Autostart ein …"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$APP_DIR/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$BREW_PREFIX/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HAFEN_HOME</key><string>$DATA_DIR</string>
    <key>HAFEN_PORT</key><string>$PORT</string>
  </dict>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DATA_DIR/hafen.log</string>
  <key>StandardErrorPath</key><string>$DATA_DIR/hafen.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"

# Warten, bis der Server antwortet
for _ in {1..20}; do
  curl -fs "http://localhost:$PORT/api/status" >/dev/null && break
  sleep 0.5
done
curl -fs "http://localhost:$PORT/api/status" >/dev/null || fehler "Hafen startet nicht. Log: $DATA_DIR/hafen.log"

HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
echo
gruen "Hafen läuft!"
echo
echo "   Auf diesem Mac:   http://localhost:$PORT"
echo "   Im Heimnetz:      http://$HOST.local:$PORT"
echo
echo "   Damit Hafen rund um die Uhr erreichbar ist, sollte der Mac am Netzteil nicht schlafen:"
echo "   sudo pmset -c sleep 0 disksleep 0     (oder: Systemeinstellungen → Energie)"
echo
open "http://localhost:$PORT" 2>/dev/null || true
