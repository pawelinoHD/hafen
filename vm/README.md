# Hafen als eigene VM (UTM)

Wenn du Hafen lieber als **eigenständiges Betriebssystem** willst, also echtes Linux mit eigenem Netzwerknamen `hafen.local` und Host-Netzwerk für Home Assistant, dann läuft es so in einer UTM-VM. Für die meisten reicht die normale Installation direkt auf dem Mac (`../install.sh`).

## 1. Bausteine erzeugen (auf dem Mac)

```bash
brew install qemu          # nur für qemu-img
cd ~/Downloads/hafen       # oder wo der Hafen-Ordner liegt
bash vm/make-vm.sh         # legt ~/hafen-vm/ an
```

Danach liegen in `~/hafen-vm/`:

- `hafen-disk.qcow2`: Debian 13 (arm64), auf 64 GB vergrößert
- `hafen-seed.iso`: cloud-init, richtet beim ersten Start alles ein

## 2. VM in UTM anlegen

1. UTM öffnen → **+** → **Virtualisieren** → **Andere**
2. Boot-ISO überspringen, **Speicher** 4096 MB oder mehr, **Kerne** 4
3. Laufwerk: Das vorgeschlagene Laufwerk **löschen**, danach **Neu → Importieren** → `hafen-disk.qcow2`
4. Ein zweites Laufwerk hinzufügen: **Neu → Wechseldatenträger (CD/DVD)** → `hafen-seed.iso`
5. **Netzwerk → Modus: Bridged (Erweitert)**. Nur so ist die VM im WLAN als `hafen.local` erreichbar.
6. Speichern und starten

Der erste Start dauert 3–5 Minuten (Updates, Docker, Node). Danach:

- **http://hafen.local** (Port 80)
- Konsole: Benutzer `hafen`, Passwort `hafen`. **Bitte gleich mit `passwd` ändern.**
- Hast du `~/.ssh/id_ed25519.pub`, ist der Schlüssel schon hinterlegt: `ssh hafen@hafen.local`

Das Seed-ISO kannst du nach dem ersten Start wieder aus der VM entfernen.

## Aktualisieren

Hafen-Ordner auf dem Mac aktualisieren, dann:

```bash
COPYFILE_DISABLE=1 tar -czf - --exclude vm --exclude .git . | ssh hafen@hafen.local 'sudo tar -xzf - -C /opt/hafen && sudo systemctl restart hafen'
```
