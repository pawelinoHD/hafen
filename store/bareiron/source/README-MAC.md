# bareiron auf dem Mac (Apple Silicon / M1)

Umgebaute Fassung von [p2r3/bareiron](https://github.com/p2r3/bareiron) mit zwei Änderungen:

1. **Läuft auf macOS (M1/M2/M3…)**: Build über `cc` (Xcode-Tools), SIGPIPE-Schutz für ältere
   macOS-Versionen, kein 100-%-CPU-Leerlauf, wenn niemand online ist. Strg+C beendet sauber und speichert.
2. **Chunks werden gespeichert**: Jeder erzeugte Chunk liegt als eigene Datei in `world/chunks/`.
   Jede Blockänderung wird direkt in den Chunk geschrieben.
   - Das alte Limit von 20.000 Blockänderungen gibt es nicht mehr (Truhen nutzen für ihren Inhalt weiter die alten Plätze, ca. 1.300 Truhen sind möglich).
   - Gespeichert wird alle 15 s, wenn sich ein Spieler abmeldet, und beim Beenden mit Strg+C.
   - Eine vorhandene `world.bin` vom Original wird beim ersten Start automatisch übernommen.
   - RAM: 80 KB pro Chunk im Speicher, höchstens 2048 Chunks (~160 MB, gemessen 162 MB Spitze),
     einstellbar über `CHUNK_CACHE_SIZE` in `include/globals.h`. Auf der Platte sind es ~4,5 KB pro Chunk.

Außerdem gegenüber dem Original hochgestellt:

| Einstellung | Original | Hier |
|---|---|---|
| Sichtweite (`VIEW_DISTANCE`) | 2 | 6 (13×13 Chunks) |
| Mobs (`MAX_MOBS`) | 16 | 64 |
| Spielerplätze (`MAX_PLAYERS`) | 16 | 32 (auch Offline-Spieler belegen einen Platz) |
| Tick-Takt (`TIME_BETWEEN_TICKS`) | 1 s | 250 ms (4 Ticks/s, flüssigere Mobs) |

Eine `world.bin` mit weniger Spielerplätzen wird beim Start automatisch erweitert.

## Starten

**Doppelklick auf `start.command`.**

- Sind die Xcode Command Line Tools installiert (`xcode-select --install`), wird der Server
  frisch für deinen Mac gebaut.
- Sonst wird die mitgelieferte, fertige Apple-Silicon-Datei `bareiron-mac` benutzt.
- Wenn macOS beim ersten Mal meckert („nicht verifizierter Entwickler"): Rechtsklick auf
  `start.command` → **Öffnen** → **Öffnen**.

Danach in Minecraft **1.21.8** (Vanilla-Client) mit `localhost` verbinden, von anderen
Geräten im WLAN mit der IP des Macs (Systemeinstellungen → WLAN → Details).

Im Terminal geht es auch so:

```bash
./build.sh
```

## Einstellungen

In `include/globals.h` (danach `bareiron` löschen, damit `start.command` neu baut):
Spielmodus, Sichtweite (`VIEW_DISTANCE`), Port, maximale Spielerzahl und so weiter.

Die Welt besteht aus `world.bin` (Spieler und Truhen) und dem Ordner `world/`.
Willst du eine neue Welt, löschst du beides.
