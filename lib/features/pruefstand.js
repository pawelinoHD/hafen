// Prüfstand: installiert Apps in echtem Docker, wartet auf eine Antwort und räumt wieder auf.
// So steht im Store, was hier tatsächlich läuft, und nicht nur, was laut Anleitung laufen sollte.
import fs from 'node:fs';
import path from 'node:path';
import { warteAufApp } from '../pruefung.js';

const MIN_FREI_GB = 6;

export default async function (ctx) {
  const datei = path.join(ctx.HOME, 'pruefstand.json');
  const gebacken = path.join(ctx.ROOT, 'store-geprueft.json');
  const lesen = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
  let ergebnisse = lesen(datei), lauf = null;
  const speichern = () => fs.writeFileSync(datei, JSON.stringify(ergebnisse, null, 2));
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const freiGb = async () => { const s = (await ctx.systemInfo()).disk; return s?.total ? (s.total - s.used) / 1e9 : Infinity; };

  async function warteJob(id) {
    for (;;) {
      await warte(ctx.DEMO ? 100 : 1500);
      const a = (await ctx.apps.list()).find((x) => x.id === id);
      if (!a?.job?.running) return a;
    }
  }

  // Apps mit Pflichtfeldern (Konto, Claim-Code, VPN) lassen sich nicht unbeaufsichtigt starten
  const pruefbar = (a) => !a.installed && !a.custom && !a.vpn && !(a.settings || []).some((f) => f.required && !f.default);

  async function eineApp(meta) {
    const start = Date.now();
    const r = { zeit: start, version: ctx.VERSION, ok: false, text: '' };
    let installiert = false;
    try {
      await ctx.apps.install(meta.id, {});
      installiert = true;
      const a = await warteJob(meta.id);
      if (a.job?.error) { r.text = 'Installation fehlgeschlagen'; r.log = (a.job.log || []).filter((l) => /error|fehl|denied|timeout|no matching/i.test(l)).slice(-8).join('\n') || (a.job.log || []).slice(-15).join('\n'); installiert = false; return r; }
      const antwort = await warteAufApp(a, { demo: ctx.DEMO, ms: 240000, abbruch: () => lauf?.stopp });
      r.ok = antwort.ok; r.text = antwort.text;
      if (!antwort.ok) r.log = String(await ctx.apps.logs(meta.id).catch(() => '')).split('\n').slice(-15).join('\n');
    } catch (e) { r.text = e.message; }
    finally {
      r.dauer = Date.now() - start;
      if (installiert) {
        await ctx.apps.uninstall(meta.id, true).catch(() => { });
        await warteJob(meta.id);
        // Images wieder entfernen, sonst läuft die Platte bei vielen Apps voll
        await ctx.apps.entferneImages?.(meta.id, meta.images).catch(() => { });
      }
    }
    return r;
  }

  async function starten(ids) {
    lauf = { gesamt: ids.length, fertig: 0, app: null, stopp: false };
    const alle = await ctx.apps.list();
    const liste = alle.filter((a) => ids.includes(a.id) && pruefbar(a));
    lauf.gesamt = liste.length;
    for (const meta of liste) {
      if (lauf.stopp) break;
      if (await freiGb() < MIN_FREI_GB) { lauf.grund = `Abgebrochen: Unter ${MIN_FREI_GB} GB freier Speicher.`; break; }
      lauf.app = meta.name;
      meta.images = ctx.apps.imagesVon?.(meta.id);
      ergebnisse[meta.id] = await eineApp(meta);
      speichern();
      lauf.fertig++;
    }
    const ok = liste.filter((a) => ergebnisse[a.id]?.ok).length;
    ctx.events.emit('notify', { level: ok === liste.length ? 'ok' : 'warn', title: 'Prüfstand fertig', text: lauf.grund || `${ok} von ${lauf.fertig} Apps haben geantwortet.` });
    lauf = null;
  }

  const zusammen = () => ({ ...Object.fromEntries(Object.entries(lesen(gebacken)).map(([k, v]) => [k, { ...v, gebacken: true }])), ...ergebnisse });

  return { routes: {
    'GET /api/pruefstand': { fn: async () => {
      const apps = await ctx.apps.list();
      return { lauf, ergebnisse: zusammen(), pruefbar: apps.filter(pruefbar).map((a) => ({ id: a.id, name: a.name, neu: !!a.added })), docker: ctx.apps.dockerOk };
    } },
    'POST /api/pruefstand/start': { fn: async (req) => {
      const b = await ctx.readJson(req);
      if (lauf) throw ctx.httpError(409, 'Der Prüfstand läuft bereits.');
      if (!ctx.apps.dockerOk) throw ctx.httpError(503, 'Docker läuft nicht.');
      if (!Array.isArray(b?.ids) || !b.ids.length) throw ctx.httpError(400, 'Wähle mindestens eine App aus.');
      void starten(b.ids.map(String)).catch((e) => { ctx.log('Prüfstand', e); lauf = null; });
      return { ok: true };
    } },
    'POST /api/pruefstand/stopp': { fn: async () => { if (lauf) lauf.stopp = true; return { ok: true }; } },
  } };
}
