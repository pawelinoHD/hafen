# Hafen

Ein Heimserver-OS im Stil von **Umbrel** für deinen **M1-Mac**: eine Startseite mit deinen Apps, ein App Store mit Ein-Klick-Installation, ein Dateimanager, Live-Systemwerte und eine Anmeldung. Darunter läuft jede App als Docker-Container.

Umbrel selbst gibt es nicht für Apple Silicon. Hafen läuft deshalb auf zwei Arten:

| | Direkt auf macOS (empfohlen) | Als eigene VM |
|---|---|---|
| Einrichtung | `bash install.sh` | `bash vm/make-vm.sh` + UTM, siehe [vm/README.md](vm/README.md) |
| Docker | Colima (oder OrbStack/Docker Desktop, falls schon da) | Debian 13 mit nativem Docker |
| Adresse | `http://<dein-mac>.local:8420` | `http://hafen.local` |
| Home Assistant | Geräte-Erkennung eingeschränkt | voll, Host-Netzwerk möglich |

## Neu in Hafen 2.0

- **Backups**: Einstellungen, App-Daten und Speicher als `.tar.gz`, nach Zeitplan und mit Aufbewahrung, Wiederherstellen per Klick
- **Mitteilungen**: Glocke oben rechts. Meldet Installationen, abgestürzte Apps, vollen Speicher und knappen RAM, auf Wunsch als Push aufs Handy (ntfy)
- **Eigene Apps**: im Store über „Eigene App“, per Formular oder aus einem `docker run`-Befehl
- **Freigabe-Links**: Dateien und Ordner per Link teilen, mit Ablaufdatum, Passwort und Download-Limit
- **Papierkorb**: Gelöschtes bleibt 30 Tage wiederherstellbar
- **Verlauf**: CPU, RAM und Netzwerk über 1 Stunde, 24 Stunden und 7 Tage, fürs System und pro App
- **Erweiterungen**: Neue Funktionen sind eigene Module in `lib/features/` und `public/features/`, siehe [FEATURES.md](FEATURES.md)

## Hafen aktualisieren

Ab Hafen 2.1: **Einstellungen → Hafen aktualisieren** und die neue `hafen.zip` auswählen. Hafen prüft die Datei, sichert die laufende Fassung nach `~/hafen-daten/aktualisierung/vorige-fassung` und startet neu. Apps und Daten bleiben erhalten. Im selben Dialog holst du die vorige Fassung mit einem Klick zurück.

Startet Hafen nach einem Update nicht mehr, hilft das Terminal:

```bash
rsync -a --delete ~/hafen-daten/aktualisierung/vorige-fassung/ ~/hafen/ && launchctl kickstart -k gui/$(id -u)/de.hafen.server
```

## Installation auf dem Mac

```bash
cd ~/Downloads/hafen
bash install.sh
```

Das Skript

1. prüft Homebrew und installiert bei Bedarf **Node.js**,
2. nimmt ein laufendes Docker (OrbStack/Docker Desktop) oder installiert **Colima** (schlanke Docker-VM mit Apple-Virtualisierung und Rosetta für x86-Images),
3. kopiert Hafen nach `~/hafen`, die Daten liegen in `~/hafen-daten`,
4. richtet einen **Autostart** ein (LaunchAgent `de.hafen.server`) und öffnet die Oberfläche.

Beim ersten Öffnen legst du Namen und Passwort fest. Danach ist Hafen von jedem Gerät im WLAN erreichbar, auch vom iPhone. Über „Zum Home-Bildschirm“ wird daraus eine App.

**Wichtig:** Damit der Mac als Server taugt, darf er am Netzteil nicht schlafen: `sudo pmset -c sleep 0 disksleep 0`.

## Apps im Store (18)

Jellyfin · Nextcloud · Home Assistant · Pi-hole · Vaultwarden · Uptime Kuma · Syncthing · Open WebUI · Gitea · Navidrome · Audiobookshelf · Paperless-ngx · PhotoPrism · Stirling-PDF · IT-Tools · code-server · qBittorrent · Actual Budget

Alle Images gibt es für arm64. Startpasswörter erzeugt Hafen selbst und zeigt sie auf der App-Seite unter **Zugangsdaten** an.

**KI-Tipp für den M1:** Installiere [Ollama](https://ollama.com) direkt auf dem Mac, nicht im Container. Nur dort nutzt es die GPU (Metal). Open WebUI aus dem Store verbindet sich automatisch.

## Ordner

```
~/hafen-daten/
├── config.json        Anmeldung, Einstellungen (Passwort nur als scrypt-Hash)
├── hafen.log          Server-Protokoll
├── apps/<id>/         docker-compose.yml + .env der installierten App
├── eigene-apps/<id>/  selbst angelegte Store-Apps
├── mitteilungen.json, freigaben.json, verlauf.json
├── data/<id>/         Daten der App (bleiben beim Deinstallieren, außer du wählst „Daten löschen“)
└── storage/           Dein Speicher: Downloads, Medien, Musik, Fotos, Dokumente, Hörbücher
```

Mehrere Apps teilen sich `storage/`: Was qBittorrent nach `Downloads` lädt, kannst du nach `Medien/Filme` schieben, und Jellyfin zeigt es an. Wie bei Umbrel.

## Eigene App hinzufügen

Lege einen Ordner `store/<id>/` mit zwei Dateien an:

- `app.json`: `name`, `tagline`, `description`, `category`, `port`, optional `path`, `icon`, `website`, `extraPorts`, `storageDirs`, `credentials`
- `docker-compose.yml`: Diese Variablen stehen zur Verfügung:

| Variable | Inhalt |
|---|---|
| `APP_PORT` | der Port aus `app.json` |
| `APP_DATA_DIR` | `~/hafen-daten/data/<id>` |
| `APP_PASSWORD` / `APP_SECRET` | zufällig, bleibt über Updates gleich |
| `HAFEN_STORAGE` | der gemeinsame Speicher |
| `HAFEN_HOSTS` / `HAFEN_ORIGINS` | Hostnamen bzw. `http://host:port`-Liste (für Trusted-Domains/CSRF) |
| `TZ`, `PUID`, `PGID` | Zeitzone, Benutzer- und Gruppen-ID |

Der Store liest den Ordner bei jedem Aufruf neu ein. Die App erscheint also sofort, ohne Neustart.

## Ausprobieren ohne Docker

```bash
node server.js --demo     # simuliert Installationen, Daten in ~/hafen-demo
```

## Befehle

```bash
launchctl kickstart -k gui/$(id -u)/de.hafen.server   # Hafen neu starten
tail -f ~/hafen-daten/hafen.log                       # Protokoll
colima status                                         # Docker-VM
bash ~/hafen/uninstall.sh                             # Autostart entfernen
```

Passwort vergessen? `config.json` öffnen, den Block `"user"` löschen, Hafen neu starten. Dann richtest du Namen und Passwort neu ein, und die Apps bleiben erhalten.
