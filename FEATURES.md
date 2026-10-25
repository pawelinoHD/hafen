# Hafen-Erweiterungen

Neue Funktionen kommen als **eigene Dateien** dazu, nicht in `server.js` oder `public/app.js`:

| Teil | Datei | Wird geladen |
|---|---|---|
| Server | `lib/features/<name>.js` | beim Start von `server.js`, alphabetisch |
| Oberfläche | `public/features/<name>.js` | vor dem Aufbau der Oberfläche, als ES-Modul |

Regeln:
- **Keine npm-Pakete.** Nur Node ≥ 20 (ESM, `node:`-Module) und im Browser nur das, was `window.Hafen` bietet.
- **Alle Texte und Kommentare auf Deutsch**, kurz und konkret, im Ton der übrigen Oberfläche (Du-Form).
- Eine Erweiterung darf Hafen nie lahmlegen: Fehler abfangen, sinnvolle Fehlermeldungen (`ctx.httpError(400, 'Klartext')`).
- Daten einer Erweiterung liegen in `path.join(ctx.HOME, '<name>.json')` (oder in `ctx.config.<name>` + `ctx.saveConfig()`).
- **Demo-Modus** (`ctx.DEMO === true`, z. B. Windows ohne Docker): Alles muss funktionieren oder sinnvoll simuliert werden.
- Läuft auf **macOS (Apple Silicon)** und **Linux**; im Demo auch unter Windows. Shell-Befehle nur, wenn sie auf allen dreien gleich funktionieren (`tar` ja, `du`/`rsync` nein).

## Server: `lib/features/<name>.js`

```js
export default async function (ctx) {
  // Einmalige Einrichtung, Timer (setInterval(...).unref()), Ereignis-Abos …
  return {
    routes: {
      'GET /api/beispiel': { fn: async (req, res, url) => ({ ok: true }) },          // Antwort wird als JSON gesendet
      'POST /api/beispiel': { fn: async (req) => { const body = await ctx.readJson(req); return { ok: true }; } },
      'GET /api/oeffentlich': { open: true, fn: async () => ({}) },                   // ohne Anmeldung
    },
    // Für alles außer JSON (öffentliche Seiten, Datei-Streams). true zurückgeben = erledigt.
    async handle(req, res, url, authed) { return false; },
  };
}
```

Routen ohne `open: true` verlangen eine Anmeldung. Gleichnamige eingebaute Routen werden **überschrieben**.

### `ctx`

| Feld | Bedeutung |
|---|---|
| `ROOT`, `HOME`, `STORAGE`, `CUSTOM_STORE` | Programmordner, Datenordner (`~/hafen-daten`), Speicher (`HOME/storage`), Ordner für eigene Apps (`HOME/eigene-apps`) |
| `DEMO`, `PORT`, `VERSION` | Demo-Modus, Port der Oberfläche, Hafen-Version |
| `config`, `saveConfig()` | gemeinsame Einstellungen (`HOME/config.json`) |
| `apps` | `list()` → alle Apps mit `{ id, name, port, category, installed, state, job, … }`; `control(id, 'start'\|'stop'\|'restart'\|'update')`; `install(id, settings)`; `uninstall(id, deleteData)`; `logs(id)`; `dockerOk` |
| `events` | `EventEmitter`. **`'job'`**: `{ id, name, action, error }` nach jeder App-Aktion. **`'notify'`**: `{ level: 'info'\|'ok'\|'warn'\|'error', title, text, app? }` – jede Erweiterung darf so eine Mitteilung auslösen |
| `systemInfo()` | `{ cpu, cores, mem: {total, used}, disk: {total, used}, net: {rx, tx} \| null, uptime, apps: { id: {cpu, mem} } }` |
| `hosts()`, `hostName()` | Adressen, unter denen Hafen erreichbar ist |
| `httpError(status, text)` | Fehler mit HTTP-Status werfen |
| `readJson(req)` | JSON-Körper lesen (max. 1 MB, verlangt `Content-Type: application/json`) |
| `send(res, status, body, headers?)` | Antwort senden (Objekt → JSON, Text → text/plain) |
| `safePath(rel)` | relativen Pfad im Speicher auflösen; wirft bei Ausbruch aus `STORAGE` |
| `sendInline(req, res, file, type)` | Datei mit Range-Unterstützung senden |
| `MEDIA_EXT` | Dateiendung → MIME-Typ |
| `log(...)` | Ausgabe ins Hafen-Protokoll |

## Oberfläche: `public/features/<name>.js`

Ein ES-Modul ohne Exporte; es meldet sich bei `window.Hafen` an:

```js
const { h, api, toast, dialog, icon } = window.Hafen;
Hafen.addSettingsItem((sys) => ({ tab: 'system', ic: 'info', title: 'Beispiel', desc: 'Kurz erklärt', onclick: () => go('#/beispiel') }));
```

### Bausteine

| Name | Zweck |
|---|---|
| `h(tag, attrs, ...kinder)` | Element bauen. `attrs`: `class`, `style`, `onclick` …, `html` (nur für eigenes SVG!). Kinder dürfen Arrays, `null`, `false` sein |
| `api(pfad, body?)` | `fetch` → JSON. Mit `body` als POST. Wirft `Error(text)` bei Fehlern |
| `toast(text, fehler?)` | kurze Meldung oben |
| `dialog(titel, text, { confirm, danger, extra, onConfirm, cancel, wide })` | Dialog; `extra` = Element(e); ohne `onConfirm` nur „Schließen“. Gibt das Element zurück |
| `field(label, element, hilfe?)` | beschriftetes Formularfeld (in `h('div', { class: 'wform' }, …)` stapeln) |
| `check(label, wert)` → `{ el, get() }`, `choice([[wert, label]…], wert)` → `{ el, get() }` | Kontrollkästchen, Segmentschalter |
| `icon(name, extraAttr?)`, `icons` | Strich-Symbole (`icons` = Pfaddaten, eigene dürfen ergänzt werden: `Hafen.icons.meins = '<path …/>'`) |
| `md(text)` | Markdown sicher als Element |
| `appIcon(app, größe?)`, `dockArt(key, größe)`, `LOGO` | App-Symbol, Dock-Symbol, Anker-SVG |
| `openMenu(x, y, [{ label, fn, danger }, '-', …])`, `closeMenu()` | Kontextmenü |
| `fmtBytes(n)`, `fmtDate(ms)`, `relTime(ms)`, `de(zahl, stellen)`, `pct(a, b)` | Formatierung (deutsch) |
| `state` | Zustand: `state.apps`, `state.system`, `state.status` (Name, Demo …) |
| `update()` | Oberfläche neu abgleichen (nach eigenen Zustandsänderungen aufrufen) |
| `go('#/fenster')`, `route()` | Navigation |
| `cd(pfad)`, `reloadFiles()` | Dateien-Fenster: Ordner öffnen / neu laden |
| `poll()` | Apps und Systemwerte sofort neu abfragen |
| `control(app, aktion)`, `install(app)`, `appUrl(app)`, `isBusy(app)` | App-Aktionen |
| `css(text)` | eigenes CSS einfügen (Klassen mit Präfix der Erweiterung, z. B. `.bk-…`) |

### Andockpunkte

| Aufruf | Wirkung |
|---|---|
| `registerWindow(key, { title, dockSvg, render(args), onOpen?(), hidden? })` | Eigenes Fenster unter `#/key` (Argumente: `#/key/a/b` → `['a','b']`). Ohne `hidden` erscheint es im Dock und in der Suche. `dockSvg`: SVG-Text mit `viewBox="0 0 52 52"`, abgerundetes Quadrat (`rx="13"`) mit Farbverlauf und weißem Symbol – wie die eingebauten |
| `addSettingsItem(fn(sys))` | Eintrag in den Einstellungen: `{ tab: 'konto'\|'system', ic, title, desc, onclick?, right? }` |
| `addFileMenuItem(fn(eintrag, relPfad, neuLaden))` | Punkt im ⋯-Menü einer Datei: `{ label, fn, danger? }` oder `null` |
| `addFilesSideItem({ label, icon?(), onClick, active?() })` | Eintrag in der Seitenleiste von „Dateien“ |
| `addAppMenuItem(fn(app))` | Punkt im Menü einer App: `{ label, fn, danger? }` oder `null` |
| `addUsageSection(fn(sys))` | Element unter der App-Liste in „Live-Nutzung“ |
| `addStoreAction({ label, icon?(), onClick })` | Knopf oben im App Store |
| `addOverlay(fn)` | Element, das einmal fest über der Startseite liegt (z. B. eine Glocke). `fn` wird bei jedem Aufbau der Oberfläche aufgerufen |
| `onPoll(fn)` | nach jeder Abfrage (alle 1–4 s) – für teure Abfragen selbst drosseln |
| `setDeleteHint(fn(eintrag))` | Text im Löschen-Dialog von „Dateien“ |

### Wichtig: Abgleich statt Neuzeichnen
`render()` eines Fensters und die `fn` von `addUsageSection`/`addSettingsItem` werden **bei jeder Abfrage erneut** aufgerufen; Hafen gleicht das Ergebnis mit dem DOM ab (`patch`). Deshalb:
- Ausgabe nur aus Zustand ableiten (Modul-Variablen), nach Änderungen `Hafen.update()` aufrufen.
- Für Bereiche mit eigenem Innenleben (Diagramme mit Mauszeiger, Eingabefelder) dem äußeren Element `data-keep="<eindeutig>"` geben: Hafen lässt es dann unangetastet, die Erweiterung aktualisiert es selbst.
- Ereignis-Handler (`onclick` …) werden beim Abgleich nicht verglichen – nur Tag, Attribute und Text.

### Vorhandene CSS-Klassen
`btn` (`ghost`, `small`, `big`, `danger`), `input`, `search`, `seg` (Knöpfe mit `on`), `icon-btn`, `dot` (`running`, `exited`, `busy`), `bar` > `i` (Breite per `style`), `win-body`, `win-title`, `split` > `side` (mit `nav-item`) + `main`, `panel`, `box` (+ `h4`), `kv` (`dt`/`dd`), `cred` (Wert zum Kopieren), `log`, `empty` (+ `b`), `wform` (+ `f`), `chk`, `ucard`, `ulist` > `urow`, `muted`.
Farben: Text `var(--text)`, `var(--text-2)`, `var(--text-3)`; Linien `var(--line)`, `var(--line-2)`; Akzent `var(--brand)`, `var(--brand-hi)`; `var(--ok)`, `var(--bad)`, `var(--warn)`; Schrift `var(--font)`, `var(--mono)`.

## Testen

```bash
HAFEN_PORT=8431 HAFEN_HOME=/tmp/hafen-test node server.js --demo
```
Erster Aufruf: `POST /api/setup {"name":"Test","password":"testtest"}` legt die Anmeldung an (Cookie merken).
