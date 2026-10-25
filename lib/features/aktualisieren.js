import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Hafen aus einer hochgeladenen hafen.zip aktualisieren: prüfen, alte Fassung sichern, Code ersetzen, neu starten.
// Die Daten in HOME bleiben unberührt; ersetzt wird nur der Programmordner (ROOT).
export default async function (ctx) {
  const dir = path.join(ctx.HOME, 'aktualisierung');
  const vorher = path.join(dir, 'vorige-fassung');
  const MAX = 100 * 1024 * 1024;
  let laeuft = false;

  const fehler = (status, text) => { throw ctx.httpError(status, text); };
  const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], ...opts });
    let err = '';
    child.stderr.on('data', (c) => { err = (err + c).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} endete mit Code ${code}. ${err.trim()}`)));
  });
  const vorhanden = (p) => fs.stat(p).then(() => true, () => false);
  const version = async (root) => { try { return JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version || null; } catch { return null; } };

  // ditto (macOS), unzip (Linux), bsdtar/tar (Windows, macOS) und Python als letzter Ausweg
  async function entpacken(zip, ziel) {
    const wege = [
      ['ditto', ['-x', '-k', zip, ziel]],
      ['unzip', ['-q', zip, '-d', ziel]],
      ['tar', ['-xf', zip, '-C', ziel]],
      ['python3', ['-m', 'zipfile', '-e', zip, ziel]],
    ];
    for (const [cmd, args] of wege) {
      try { await run(cmd, args); return; }
      catch (e) { ctx.log(`Aktualisierung: ${cmd} konnte nicht entpacken: ${e.message.split('\n')[0]}`); await fs.rm(ziel, { recursive: true, force: true }); await fs.mkdir(ziel); }
    }
    fehler(400, 'Die Zip-Datei konnte nicht entpackt werden. Ist sie vollständig hochgeladen?');
  }

  // Die Zip enthält „hafen/…“ oder direkt die Dateien – beides annehmen
  async function quelleFinden(ziel) {
    const kandidaten = [ziel, ...(await fs.readdir(ziel, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => path.join(ziel, e.name))];
    for (const k of kandidaten) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(k, 'package.json'), 'utf8'));
        if (pkg.name === 'hafen' && await vorhanden(path.join(k, 'server.js')) && await vorhanden(path.join(k, 'public', 'app.js'))) return { quelle: k, version: pkg.version };
      } catch {}
    }
    fehler(400, 'Das ist keine Hafen-Zip. Lade die hafen.zip hoch, die du bekommen hast.');
  }

  // Ordnerinhalt spiegeln: Neues kopieren, Verschwundenes löschen; .git und Nutzerdaten-Ordner bleiben
  async function spiegeln(von, nach) {
    await fs.mkdir(nach, { recursive: true });
    const neu = new Set(await fs.readdir(von));
    for (const name of await fs.readdir(nach)) {
      if (name === '.git' || name === '.codex-test') continue;
      if (!neu.has(name)) await fs.rm(path.join(nach, name), { recursive: true, force: true });
    }
    for (const name of neu) {
      if (name === '.git' || name === '.codex-test') continue;
      const q = path.join(von, name), z = path.join(nach, name);
      const st = await fs.lstat(q);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        const zst = await fs.lstat(z).catch(() => null);
        if (zst && !zst.isDirectory()) await fs.rm(z, { force: true });
        await spiegeln(q, z);
      } else {
        const zst = await fs.lstat(z).catch(() => null);
        if (zst?.isDirectory()) await fs.rm(z, { recursive: true, force: true });
        await fs.copyFile(q, z);
        await fs.chmod(z, st.mode & 0o777).catch(() => {});
      }
    }
  }

  async function neustarten() {
    ctx.log(`Aktualisierung: Hafen startet neu.`);
    // launchd/systemd starten Hafen sofort wieder (KeepAlive bzw. Restart=always)
    setTimeout(() => process.exit(0), 500);
  }

  const exklusiv = async (fn) => {
    if (laeuft) fehler(409, 'Es läuft bereits eine Aktualisierung.');
    laeuft = true;
    try { return await fn(); } finally { laeuft = false; }
  };

  return { routes: {
    'GET /api/aktualisieren': { fn: async () => ({
      version: ctx.VERSION, demo: ctx.DEMO, laeuft,
      vorige: await version(vorher),
    }) },

    'POST /api/aktualisieren': { fn: async (req, res, url) => exklusiv(async () => {
      if (!/^application\/(zip|x-zip-compressed|octet-stream)$/.test(req.headers['content-type'] || '')) fehler(415, 'Bitte eine .zip-Datei hochladen.');
      const aelter = url.searchParams.get('aelter') === '1';
      const arbeit = path.join(dir, `neu-${Date.now()}`);
      await fs.mkdir(arbeit, { recursive: true });
      try {
        const zip = path.join(arbeit, 'hafen.zip'), ziel = path.join(arbeit, 'inhalt');
        let groesse = 0; const out = (await fs.open(zip, 'w'));
        try { for await (const c of req) { groesse += c.length; if (groesse > MAX) fehler(413, 'Die Datei ist größer als 100 MB.'); await out.write(c); } }
        finally { await out.close(); }
        if (!groesse) fehler(400, 'Die Datei ist leer.');
        const kopf = Buffer.alloc(4), fd = await fs.open(zip);
        try { await fd.read(kopf, 0, 4, 0); } finally { await fd.close(); }
        if (!kopf.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) fehler(400, 'Das ist keine gültige Zip-Datei.');
        await fs.mkdir(ziel);
        await entpacken(zip, ziel);
        const { quelle, version: neue } = await quelleFinden(ziel);
        try { await run(process.execPath, ['--check', path.join(quelle, 'server.js')]); }
        catch { fehler(400, 'Diese Fassung enthält Fehler (server.js lässt sich nicht lesen). Hafen bleibt unverändert.'); }
        const cmp = neue.localeCompare(ctx.VERSION, undefined, { numeric: true });
        if (cmp < 0 && !aelter) return { frage: 'aelter', neue, aktuell: ctx.VERSION };
        if (ctx.DEMO) return { ok: true, demo: true, neue, aktuell: ctx.VERSION };
        // Erst die laufende Fassung sichern, dann ersetzen – schlägt das fehl, die Sicherung zurückspielen
        await fs.rm(vorher, { recursive: true, force: true });
        await spiegeln(ctx.ROOT, vorher);
        try { await spiegeln(quelle, ctx.ROOT); }
        catch (e) { await spiegeln(vorher, ctx.ROOT).catch(() => {}); throw new Error(`Die neuen Dateien konnten nicht kopiert werden, die alte Fassung ist wieder da. ${e.message}`); }
        ctx.events.emit('notify', { level: 'ok', title: `Hafen wird auf ${neue} aktualisiert`, text: `Vorher: ${ctx.VERSION}. Die alte Fassung ist gesichert und lässt sich in den Einstellungen zurückholen.` });
        await neustarten();
        return { ok: true, neue, aktuell: ctx.VERSION };
      } finally { await fs.rm(arbeit, { recursive: true, force: true }); }
    }) },

    'POST /api/aktualisieren/zurueck': { fn: async (req) => exklusiv(async () => {
      await ctx.readJson(req);
      const alt = await version(vorher);
      if (!alt) fehler(404, 'Es gibt keine gesicherte vorige Fassung.');
      if (ctx.DEMO) return { ok: true, demo: true, neue: alt };
      const zwischen = path.join(dir, `zurueck-${Date.now()}`);
      try {
        await spiegeln(ctx.ROOT, zwischen);
        await spiegeln(vorher, ctx.ROOT);
        // Die gerade ersetzte Fassung wird zur neuen „vorigen“, so lässt sich auch das wieder umkehren
        await fs.rm(vorher, { recursive: true, force: true });
        await fs.rename(zwischen, vorher);
      } catch (e) { await fs.rm(zwischen, { recursive: true, force: true }); throw e; }
      await neustarten();
      return { ok: true, neue: alt };
    }) },
  } };
}
