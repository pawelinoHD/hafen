// App-Verwaltung: Katalog lesen, Apps per `docker compose` installieren und steuern.
// Im Demo-Modus (kein Docker, z. B. zum Testen auf Windows) wird alles nur simuliert.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

// Fehler der Anfrage (falsche Eingabe, Konflikt) – der Server antwortet damit 400 statt 500
const userError = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function createApps({ storeDir, homeDir, storageDir, demo, hosts }) {
  const appsDir = path.join(homeDir, 'apps');
  const dataDir = path.join(homeDir, 'data');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const jobs = new Map();          // id -> { action, log: [], error }
  const demoState = new Map();     // id -> 'running' | 'exited'
  let dockerOk = demo;
  let dockerVersion = demo ? 'Demo' : null;

  // ---------- Katalog ----------
  function catalog() {
    const out = [];
    for (const id of fs.readdirSync(storeDir).sort()) {
      const file = path.join(storeDir, id, 'app.json');
      if (!fs.existsSync(file)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
        out.push({ id, ...meta });
      } catch (e) {
        console.warn(`[store] ${id}/app.json kaputt: ${e.message}`);
      }
    }
    return out;
  }

  const installDir = (id) => path.join(appsDir, id);

  // Alles aus dem Store-Ordner übernehmen (Compose-Datei, ggf. Dockerfile und Hilfsdateien für lokale Builds) –
  // außer der Beschreibung app.json und den Dateien, die Hafen selbst im Installationsordner anlegt
  function copyStoreFiles(id) {
    const skip = new Set(['app.json', '.env', 'settings.json']);
    for (const name of fs.readdirSync(path.join(storeDir, id))) {
      if (skip.has(name)) continue;
      fs.cpSync(path.join(storeDir, id, name), path.join(installDir(id), name), { recursive: true });
    }
  }
  const isInstalled = (id) => fs.existsSync(path.join(installDir(id), '.env'));

  function readEnv(id) {
    const env = {};
    const file = path.join(installDir(id), '.env');
    if (!fs.existsSync(file)) return env;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"(.*)"$|^'(.*)'$/, '$1$2');
    }
    return env;
  }

  // ---------- Einstellungen je App (z. B. VPN-Zugangsdaten), in app.json unter "settings" beschrieben ----------
  const settingsFile = (id) => path.join(installDir(id), 'settings.json');
  function readSettings(id) {
    try { return JSON.parse(fs.readFileSync(settingsFile(id), 'utf8')); } catch { return {}; }
  }
  // Prüft Eingaben gegen die Beschreibung; leere Geheimnis-Felder behalten den alten Wert
  function checkSettings(meta, input = {}, old = {}) {
    const out = {};
    for (const f of meta.settings || []) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(f.key)) continue;
      let v = input[f.key];
      v = v == null ? '' : String(v).trim();
      if (f.secret && v === '' && old[f.key]) v = old[f.key];
      if (v === '' && f.default != null) v = String(f.default);
      if (f.options && v !== '' && !f.options.some((o) => String(o.value) === v)) throw userError(`„${f.label}“: ungültige Auswahl.`);
      // Einfache Anführungszeichen und Steuerzeichen würden die .env-Datei zerbrechen
      if (/['\n\r\0]/.test(v)) throw userError(`„${f.label}“ darf kein einfaches Anführungszeichen und keinen Zeilenumbruch enthalten.`);
      if (v.length > 2000) throw userError(`„${f.label}“ ist zu lang.`);
      out[f.key] = v;
    }
    for (const f of meta.settings || []) {
      const needed = f.required === true || (typeof f.required === 'object' && Object.entries(f.required).every(([k, vals]) => vals.includes(out[k])));
      if (needed && !out[f.key]) throw userError(`Bitte „${f.label}“ ausfüllen.`);
    }
    return out;
  }
  function saveSettings(id, values) {
    fs.writeFileSync(settingsFile(id), JSON.stringify(values, null, 2), { mode: 0o600 });
  }

  // ---------- Docker-Aufrufe ----------
  function run(args, { onLine, cwd } = {}) {
    return new Promise((resolve) => {
      const child = spawn('docker', args, { cwd, env: process.env });
      let out = '';
      const feed = (buf) => {
        const text = buf.toString();
        out += text;
        if (onLine) for (const l of text.split(/\r?\n/)) if (l.trim()) onLine(l);
      };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('error', (e) => resolve({ code: -1, out: e.message }));
      child.on('close', (code) => resolve({ code, out }));
    });
  }

  const compose = (id, args, opts) =>
    run(['compose', '-p', `hafen-${id}`, '--project-directory', installDir(id),
      '--env-file', path.join(installDir(id), '.env'), ...args], { ...opts, cwd: installDir(id) });

  async function checkDocker() {
    if (demo) return true;
    const r = await run(['version', '--format', '{{.Server.Version}}']);
    dockerOk = r.code === 0;
    dockerVersion = dockerOk ? r.out.trim() : null;
    return dockerOk;
  }

  // Zustand aller Hafen-Container in einem einzigen Aufruf
  async function states() {
    const map = new Map();
    if (demo) {
      for (const [id, s] of demoState) map.set(id, s);
      return map;
    }
    if (!dockerOk && !(await checkDocker())) return map;
    const r = await run(['ps', '-a', '--filter', 'label=com.docker.compose.project',
      '--format', '{{.Label "com.docker.compose.project"}}\t{{.State}}']);
    if (r.code !== 0) return map;
    for (const line of r.out.split('\n')) {
      const [project, state] = line.trim().split('\t');
      if (!project?.startsWith('hafen-')) continue;
      const id = project.slice(6);
      // Eine App gilt als laufend, wenn alle ihre Container laufen
      const prev = map.get(id);
      if (!prev || prev === 'running') map.set(id, state);
    }
    return map;
  }

  async function containerStats() {
    const per = {};
    if (demo) {
      for (const [id, s] of demoState) if (s === 'running')
        per[id] = { cpu: Math.random() * 6, mem: 80e6 + Math.random() * 300e6 };
      return per;
    }
    if (!dockerOk) return per;
    const r = await run(['stats', '--no-stream', '--format',
      '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}']);
    if (r.code !== 0) return per;
    for (const line of r.out.split('\n')) {
      const [name, cpu, mem] = line.trim().split('\t');
      if (!name?.startsWith('hafen-')) continue;
      const id = name.slice(6).replace(/-[^-]+-\d+$/, '');
      const e = (per[id] ||= { cpu: 0, mem: 0 });
      e.cpu += parseFloat(cpu) || 0;
      e.mem += parseSize(mem?.split('/')[0]);
    }
    return per;
  }

  // ---------- Hilfsfunktionen ----------
  function portFree(port) {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '0.0.0.0');
    });
  }

  function writeEnv(id, meta) {
    const old = readEnv(id);
    const secret = old.APP_SECRET || crypto.randomBytes(32).toString('hex');
    // Lesbares Passwort, das in der Oberfläche angezeigt wird
    const password = old.APP_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const port = meta.port;
    const origins = hosts().map((h) => `http://${h}:${port}`).join(',');
    const env = {
      APP_ID: id,
      APP_PORT: port,
      APP_DATA_DIR: path.join(dataDir, id),
      APP_SECRET: secret,
      APP_PASSWORD: password,
      HAFEN_STORAGE: storageDir,
      HAFEN_HOSTS: hosts().join(' '),
      HAFEN_ORIGINS: origins,
      TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
      PUID: process.getuid ? process.getuid() : 1000,
      PGID: process.getgid ? process.getgid() : 1000,
    };
    // Eigene Werte in einfachen Anführungszeichen: dort ersetzt Docker Compose kein $ (wichtig für Passwörter)
    const user = Object.entries(readSettings(id)).filter(([k]) => !(k in env));
    const text = [...Object.entries(env).map(([k, v]) => `${k}="${v}"`), ...user.map(([k, v]) => `${k}='${v}'`)].join('\n') + '\n';
    fs.writeFileSync(path.join(installDir(id), '.env'), text, { mode: 0o600 });
    return env;
  }

  // Einen Job im Hintergrund ausführen; Fortschritt per Abfrage sichtbar
  function startJob(id, action, fn) {
    if (jobs.get(id)?.running) throw userError('Für diese App läuft schon eine Aktion.');
    const job = { action, log: [], running: true, error: null, started: Date.now() };
    jobs.set(id, job);
    const log = (l) => { job.log.push(l); if (job.log.length > 400) job.log.shift(); };
    fn(log)
      .catch((e) => { job.error = e.message; log(`Fehler: ${e.message}`); })
      .finally(() => { job.running = false; job.ended = Date.now(); });
    return job;
  }

  async function demoSteps(log, steps) {
    for (const s of steps) { log(s); await new Promise((r) => setTimeout(r, 450)); }
  }

  async function must(promise, what) {
    const r = await promise;
    if (r.code !== 0) throw new Error(`${what} fehlgeschlagen (Code ${r.code}). Details im Protokoll.`);
    return r;
  }

  // Bei einem Fehlschlag die letzten Zeilen jedes Containers ins Protokoll holen –
  // die eigentliche Ursache (z. B. falscher VPN-Schlüssel) steht dort, nicht in der compose-Ausgabe
  async function dumpContainerLogs(id, log) {
    const ps = await compose(id, ['ps', '-a', '--format', '{{.Service}}']);
    const services = [...new Set(ps.out.split('\n').map((s) => s.trim()).filter(Boolean))];
    log('');
    log('──── Letzte Meldungen der Container ────');
    // Je Dienst getrennt, damit klar ist, welche Meldung woher kommt
    for (const s of services) {
      const r = await compose(id, ['logs', '--tail', '40', '--no-color', '--no-log-prefix', s]);
      log(`▸ ${s}`);
      for (const l of r.out.split(/\r?\n/)) if (l.trim()) log(`  ${l}`);
    }
    log('────────────────────────────────────────');
  }

  // ---------- Aktionen ----------
  async function install(id, settings) {
    const meta = catalog().find((a) => a.id === id);
    if (!meta) throw userError('Unbekannte App.');
    if (isInstalled(id)) throw userError('App ist schon installiert.');
    const values = checkSettings(meta, settings);
    if (!demo && !(await checkDocker())) throw userError('Docker läuft nicht.', 503);
    const mine = [meta.port, ...(meta.extraPorts || [])];
    for (const a of catalog()) {
      if (a.id === id || !isInstalled(a.id)) continue;
      const hit = [a.port, ...(a.extraPorts || [])].find((p) => mine.includes(p));
      if (hit) throw userError(`Port ${hit} wird schon von ${a.name} benutzt.`);
    }
    for (const p of [meta.port, ...(meta.extraPorts || [])])
      if (!demo && !(await portFree(p))) throw userError(`Port ${p} ist auf diesem Mac schon belegt.`);

    return startJob(id, 'install', async (log) => {
      fs.mkdirSync(installDir(id), { recursive: true });
      fs.mkdirSync(path.join(dataDir, id), { recursive: true });
      for (const sub of meta.storageDirs || []) fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
      copyStoreFiles(id);
      if (meta.settings) saveSettings(id, values);
      writeEnv(id, meta);
      log(`Installiere ${meta.name} …`);
      if (demo) {
        await demoSteps(log, ['Lade Image …', 'Pull complete', 'Container wird erstellt', 'Container gestartet']);
        demoState.set(id, 'running');
      } else {
        const r = await compose(id, ['up', '-d', '--pull', 'missing', '--remove-orphans'], { onLine: log });
        if (r.code !== 0) {
          await dumpContainerLogs(id, log);
          // Halb installierte Reste wegräumen, damit ein neuer Versuch sauber startet
          await compose(id, ['down', '--remove-orphans']);
          fs.rmSync(path.join(installDir(id), '.env'), { force: true });
          throw new Error(`Installation fehlgeschlagen (Code ${r.code}).`);
        }
      }
      log(`${meta.name} läuft auf Port ${meta.port}.`);
    });
  }

  async function uninstall(id, deleteData) {
    if (!isInstalled(id)) throw userError('App ist nicht installiert.');
    return startJob(id, 'uninstall', async (log) => {
      log('Container werden entfernt …');
      if (demo) { await demoSteps(log, ['Stopping', 'Removed']); demoState.delete(id); }
      else await must(compose(id, ['down', '--remove-orphans', ...(deleteData ? ['-v'] : [])], { onLine: log }), 'Entfernen');
      fs.rmSync(installDir(id), { recursive: true, force: true });
      if (deleteData) {
        fs.rmSync(path.join(dataDir, id), { recursive: true, force: true });
        log('App-Daten gelöscht.');
      }
      log('Deinstalliert.');
    });
  }

  function control(id, action) {
    if (!isInstalled(id)) throw userError('App ist nicht installiert.');
    const labels = { start: 'Starten', stop: 'Stoppen', restart: 'Neustart', update: 'Aktualisieren' };
    if (!labels[action]) throw userError('Unbekannte Aktion.');
    return startJob(id, action, async (log) => {
      log(`${labels[action]} …`);
      if (demo) {
        await demoSteps(log, ['…', 'fertig']);
        demoState.set(id, action === 'stop' ? 'exited' : 'running');
        return;
      }
      if (action === 'update') {
        // Neueste Compose-Datei aus dem Store übernehmen, Images ziehen, neu erstellen
        copyStoreFiles(id);
        const meta = catalog().find((a) => a.id === id);
        if (meta) writeEnv(id, meta);
        // Lokal gebaute Dienste (build:) werden nicht gezogen, sondern ohne Cache neu gebaut – sonst bliebe der alte Quellcode-Stand
        await must(compose(id, ['pull', '--ignore-buildable'], { onLine: log }), 'Pull');
        if (/^\s+build:/m.test(fs.readFileSync(path.join(installDir(id), 'docker-compose.yml'), 'utf8')))
          await must(compose(id, ['build', '--no-cache', '--pull'], { onLine: log }), 'Bauen');
        await must(compose(id, ['up', '-d', '--remove-orphans'], { onLine: log }), 'Neustart');
        await run(['image', 'prune', '-f']);
      } else {
        await must(compose(id, [action], { onLine: log }), labels[action]);
      }
      log('Fertig.');
    });
  }

  // Einstellungen ändern und die App mit den neuen Werten neu erstellen
  function configure(id, settings) {
    if (!isInstalled(id)) throw userError('App ist nicht installiert.');
    const meta = catalog().find((a) => a.id === id);
    if (!meta?.settings) throw userError('Diese App hat keine Einstellungen.');
    const values = checkSettings(meta, settings, readSettings(id));
    return startJob(id, 'configure', async (log) => {
      saveSettings(id, values);
      writeEnv(id, meta);
      log('Einstellungen gespeichert, App wird neu erstellt …');
      if (demo) { await demoSteps(log, ['Recreating', 'Started']); demoState.set(id, 'running'); }
      else {
        const r = await compose(id, ['up', '-d', '--force-recreate', '--remove-orphans'], { onLine: log });
        if (r.code !== 0) { await dumpContainerLogs(id, log); throw new Error(`Neu erstellen fehlgeschlagen (Code ${r.code}).`); }
      }
      log('Fertig.');
    });
  }

  // VPN-Zustand einer Gluetun-App: Gesundheit des Containers + zuletzt gemeldete öffentliche IP aus dem Protokoll
  async function vpnStatus(id) {
    const meta = catalog().find((a) => a.id === id);
    if (!meta?.vpn || !isInstalled(id)) throw userError('Diese App hat kein VPN.');
    if (demo) return { state: 'running', health: 'healthy', ip: '185.65.134.2', where: 'Netherlands, North Holland, Amsterdam', error: null };
    const svc = meta.vpn;
    const ps = await compose(id, ['ps', '-a', '--format', '{{.Service}}\t{{.State}}\t{{.Health}}']);
    const row = ps.out.split('\n').map((l) => l.trim().split('\t')).find((c) => c[0] === svc) || [];
    const lg = await compose(id, ['logs', '--tail', '300', '--no-color', '--no-log-prefix', svc]);
    const ips = [...lg.out.matchAll(/Public IP address is (\S+)(?: \(([^)]*)\))?/g)];
    const last = ips[ips.length - 1];
    // Die letzte Fehlerzeile hilft bei der Suche nach dem Grund
    const errors = lg.out.split(/\r?\n/).filter((l) => /\bERROR\b/.test(l));
    return { state: row[1] || 'missing', health: row[2] || (row[1] === 'running' ? 'starting' : 'none'),
      ip: last?.[1] || null, where: (last?.[2] || '').replace(/\s*-\s*source:.*$/, ''), error: errors[errors.length - 1]?.replace(/^\S+\s+ERROR\s+/, '') || null };
  }

  // Zugangsdaten, die eine App nur in ihr Protokoll schreibt (qBittorrent: Einmal-Passwort je Start).
  // Hat der Nutzer schon ein eigenes Passwort gesetzt (Marker in der Konfigurationsdatei), ist die
  // alte Protokollzeile veraltet – dann wird kein Passwort mehr angezeigt.
  async function logCredentials(id) {
    const meta = catalog().find((a) => a.id === id);
    const lc = meta?.logCredentials;
    if (!lc || !isInstalled(id)) throw userError('Diese App hat keine Zugangsdaten im Protokoll.');
    if (lc.confFile && lc.setMarker) {
      const conf = path.join(dataDir, id, lc.confFile);
      try { if (fs.readFileSync(conf, 'utf8').includes(lc.setMarker)) return { user: lc.user, own: true }; } catch { }
    }
    if (demo) return { user: lc.user, password: 'k3TqX9pRm', own: false };
    const r = await compose(id, ['logs', '--tail', '400', '--no-color', '--no-log-prefix', lc.service]);
    const hits = [...r.out.matchAll(new RegExp(lc.pattern, 'g'))];
    return { user: lc.user, password: hits.length ? hits[hits.length - 1][1] : null, own: false };
  }

  async function logs(id) {
    if (!isInstalled(id)) throw userError('App ist nicht installiert.');
    if (demo) return `[demo] ${id} läuft\n[demo] keine echten Container im Demo-Modus`;
    const r = await compose(id, ['logs', '--tail', '300', '--no-color', '--timestamps']);
    return r.out;
  }

  async function list() {
    const st = await states();
    return catalog().map((a) => {
      const installed = isInstalled(a.id);
      const env = installed ? readEnv(a.id) : {};
      const job = jobs.get(a.id);
      let credentials = null;
      if (installed && a.credentials) {
        credentials = Object.fromEntries(Object.entries(a.credentials)
          .map(([k, v]) => [k, String(v).replace('$APP_PASSWORD', env.APP_PASSWORD || '')]));
      }
      // Geheimnisse nie zurückgeben – nur, ob schon eins hinterlegt ist
      let settingsValues = null;
      if (installed && a.settings) {
        const cur = readSettings(a.id);
        settingsValues = Object.fromEntries((a.settings || []).map((f) => [f.key, f.secret ? (cur[f.key] ? '••••' : '') : (cur[f.key] ?? '')]));
      }
      return {
        ...a,
        installed,
        state: installed ? (st.get(a.id) || 'exited') : null,
        credentials,
        settingsValues,
        job: job ? { action: job.action, running: job.running, error: job.error,
          log: job.log.slice(job.error ? -150 : -30), ended: job.ended } : null,
      };
    });
  }

  return {
    list, install, uninstall, control, configure, vpnStatus, logCredentials, logs, containerStats, checkDocker,
    get dockerOk() { return dockerOk; },
    get dockerVersion() { return dockerVersion; },
    installedIds: () => catalog().filter((a) => isInstalled(a.id)).map((a) => a.id),
  };
}

function parseSize(s) {
  // docker stats liefert z. B. "123.4MiB" oder "1.2GB"
  const m = String(s || '').trim().match(/^([\d.]+)\s*([KMGT]?)(i?)B$/i);
  if (!m) return 0;
  const exp = 'BKMGT'.indexOf((m[2] || 'B').toUpperCase());
  return parseFloat(m[1]) * (m[3] ? 1024 : 1000) ** Math.max(exp, 0);
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}
