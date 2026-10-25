import fs from 'node:fs';
import path from 'node:path';

const MINUTE = 60000, WOCHE = 7 * 86400000, LIMIT = 10080;
const zahl = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export default async function (ctx) {
  // safePath ist auf STORAGE beschränkt; diese festen internen Dateinamen liegen laut Schnittstelle in HOME.
  const datei = path.join(ctx.HOME, 'verlauf.json');
  const temporaer = path.join(ctx.HOME, 'verlauf.json.tmp');
  const ring = new Array(LIMIT);
  let start = 0, anzahl = 0, misst = false;
  const alle = () => Array.from({ length: anzahl }, (_, i) => ring[(start + i) % LIMIT]);
  function add(p) {
    if (anzahl < LIMIT) ring[(start + anzahl++) % LIMIT] = p;
    else { ring[start] = p; start = (start + 1) % LIMIT; }
  }
  try {
    const daten = JSON.parse(await fs.promises.readFile(datei, 'utf8'));
    if (daten.version !== 1 || !Array.isArray(daten.punkte)) throw new Error('Ungültiger Verlauf');
    let letzte = 0;
    for (const p of daten.punkte.slice(-LIMIT)) {
      if (!Array.isArray(p) || p.length !== 9 || zahl(p[0]) === null || p[0] <= letzte ||
          p.slice(1, 8).some(v => v !== null && zahl(v) === null) || !Array.isArray(p[8]) ||
          p[8].some(a => !Array.isArray(a) || a.length !== 3 || typeof a[0] !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,100}$/.test(a[0]) || a.slice(1).some(v => v !== null && zahl(v) === null))) {
        throw new Error('Ungültige Messwerte');
      }
      letzte = p[0];
      if (p[0] >= Date.now() - WOCHE && p[0] <= Date.now()) add(p);
    }
  } catch (e) {
    start = anzahl = 0; ring.fill(undefined);
    if (e.code !== 'ENOENT') ctx.log('Verlauf: Gespeicherte Messwerte konnten nicht geladen werden.');
  }
  function speichern() {
    try {
      // Synchron, damit auch ein nachfolgender Beenden-Handler keine halbe Datei hinterlässt.
      fs.writeFileSync(temporaer, JSON.stringify({ version: 1, punkte: alle().filter(p => p[0] >= Date.now() - WOCHE) }), { mode: 0o600 });
      fs.renameSync(temporaer, datei);
    } catch { ctx.log('Verlauf: Messwerte konnten nicht gespeichert werden.'); }
  }
  async function messen() {
    if (misst) return;
    misst = true;
    try {
      const sys = await ctx.systemInfo(), installiert = await ctx.apps.list();
      const apps = installiert.filter(a => a.installed).flatMap(a => {
        const s = Object.hasOwn(sys.apps || {}, a.id) ? sys.apps[a.id] : null;
        return s && (zahl(s.cpu) !== null || zahl(s.mem) !== null) ? [[a.id, zahl(s.cpu), zahl(s.mem)]] : [];
      });
      add([Date.now(), zahl(sys.cpu), zahl(sys.mem?.used), zahl(sys.mem?.total),
        zahl(sys.disk?.used), zahl(sys.disk?.total), zahl(sys.net?.rx), zahl(sys.net?.tx), apps]);
    } catch { ctx.log('Verlauf: Diese Messung ist fehlgeschlagen.'); }
    finally { misst = false; }
  }
  setTimeout(() => { void messen(); setInterval(messen, MINUTE).unref(); }, 5000).unref();
  setInterval(speichern, 10 * MINUTE).unref();
  process.on('SIGTERM', speichern);
  process.on('SIGINT', speichern);

  return { routes: { 'GET /api/verlauf': { fn: async (req, res, url) => {
    const bereich = url.searchParams.get('bereich') ?? '1h', app = url.searchParams.get('app');
    const dauern = { '1h': 3600000, '24h': 86400000, '7d': WOCHE };
    if (!Object.hasOwn(dauern, bereich) || url.searchParams.getAll('bereich').length > 1 || url.searchParams.getAll('app').length > 1)
      throw ctx.httpError(400, 'Wähle 1h, 24h oder 7d als Bereich.');
    if (app !== null) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(app)) throw ctx.httpError(400, 'Die App-Kennung ist ungültig.');
      if (!(await ctx.apps.list()).some(a => a.id === app && a.installed)) throw ctx.httpError(404, 'Diese App ist nicht installiert.');
    }
    const bis = Date.now(), von = bis - dauern[bereich];
    const count = Math.min(240, dauern[bereich] / MINUTE), breite = dauern[bereich] / count;
    const fenster = Array.from({ length: count }, () => []);
    const luecken = new Set();
    let vorher;
    for (const p of alle()) {
      if (vorher && p[0] - vorher[0] > 90000) {
        const mitte = (vorher[0] + p[0]) / 2;
        if (mitte >= von && mitte <= bis) luecken.add(Math.min(count - 1, Math.floor((mitte - von) / breite)));
      }
      if (p[0] >= von && p[0] <= bis) fenster[Math.min(count - 1, Math.floor((p[0] - von) / breite))].push(p);
      vorher = p;
    }
    const punkte = fenster.map((ps, i) => {
      const t = von + (i + 0.5) * breite;
      const werte = ps.map(p => app === null ? p.slice(1, 8) : (p[8].find(a => a[0] === app)?.slice(1) || [null, null]));
      // Auch eine kurze Ausfallzeit innerhalb eines großen Fensters unterbricht die Linie.
      const luecke = luecken.has(i) || ps.some((p, j) => j > 0 && p[0] - ps[j - 1][0] > 90000);
      const mittel = k => {
        const vs = werte.map(w => w[k]).filter(v => v !== null);
        return !luecke && vs.length && vs.length === werte.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      };
      const cpus = werte.map(w => w[0]).filter(v => v !== null);
      const p = { t, cpu: mittel(0), cpuMax: !luecke && cpus.length && cpus.length === werte.length ? Math.max(...cpus) : null, ram: mittel(1) };
      return app === null ? { ...p, ramGesamt: mittel(2), disk: mittel(3), rx: mittel(5), tx: mittel(6) } : p;
    });
    return { punkte, von, bis };
  } } } };
}
