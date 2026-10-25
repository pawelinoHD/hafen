import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export default async function (ctx) {
  const defaults = { ziel: '', zeit: '03:00', aktiv: false, behalten: 7, appDaten: true, speicher: false, appsAnhalten: true };
  const namePattern = /^hafen-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
  const parts = ['einstellungen', 'app-daten', 'speicher'];
  const home = await fs.realpath(ctx.HOME);
  let job = null, sizeCache = null, sizePromise = null, restartRequired = false;
  let history = { ergebnisse: [], automatisch: '' };
  const settings = () => ({ ...defaults, ...ctx.config.backup });
  const fail = (text, status = 400) => { throw ctx.httpError(status, text); };
  const inside = (base, p) => { const r = path.relative(base, p); return !r || (!r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r)); };
  // safePath prüft relative Namen; außerhalb von STORAGE ergänzen wir die Basis- und Symlink-Prüfung.
  function at(base, rel) {
    if (typeof rel !== 'string' || /[\x00-\x1f\\:]/.test(rel) || rel.split('/').some(x => x === '..' || x === '.') || path.isAbsolute(rel)) fail('Ungültiger Pfad.');
    ctx.safePath(rel);
    const p = path.resolve(base, rel);
    if (!inside(base, p)) fail('Der Pfad verlässt den erlaubten Ordner.');
    return p;
  }
  const exists = async p => { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  async function regular(p, directory = false) {
    const s = await fs.lstat(p);
    if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile())) fail('Verknüpfungen und besondere Dateien sind hier nicht erlaubt.');
    return s;
  }
  const stateFile = at(home, 'backup.json');
  try { const saved = JSON.parse(await fs.readFile(stateFile, 'utf8')); if (Array.isArray(saved.ergebnisse)) history = saved; } catch {}
  async function persist() { await fs.writeFile(stateFile, JSON.stringify(history, null, 2), { mode: 0o600 }); }
  function notify(level, title, text) { try { ctx.events.emit('notify', { level, title, text }); } catch {} }
  async function target(value, create = false) {
    if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value)) fail('Gib einen absoluten Ziel-Ordner an.');
    const resolved = path.resolve(value);
    if (inside(home, resolved) || inside(resolved, home)) fail('Das Ziel darf weder in deinem Hafen-Datenordner liegen noch diesen enthalten.');
    // Auch bei neuen Unterordnern zuerst alle vorhandenen Vorfahren prüfen.
    let current = path.parse(resolved).root;
    for (const segment of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const stat = await exists(current);
      // Einhängepunkte nie selbst anlegen: Ist die Festplatte nicht da, landete die Sicherung sonst unbemerkt auf der internen Platte.
      const mount = ['/Volumes', '/media', '/mnt'].includes(path.dirname(current)) || path.dirname(path.dirname(current)) === '/run/media';
      if (!stat) { if (!create || mount) fail('Das Sicherungsziel ist nicht erreichbar. Prüfe deine Festplatte.', 503); await fs.mkdir(current); }
      await regular(current, true);
      const real = await fs.realpath(current);
      if (inside(home, real)) fail('Das Sicherungsziel liegt im Hafen-Datenordner.');
    }
    return fs.realpath(resolved);
  }
  function tar(args, collect = false) {
    return new Promise((resolve, reject) => {
      const child = spawn('tar', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
      let output = '', error = '', exceeded = false;
      const timer = setTimeout(() => { exceeded = true; child.kill(); }, 6 * 60 * 60 * 1000); timer.unref();
      child.stdout.on('data', chunk => { if (collect) { output += chunk; if (output.length > 32 * 1024 * 1024) { exceeded = true; child.kill(); } } });
      child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
      child.on('error', () => { clearTimeout(timer); reject(new Error('Das Programm tar konnte nicht gestartet werden.')); });
      child.on('close', code => { clearTimeout(timer); code === 0 && !exceeded ? resolve(output) : reject(new Error(exceeded ? 'Die Archivprüfung oder Laufzeit überschreitet das erlaubte Limit.' : `Das Archiv konnte nicht verarbeitet werden (Code ${code}). ${error}`)); });
    });
  }
  async function storageSize() {
    if (sizeCache && Date.now() - sizeCache.zeit < 300000) return sizeCache;
    if (sizePromise) return sizePromise;
    sizePromise = (async () => {
      let bytes = 0, count = 0, limited = false;
      const walk = async dir => {
        const entries = await fs.opendir(dir);
        for await (const entry of entries) {
          if (++count > 100000) { limited = true; break; }
          const p = at(dir, entry.name), s = await fs.lstat(p);
          if (s.isFile()) bytes += s.size;
          else if (s.isDirectory() && !s.isSymbolicLink()) await walk(p);
          if (limited) break;
        }
      };
      try { const p = ctx.safePath(''); await regular(p, true); await walk(p); sizeCache = { bytes, unvollstaendig: limited, zeit: Date.now() }; }
      catch { sizeCache = { bytes, unvollstaendig: true, zeit: Date.now() }; }
      return sizeCache;
    })().finally(() => { sizePromise = null; });
    return sizePromise;
  }
  async function backups(base) {
    const result = [];
    for (const e of await fs.readdir(base, { withFileTypes: true })) {
      if (!namePattern.test(e.name) || !e.isDirectory() || e.isSymbolicLink()) continue;
      try {
        const dir = at(base, e.name), infoPath = at(dir, 'info.json');
        const st = await regular(infoPath); if (st.size > 65536) continue;
        const info = JSON.parse(await fs.readFile(infoPath, 'utf8'));
        if (!Array.isArray(info.teile) || !info.teile.every(p => parts.includes(p)) || !Number.isFinite(info.zeit)) continue;
        let size = st.size;
        for (const p of info.teile) size += (await regular(at(dir, `${p}.tar.gz`))).size;
        result.push({ name: e.name, datum: info.zeit, groesse: size, teile: info.teile });
      } catch {}
    }
    return result.sort((a, b) => b.datum - a.datum);
  }
  async function selected(base, name) {
    if (typeof name !== 'string' || !namePattern.test(name)) fail('Ungültiger Sicherungsname.');
    const entry = (await backups(base)).find(x => x.name === name);
    if (!entry) fail('Diese vollständige Sicherung wurde nicht gefunden.', 404);
    return entry;
  }
  const pause = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref(); });
  async function waitApp(id, running) {
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      const a = (await ctx.apps.list()).find(x => x.id === id);
      if (!a) throw new Error(`Die App ${id} wurde nicht gefunden.`);
      if (!a.job?.running) {
        if (a.job?.error || (running ? a.state !== 'running' : a.state === 'running')) throw new Error(`Die App ${a.name} konnte nicht ${running ? 'gestartet' : 'angehalten'} werden.`);
        return;
      }
      await pause(400);
    }
    throw new Error(`Die App ${id} antwortet nicht rechtzeitig.`);
  }
  async function withStopped(enabled, work) {
    const stopped = [];
    let problem;
    try {
      if (enabled) {
        const apps = await ctx.apps.list();
        if (apps.some(a => a.job?.running)) fail('Warte, bis die laufenden App-Aktionen abgeschlossen sind.', 409);
        for (const a of apps.filter(a => a.installed && a.state === 'running')) {
          stopped.push(a.id);
          await ctx.apps.control(a.id, 'stop'); await waitApp(a.id, false);
        }
      }
      await work();
    } catch (e) { problem = e; }
    finally {
      for (const id of stopped) {
        try {
          const until = Date.now() + 120000;
          while ((await ctx.apps.list()).find(a => a.id === id)?.job?.running) {
            if (Date.now() >= until) throw new Error('Die vorherige App-Aktion läuft noch.');
            await pause(400);
          }
          await ctx.apps.control(id, 'start'); await waitApp(id, true);
        }
        catch (e) { problem = new Error(`${problem ? problem.message + ' ' : ''}Neustart fehlgeschlagen: ${e.message}`); }
      }
    }
    if (problem) throw problem;
  }
  const step = (schritt, anteil) => { job.schritt = schritt; job.anteil = anteil; };
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function next() {
    const s = settings(); if (!s.aktiv || !s.ziel) return null;
    const d = new Date(), [hour, minute] = s.zeit.split(':').map(Number); d.setHours(hour, minute, 0, 0);
    if (d <= new Date() || history.automatisch === dateKey(d)) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function idle() { if (job) fail('Eine Sicherung oder Wiederherstellung läuft bereits.', 409); if (restartRequired) fail('Starte Hafen nach der Wiederherstellung zuerst neu.', 409); }
  async function launch(art, work) {
    idle(); job = { art, schritt: 'Vorbereiten', anteil: 0, zeit: Date.now() };
    const started = job.zeit;
    void (async () => {
      let error = null;
      try { await work(); } catch (e) { error = e.message || 'Unbekannter Fehler.'; }
      const result = { art, zeit: started, dauer: Date.now() - started, erfolg: !error, fehler: error, neustart: restartRequired };
      history.ergebnisse = [result, ...history.ergebnisse].slice(0, 20);
      try { await persist(); } catch { result.fehler = `${result.fehler || ''} Das Ergebnis konnte nicht gespeichert werden.`; }
      job = null; sizeCache = null;
      notify(error ? 'error' : 'ok', error ? `${art} fehlgeschlagen` : `${art} abgeschlossen`, error || (restartRequired ? 'Starte Hafen neu, damit die wiederhergestellten Einstellungen geladen werden.' : 'Deine Daten sind bereit.'));
    })().catch(() => { job = null; notify('error', 'Backup fehlgeschlagen', 'Der Vorgang wurde unerwartet abgebrochen.'); });
    return { ok: true, gestartet: true, neustart: art === 'Wiederherstellung' && restartRequired };
  }
  async function backup(s) {
    const base = await target(s.ziel), d = new Date();
    const name = `hafen-${dateKey(d)}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    const final = at(base, name), temp = at(base, `${name}_unfertig`);
    if (await exists(final) || await exists(temp)) fail('Für diese Minute gibt es bereits eine Sicherung. Warte bis zur nächsten Minute.', 409);
    await fs.mkdir(temp, { mode: 0o700 });
    const included = [], sizes = {};
    const archive = async (part, entries) => {
      for (const e of entries) { const st = await fs.lstat(at(home, e)); if (st.isSymbolicLink()) fail('Ein zu sichernder Hauptordner ist eine Verknüpfung.'); }
      const file = at(temp, `${part}.tar.gz`);
      await tar(['-czf', file, '-C', home, '--', ...entries]);
      included.push(part); sizes[part] = (await fs.stat(file)).size;
    };
    try {
      step('Einstellungen sichern', .1);
      const entries = (await fs.readdir(home)).filter(n => /\.json$/.test(n) && !/(?:^\.|tmp|temp|temporär)/i.test(n));
      for (const n of ['hintergrund', 'eigene-apps', 'apps']) if (await exists(at(home, n))) entries.push(n);
      await archive('einstellungen', entries);
      if (s.appDaten) {
        step(s.appsAnhalten ? 'Apps kurz anhalten' : 'App-Daten sichern', .3);
        await withStopped(s.appsAnhalten, async () => { step('App-Daten sichern', .4); await fs.mkdir(at(home, 'data'), { recursive: true }); await archive('app-daten', ['data']); });
      }
      if (s.speicher) { step('Speicher-Ordner sichern', .7); await archive('speicher', ['storage']); }
      step('Sicherung abschließen', .9);
      await fs.writeFile(at(temp, 'info.json'), JSON.stringify({ version: ctx.VERSION, zeit: d.getTime(), dauer: Date.now() - d.getTime(), teile: included, groessen: sizes }, null, 2), { mode: 0o600 });
      await fs.rename(temp, final);
      for (const old of (await backups(base)).slice(s.behalten)) await fs.rm(at(base, old.name), { recursive: true });
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  }
  async function restore(base, entry, chosen) {
    const stage = await fs.mkdtemp(at(home, 'backup-wiederherstellung-'));
    const moved = [], installed = [];
    let committed = false;
    try {
      for (const part of chosen) {
        step(`${part === 'einstellungen' ? 'Einstellungen' : part === 'speicher' ? 'Speicher' : 'App-Daten'} prüfen`, .15);
        const archive = at(stage, `${part}.tar.gz`), destination = at(stage, part);
        await fs.copyFile(at(at(base, entry.name), `${part}.tar.gz`), archive);
        const names = (await tar(['-tzf', archive], true)).split(/\r?\n/).filter(Boolean);
        const verbose = (await tar(['-tvzf', archive], true)).split(/\r?\n/).filter(Boolean);
        if (!names.length || verbose.some(line => !/^[-d]/.test(line))) fail('Das Archiv enthält Verknüpfungen oder besondere Dateien und kann nicht sicher wiederhergestellt werden.');
        for (const name of names) {
          const clean = name.replace(/\/$/, ''); at(destination, clean);
          const root = clean.split('/')[0];
          if (part === 'app-daten' ? root !== 'data' : part === 'speicher' ? root !== 'storage' : !(['hintergrund', 'eigene-apps', 'apps'].includes(root) || (clean === root && /^[^.][^/]*\.json$/.test(root)))) fail('Das Archiv enthält einen unerwarteten Pfad.');
        }
        await fs.mkdir(destination);
        await tar(['-xzf', archive, '-C', destination, '--no-same-owner', '--no-same-permissions']);
      }
      await withStopped(true, async () => {
        step('Vorhandene Daten aufbewahren und ersetzen', .6);
        try {
          for (const part of chosen) for (const name of await fs.readdir(at(stage, part))) {
            const dest = at(home, name), old = at(home, `${name}-vor-wiederherstellung`);
            if (await exists(old)) fail(`Der Ordner oder die Datei ${name}-vor-wiederherstellung existiert bereits. Bewahre sie zuerst an einem anderen Ort auf.`);
            if (await exists(dest)) { await fs.rename(dest, old); moved.push([dest, old]); }
            await fs.rename(at(at(stage, part), name), dest); installed.push(dest);
          }
          committed = true;
          if (chosen.includes('einstellungen')) restartRequired = true;
        } catch (e) {
          for (const dest of installed.reverse()) await fs.rm(dest, { recursive: true, force: true });
          for (const [dest, old] of moved.reverse()) await fs.rename(old, dest);
          throw e;
        }
      });
      step('Wiederherstellung abschließen', .95);
      for (const [, old] of moved) await fs.rm(old, { recursive: true, force: true });
    } finally {
      // Nach einem fehlgeschlagenen App-Neustart bleiben die alten Daten zur Sicherheit erhalten.
      await fs.rm(stage, { recursive: true, force: true });
      if (committed && chosen.includes('einstellungen')) restartRequired = true;
    }
  }
  let schedulerBusy = false;
  setInterval(() => {
    if (schedulerBusy || job || restartRequired) return;
    schedulerBusy = true;
    void (async () => {
      const s = settings(), d = new Date(), today = dateKey(d);
      if (!s.aktiv || !s.ziel || history.automatisch === today || `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` < s.zeit) return;
      history.automatisch = today; await persist();
      await launch('Sicherung', () => backup(s));
    })().catch(e => notify('error', 'Automatische Sicherung fehlgeschlagen', e.message)).finally(() => { schedulerBusy = false; });
  }, 60000).unref();
  const route = fn => ({ fn: async (...args) => { try { return await fn(...args); } catch (e) { if (e.status || e.statusCode) throw e; fail(`Der Backup-Vorgang ist fehlgeschlagen: ${e.message}`, 500); } } });
  return { routes: {
    'GET /api/backup': route(async () => {
      const s = settings(); let liste = [], frei = null, zielFehler = null;
      if (s.ziel) try { const base = await target(s.ziel); liste = await backups(base); if (fs.statfs) { const stat = await fs.statfs(base); frei = stat.bavail * stat.bsize; } } catch (e) { zielFehler = e.message; }
      return { einstellungen: s, laufend: job, ergebnisse: history.ergebnisse, naechste: next(), sicherungen: liste, frei, zielFehler, speicherGroesse: await storageSize(), neustart: restartRequired };
    }),
    'POST /api/backup': route(async req => {
      idle(); const b = await ctx.readJson(req);
      if (!b || Array.isArray(b) || typeof b !== 'object' || Object.keys(b).some(k => !(k in defaults))) fail('Ungültige Backup-Einstellungen.');
      const s = { ...settings(), ...b };
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.zeit) || !Number.isInteger(s.behalten) || s.behalten < 1 || s.behalten > 365 || ['aktiv', 'appDaten', 'speicher', 'appsAnhalten'].some(k => typeof s[k] !== 'boolean')) fail('Prüfe Uhrzeit, Anzahl (1–365) und Schalter.');
      if (s.ziel !== '') s.ziel = await target(s.ziel, true); else if (s.aktiv) fail('Wähle zuerst einen Ziel-Ordner.');
      idle(); const previous = ctx.config.backup; ctx.config.backup = s;
      try { await ctx.saveConfig(); } catch (e) { ctx.config.backup = previous; throw e; }
      return { ok: true, einstellungen: s };
    }),
    'POST /api/backup/run': route(async () => { idle(); const s = settings(); if (!s.ziel) fail('Richte zuerst dein Sicherungsziel ein.'); return launch('Sicherung', () => backup(s)); }),
    'POST /api/backup/delete': route(async req => {
      idle(); const b = await ctx.readJson(req), base = await target(settings().ziel); const entry = await selected(base, b?.name);
      idle(); job = { art: 'Löschen', schritt: 'Sicherung löschen', anteil: 0, zeit: Date.now() };
      try { await fs.rm(at(base, entry.name), { recursive: true }); return { ok: true }; } finally { job = null; }
    }),
    'POST /api/backup/restore': route(async req => {
      idle(); const b = await ctx.readJson(req);
      if (b?.bestaetigt !== true || !Array.isArray(b.teile) || !b.teile.length || new Set(b.teile).size !== b.teile.length || b.teile.some(p => !parts.includes(p))) fail('Bestätige die Wiederherstellung und wähle gültige Teile aus.');
      const base = await target(settings().ziel), entry = await selected(base, b.name);
      if (b.teile.some(p => !entry.teile.includes(p))) fail('Diese Teile sind in der Sicherung nicht enthalten.');
      const result = await launch('Wiederherstellung', () => restore(base, entry, b.teile));
      return { ...result, neustart: b.teile.includes('einstellungen'), hinweis: b.teile.includes('einstellungen') ? 'Starte Hafen nach erfolgreicher Wiederherstellung neu.' : 'Die Wiederherstellung läuft im Hintergrund.' };
    }),
  } };
}
