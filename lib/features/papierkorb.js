import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export default async function (ctx) {
  const basis = '.papierkorb';
  let liste = [], bereit = false, kette = Promise.resolve();
  const fehler = (code, text) => { throw ctx.httpError(code, text); };
  const tage = () => [0, 7, 30, 90].includes(ctx.config.papierkorb?.tage) ? ctx.config.papierkorb.tage : 30;
  const vorhanden = async (p) => { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  async function sicher(rel) {
    if (typeof rel !== 'string' || rel.includes('\0') || rel.includes(':')) fehler(400, 'Ungültiger Pfad.');
    const p = ctx.safePath(rel);
    const teile = path.relative(ctx.STORAGE, p).split(path.sep).filter(Boolean);
    for (let i = 0; i <= teile.length; i++) {
      const s = await vorhanden(ctx.safePath(teile.slice(0, i).join('/')));
      if (s?.isSymbolicLink()) fehler(400, 'Symbolische Links werden im Papierkorb nicht unterstützt.');
    }
    return p;
  }
  const relativ = (p) => path.relative(ctx.STORAGE, p).split(path.sep).join('/');
  const ablage = (e) => `${basis}/${e.id}/${e.name}`;
  async function schreiben() {
    const tmp = await sicher(`${basis}/index-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(tmp, JSON.stringify(liste), { flag: 'wx' });
      await fs.rename(tmp, await sicher(`${basis}/index.json`));
    } finally { await fs.rm(tmp, { force: true }).catch(() => {}); }
  }
  async function groesse(rel) {
    let anzahl = 0, summe = 0;
    const stapel = [rel];
    while (stapel.length) {
      if (++anzahl > 100000) fehler(400, 'Der Ordner enthält zu viele Einträge für den Papierkorb (höchstens 100.000).');
      const p = await sicher(stapel.pop()), s = await fs.lstat(p);
      if (s.isDirectory()) {
        const dir = await fs.opendir(p);
        for await (const e of dir) {
          if (anzahl + stapel.length >= 100000) fehler(400, 'Der Ordner enthält zu viele Einträge für den Papierkorb (höchstens 100.000).');
          stapel.push(relativ(path.join(p, e.name)));
        }
      } else if (s.isFile()) summe += s.size;
      else fehler(400, 'Dieser Dateityp wird im Papierkorb nicht unterstützt.');
    }
    return summe;
  }
  async function verschieben(von, nach) {
    try { await fs.rename(von, nach); }
    catch (e) {
      if (e.code !== 'EXDEV') throw e;
      try { await fs.cp(von, nach, { recursive: true, force: false, errorOnExist: true }); }
      catch (x) { await fs.rm(nach, { recursive: true, force: true }).catch(() => {}); throw x; }
      await fs.rm(von, { recursive: true });
    }
  }
  async function entfernen(e) {
    await fs.rm(await sicher(`${basis}/${e.id}`), { recursive: true, force: true });
    liste = liste.filter((x) => x.id !== e.id);
    await schreiben();
  }
  async function abgleichen() {
    const behalten = [];
    for (const e of liste) if (await vorhanden(await sicher(ablage(e)))) behalten.push(e);
    liste = behalten;
    await schreiben();
  }
  async function starten() {
    await fs.mkdir(await sicher(basis), { recursive: true });
    const datei = await sicher(`${basis}/index.json`);
    const inhalt = await vorhanden(datei) ? JSON.parse(await fs.readFile(datei, 'utf8')) : [];
    if (!Array.isArray(inhalt)) fehler(503, 'Der Papierkorb-Index ist beschädigt.');
    liste = inhalt.filter((e) => e && /^[a-f0-9-]{36}$/.test(e.id) && typeof e.name === 'string' && e.name && !/[\\/:]/.test(e.name) && !['.', '..'].includes(e.name) && typeof e.ursprung === 'string' && Number.isFinite(e.geloescht) && Number.isFinite(e.groesse) && e.groesse >= 0 && typeof e.ordner === 'boolean');
    await abgleichen();
    if (!ctx.config.papierkorb || ![0, 7, 30, 90].includes(ctx.config.papierkorb.tage)) {
      ctx.config.papierkorb = { tage: 30 }; await ctx.saveConfig();
    }
    bereit = true;
  }
  function exklusiv(fn) {
    const lauf = kette.then(async () => {
      if (!bereit) await starten();
      return fn();
    });
    kette = lauf.catch(() => {});
    return lauf;
  }
  async function aufraeumen() {
    for (const e of [...liste]) if (Date.now() - e.geloescht >= (tage() || 30) * 86400000) await entfernen(e);
  }
  try { await starten(); await aufraeumen(); }
  catch { ctx.log('Papierkorb: Einrichtung nicht abgeschlossen; beim nächsten Zugriff wird sie erneut versucht.'); }
  setInterval(() => exklusiv(aufraeumen).catch(() => ctx.log('Papierkorb: Automatisches Leeren fehlgeschlagen.')), 3600000).unref();
  function route(fn) {
    return { fn: (req) => exklusiv(async () => {
      try { return await fn(req); }
      catch (e) {
        if (e.status || e.statusCode) throw e;
        if (e.code === 'ENOENT') fehler(404, 'Die Datei oder der Ordner wurde nicht gefunden.');
        ctx.log('Papierkorb: Dateivorgang fehlgeschlagen.');
        fehler(500, 'Der Papierkorb konnte den Vorgang nicht abschließen. Bitte versuche es erneut.');
      }
    }) };
  }
  async function auswahl(req) {
    const b = await ctx.readJson(req);
    if (!Array.isArray(b?.ids) || !b.ids.length || b.ids.length > 1000 || b.ids.some((id) => typeof id !== 'string')) fehler(400, 'Wähle zwischen 1 und 1.000 Einträge aus.');
    const eintraege = [...new Set(b.ids)].map((id) => liste.find((e) => e.id === id));
    if (eintraege.some((e) => !e)) fehler(404, 'Ein ausgewählter Eintrag ist nicht mehr im Papierkorb.');
    return eintraege;
  }
  return { routes: {
    'GET /api/papierkorb': route(async () => {
      await abgleichen();
      return { eintraege: [...liste].sort((a, b) => b.geloescht - a.geloescht), gesamtgroesse: liste.reduce((s, e) => s + e.groesse, 0), tage: tage() };
    }),
    'POST /api/files/delete': route(async (req) => {
      const b = await ctx.readJson(req);
      const p = await sicher(b?.path), rel = relativ(p);
      if (!rel || rel.toLowerCase() === basis) fehler(400, 'Den Speicher-Hauptordner und den Papierkorb selbst kannst du nicht löschen.');
      if (rel.toLowerCase().startsWith(`${basis}/`)) {
        const e = liste.find((x) => rel === `${basis}/${x.id}` || rel === ablage(x) || rel.startsWith(`${ablage(x)}/`));
        if (!e) fehler(400, 'Die Verwaltungsdateien des Papierkorbs kannst du nicht löschen.');
        if (rel === `${basis}/${e.id}` || rel === ablage(e)) await entfernen(e);
        else { await fs.rm(p, { recursive: true }); e.groesse = await groesse(ablage(e)); await schreiben(); }
        return { ok: true, endgueltig: true };
      }
      const s = await fs.lstat(p), umfang = await groesse(rel);
      if (!tage()) { await fs.rm(p, { recursive: true }); return { ok: true, endgueltig: true }; }
      const e = { id: randomUUID(), name: path.basename(p), ursprung: rel, geloescht: Date.now(), groesse: umfang, ordner: s.isDirectory() };
      await fs.mkdir(await sicher(`${basis}/${e.id}`));
      // Der Index wird zuerst gesichert; nach einem Abbruch entfernt der Abgleich fehlende Dateien.
      liste.push(e);
      await schreiben();
      try { await verschieben(p, await sicher(ablage(e))); }
      catch (x) { await abgleichen(); throw x; }
      return { ok: true, id: e.id };
    }),
    'POST /api/papierkorb/wiederherstellen': route(async (req) => {
      const ergebnis = [];
      for (const e of await auswahl(req)) {
        let ziel = await sicher(e.ursprung);
        const rel = relativ(ziel);
        if (!rel || rel.toLowerCase() === basis || rel.toLowerCase().startsWith(`${basis}/`)) fehler(400, 'Der ursprüngliche Ort ist ungültig.');
        const eltern = path.dirname(rel), ext = e.ordner ? '' : path.extname(e.name), stamm = e.name.slice(0, e.name.length - ext.length);
        let nummer = 0;
        while (await vorhanden(ziel)) {
          if (++nummer > 10000) fehler(409, 'Am ursprünglichen Ort sind zu viele gleichnamige Dateien.');
          ziel = await sicher(path.join(eltern, `${stamm} (wiederhergestellt${nummer > 1 ? ` ${nummer}` : ''})${ext}`));
        }
        await fs.mkdir(await sicher(eltern), { recursive: true });
        await verschieben(await sicher(ablage(e)), ziel);
        ergebnis.push({ id: e.id, path: relativ(ziel) });
        await entfernen(e);
      }
      return { ok: true, wiederhergestellt: ergebnis };
    }),
    'POST /api/papierkorb/loeschen': route(async (req) => {
      for (const e of await auswahl(req)) await entfernen(e);
      return { ok: true };
    }),
    'POST /api/papierkorb/leeren': route(async (req) => {
      await ctx.readJson(req);
      for (const e of [...liste]) await entfernen(e);
      return { ok: true };
    }),
    'POST /api/papierkorb/einstellungen': route(async (req) => {
      const b = await ctx.readJson(req);
      if (![0, 7, 30, 90].includes(b?.tage)) fehler(400, 'Wähle Aus, 7, 30 oder 90 Tage.');
      const vorher = ctx.config.papierkorb;
      ctx.config.papierkorb = { tage: b.tage };
      try { await ctx.saveConfig(); } catch (e) { ctx.config.papierkorb = vorher; throw e; }
      return { ok: true, tage: tage() };
    }),
  } };
}
