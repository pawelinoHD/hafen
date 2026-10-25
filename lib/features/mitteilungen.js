import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';

export default async function (ctx) {
  // safePath ist auf STORAGE beschränkt. Diese festen internen Dateien gehören laut Schnittstelle nach HOME.
  const datei = path.join(ctx.HOME, 'mitteilungen.json');
  const temp = path.join(ctx.HOME, 'mitteilungen.json.tmp');
  const stufen = { info: 0, ok: 1, warn: 2, error: 3 };
  const gueltig = (s) => Object.hasOwn(stufen, s);
  const kurz = (s, max) => typeof s === 'string' ? s.slice(0, max) : '';
  const log = (e) => ctx.log('Mitteilungen:', e?.message || String(e));
  let liste = [], timer, schreibt = false, schmutzig = false;
  try {
    const daten = JSON.parse(await fs.readFile(datei, 'utf8'));
    if (!Array.isArray(daten)) throw new Error('Die gespeicherten Mitteilungen sind ungültig.');
    liste = daten.filter((m) => m && typeof m.id === 'string' && Number.isFinite(m.zeit) && gueltig(m.stufe)
      && typeof m.titel === 'string' && typeof m.text === 'string')
      .sort((a, b) => b.zeit - a.zeit).slice(0, 200).map((m) => ({
        id: kurz(m.id, 100), zeit: m.zeit, stufe: m.stufe, titel: kurz(m.titel, 240), text: kurz(m.text, 4000),
        ...(typeof m.app === 'string' ? { app: kurz(m.app, 100) } : {}), gelesen: m.gelesen === true,
      }));
  } catch (e) { if (e.code !== 'ENOENT') log(e); }

  function speichern() {
    schmutzig = true;
    if (!timer && !schreibt) timer = setTimeout(schreiben, 1000).unref();
  }
  async function schreiben() {
    timer = null;
    if (schreibt || !schmutzig) return;
    schreibt = true;
    schmutzig = false;
    try {
      await fs.writeFile(temp, JSON.stringify(liste), { mode: 0o600 });
      await fs.rename(temp, datei);
    } catch (e) { schmutzig = true; log(e); }
    finally { schreibt = false; if (schmutzig) speichern(); }
  }
  function einstellungen() {
    const s = ctx.config.mitteilungen || {};
    return { ntfyUrl: typeof s.ntfyUrl === 'string' ? s.ntfyUrl : '',
      thema: typeof s.thema === 'string' ? s.thema : '', abStufe: gueltig(s.abStufe) ? s.abStufe : 'warn' };
  }
  function pruefeEinstellungen(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw ctx.httpError(400, 'Gib gültige Einstellungen an.');
    if (typeof b.ntfyUrl !== 'string' || typeof b.thema !== 'string' || !gueltig(b.abStufe))
      throw ctx.httpError(400, 'Prüfe Adresse, Thema und Stufe.');
    const s = { ntfyUrl: b.ntfyUrl.trim(), thema: b.thema.trim(), abStufe: b.abStufe };
    if (s.thema && !/^[a-zA-Z0-9_-]{1,128}$/.test(s.thema))
      throw ctx.httpError(400, 'Das Thema darf nur Buchstaben, Zahlen, Bindestriche und Unterstriche enthalten (maximal 128 Zeichen).');
    if (s.ntfyUrl) {
      let u;
      try { u = new URL(s.ntfyUrl); } catch { throw ctx.httpError(400, 'Gib eine gültige ntfy-Adresse an.'); }
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || s.ntfyUrl.length > 2048)
        throw ctx.httpError(400, 'Nutze eine HTTP- oder HTTPS-Adresse ohne Zugangsdaten, Suchparameter oder Fragment.');
      if (!s.thema) throw ctx.httpError(400, 'Gib ein Thema für Push-Mitteilungen an.');
      s.ntfyUrl = u.href.replace(/\/+$/, '');
    }
    return s;
  }
  async function push(m, erzwingen = false) {
    try {
      const s = pruefeEinstellungen(einstellungen());
      if (!s.ntfyUrl || !s.thema || (!erzwingen && stufen[m.stufe] < stufen[s.abStufe])) return;
      // MIME-Kodierung erhält Umlaute und verhindert Zeilenumbrüche in HTTP-Kopfzeilen.
      const title = `=?UTF-8?B?${Buffer.from(m.titel).toString('base64')}?=`;
      const res = await fetch(`${s.ntfyUrl}/${s.thema}`, { method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(5000), headers: { Title: title, Priority: m.stufe === 'error' ? '5' : m.stufe === 'warn' ? '4' : '3',
          Tags: { error: 'rotating_light', warn: 'warning', ok: 'white_check_mark', info: 'information_source' }[m.stufe],
          'Content-Type': 'text/plain; charset=utf-8' }, body: m.text || m.titel });
      await res.body?.cancel();
      if (!res.ok) throw new Error(`Push konnte nicht gesendet werden (HTTP ${res.status}).`);
    } catch (e) { log(new Error(`Push konnte nicht gesendet werden: ${e.message}`)); }
  }
  const gleiche = new Map(liste.map((m) => [JSON.stringify([m.stufe, m.titel, m.text, m.app]), m.zeit]));
  function neu(d, test = false) {
    if (!d || !gueltig(d.level) || typeof d.title !== 'string' || !d.title.trim()) return null;
    const m = { id: randomUUID(), zeit: Date.now(), stufe: d.level, titel: kurz(d.title.trim(), 240),
      text: kurz(d.text, 4000), ...(typeof d.app === 'string' ? { app: kurz(d.app, 100) } : {}), gelesen: false };
    const key = JSON.stringify([m.stufe, m.titel, m.text, m.app]);
    for (const [k, zeit] of gleiche) if (m.zeit - zeit >= 600000) gleiche.delete(k);
    if (gleiche.has(key)) { if (test) void push(m, true); return null; }
    gleiche.set(key, m.zeit);
    liste.unshift(m); liste.length = Math.min(liste.length, 200);
    speichern(); void push(m, test);
    return m;
  }
  const aktionen = new Map();
  ctx.events.on('notify', (d) => { try { neu(d); } catch (e) { log(e); } });
  ctx.events.on('job', (j) => {
    try {
      if (!j || typeof j.id !== 'string') return;
      aktionen.set(j.id, Date.now());
      const name = kurz(j.name, 180) || kurz(j.id, 100);
      const fehler = { install: `Installation von ${name}`, uninstall: `Entfernen von ${name}`,
        update: `Aktualisierung von ${name}`, configure: `Übernehmen der Einstellungen von ${name}`,
        start: `Start von ${name}`, stop: `Stoppen von ${name}`, restart: `Neustart von ${name}` };
      const erfolg = { install: `${name} ist installiert`, uninstall: `${name} ist deinstalliert`,
        update: `${name} ist aktualisiert`, configure: `${name}: Einstellungen übernommen` };
      if (j.error && Object.hasOwn(fehler, j.action)) neu({ level: 'error', title: `${fehler[j.action]} fehlgeschlagen`, text: kurz(j.error, 4000), app: j.id });
      else if (!j.error && Object.hasOwn(erfolg, j.action)) neu({ level: 'ok', title: erfolg[j.action], text: '', app: j.id });
    } catch (e) { log(e); }
  });

  let vorher = new Map(), docker, ramFolge = 0, ramGemeldet = false, prueft = false;
  let diskWarn = Math.max(0, ...liste.filter((m) => m.titel === 'Dein Speicher ist fast voll').map((m) => m.zeit));
  let diskError = Math.max(0, ...liste.filter((m) => m.titel === 'Dein Speicher ist kritisch voll').map((m) => m.zeit));
  async function pruefen() {
    if (prueft) return;
    prueft = true;
    try {
      const apps = await ctx.apps.list(), jetzt = Date.now(), erreichbar = ctx.apps.dockerOk;
      if (typeof erreichbar === 'boolean') {
        if (docker !== undefined && docker !== erreichbar) neu({ level: erreichbar ? 'ok' : 'error',
          title: erreichbar ? 'Docker ist wieder erreichbar' : 'Docker ist nicht erreichbar', text: '' });
        docker = erreichbar;
      }
      for (const a of apps) {
        const alt = vorher.get(a.id);
        if (erreichbar && a.installed && alt?.state === 'running' && a.state !== 'running'
          && !a.job?.running && !alt.busy && !aktionen.has(a.id))
          neu({ level: 'warn', title: `${a.name} ist unerwartet gestoppt`, text: 'Prüfe die App und ihre Protokolle.', app: a.id });
      }
      vorher = new Map(apps.map((a) => [a.id, { state: a.state, busy: !!a.job?.running }]));
      aktionen.clear();
      const sys = await ctx.systemInfo();
      const voll = sys.disk?.total > 0 ? sys.disk.used / sys.disk.total : 0;
      if (voll > .97 && jetzt - diskError >= 86400000) {
        diskError = jetzt; neu({ level: 'error', title: 'Dein Speicher ist kritisch voll', text: 'Mehr als 97 % sind belegt. Schaffe freien Speicherplatz.' });
      } else if (voll > .90 && voll <= .97 && jetzt - diskWarn >= 86400000) {
        diskWarn = jetzt; neu({ level: 'warn', title: 'Dein Speicher ist fast voll', text: 'Mehr als 90 % sind belegt. Schaffe freien Speicherplatz.' });
      }
      ramFolge = sys.mem?.total > 0 && sys.mem.used / sys.mem.total > .95 ? ramFolge + 1 : 0;
      if (!ramFolge) ramGemeldet = false;
      if (ramFolge >= 3 && !ramGemeldet) {
        ramGemeldet = true; neu({ level: 'warn', title: 'Dein Arbeitsspeicher ist dauerhaft stark belegt', text: 'Bei drei Prüfungen in Folge waren mehr als 95 % belegt. Prüfe die laufenden Apps.' });
      }
    } catch (e) { log(e); } finally { prueft = false; }
  }
  setTimeout(() => { void pruefen(); setInterval(() => void pruefen(), 60000).unref(); }, 30000).unref();
  async function body(req) {
    const b = await ctx.readJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw ctx.httpError(400, 'Gib ein JSON-Objekt an.');
    return b;
  }
  async function auswahl(req) {
    const b = await body(req);
    if (!Object.hasOwn(b, 'ids')) return null;
    if (!Array.isArray(b.ids) || b.ids.length > 200 || b.ids.some((id) => typeof id !== 'string' || !id || id.length > 100))
      throw ctx.httpError(400, 'Gib höchstens 200 gültige Mitteilungs-IDs an.');
    return new Set(b.ids);
  }
  const ergebnis = () => ({ liste, ungelesen: liste.filter((m) => !m.gelesen).length });
  return { routes: {
    'GET /api/mitteilungen': { fn: async () => ergebnis() },
    'POST /api/mitteilungen/gelesen': { fn: async (req) => {
      const ids = await auswahl(req);
      for (const m of liste) if (!ids || ids.has(m.id)) m.gelesen = true;
      speichern(); return ergebnis();
    } },
    'POST /api/mitteilungen/loeschen': { fn: async (req) => {
      const ids = await auswahl(req); liste = ids ? liste.filter((m) => !ids.has(m.id)) : [];
      speichern(); return ergebnis();
    } },
    'GET /api/mitteilungen/einstellungen': { fn: async () => ({ ...einstellungen(),
      vorschlagThema: `hafen-${randomBytes(8).toString('hex')}`,
      vorschlagUrl: (await ctx.apps.list()).some((a) => a.id === 'ntfy' && a.installed) ? 'http://localhost:8093' : 'https://ntfy.sh' }) },
    'POST /api/mitteilungen/einstellungen': { fn: async (req) => {
      const s = pruefeEinstellungen(await body(req)), alt = ctx.config.mitteilungen;
      ctx.config.mitteilungen = s;
      try { await ctx.saveConfig(); } catch (e) { ctx.config.mitteilungen = alt; throw e; }
      return s;
    } },
    'POST /api/mitteilungen/test': { fn: async (req) => {
      await body(req);
      neu({ level: 'info', title: 'Deine Test-Mitteilung', text: 'Hafen hält Dich auf dem Laufenden. Deine Mitteilungszentrale ist bereit.' }, true);
      return { ok: true };
    } },
  } };
}
