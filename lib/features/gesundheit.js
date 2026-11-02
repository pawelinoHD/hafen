// Gesundheit: prüft regelmäßig, ob der Hafen wirklich funktioniert, und repariert, was geht.
import { spawn, execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probe } from '../pruefung.js';

const befehl = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 8000 }, (e, out) => resolve(e ? null : String(out)));
});

export default async function (ctx) {
  const mac = process.platform === 'darwin' && !ctx.DEMO;
  const einst = () => ({ wach: true, selbstheilung: true, quittiert: [], ...ctx.config.gesundheit });
  let ergebnis = { zeit: 0, punkte: [] }, laeuft = null, wecker = null;
  const fehlversuche = new Map(), neugestartet = new Map(), gemeldet = new Map();

  // Hält den Mac am Netzteil wach, solange Hafen läuft. Braucht kein Admin-Passwort.
  function wachHalten() {
    const an = einst().wach;
    if (!mac) return;
    if (an && !wecker) {
      wecker = spawn('caffeinate', ['-s', '-w', String(process.pid)], { stdio: 'ignore' });
      wecker.on('exit', () => { wecker = null; });
      wecker.on('error', () => { wecker = null; });
    } else if (!an && wecker) wecker.kill();
  }
  wachHalten();

  function backupStand() {
    let h = null;
    try { h = JSON.parse(fs.readFileSync(path.join(ctx.HOME, 'backup.json'), 'utf8')); } catch { }
    const letzte = h?.ergebnisse?.find((e) => e.art === 'Sicherung' && e.erfolg);
    return { letzte: letzte?.zeit || 0, alterTage: letzte ? (Date.now() - letzte.zeit) / 864e5 : Infinity, fehler: h?.ergebnisse?.[0]?.erfolg === false ? h.ergebnisse[0].fehler : null };
  }
  ctx.backupStand = backupStand;

  async function appPunkte(apps) {
    const punkte = [];
    for (const app of apps.filter((a) => a.installed)) {
      if (app.job?.running || (app.job?.ended && Date.now() - app.job.ended < 5 * 60000)) continue;
      if (app.state !== 'running') {
        // Absichtlich gestoppte Apps sind kein Fehler, abgestürzte schon: Compose startet sie sonst neu
        if (app.state === 'restarting' || app.state === 'dead') punkte.push({ id: `app-${app.id}`, stufe: 'error', titel: `${app.name} stürzt ab`, text: 'Der Container startet immer wieder neu. Das Protokoll auf der App-Seite nennt meist die Ursache.', hash: `#/store/${app.id}` });
        continue;
      }
      const r = await probe(app, { demo: ctx.DEMO, ms: 6000 });
      const n = r.ok ? 0 : (fehlversuche.get(app.id) || 0) + 1;
      fehlversuche.set(app.id, n);
      // Einmal langsam ist normal, erst drei Prüfungen in Folge gelten als Ausfall
      if (n < 3) continue;
      const seit = neugestartet.get(app.id) || 0;
      if (einst().selbstheilung && Date.now() - seit > 3600000) {
        neugestartet.set(app.id, Date.now()); fehlversuche.set(app.id, 0);
        await ctx.apps.control(app.id, 'restart').catch(() => { });
        ctx.events.emit('notify', { level: 'warn', title: `${app.name} neu gestartet`, text: `Die App antwortete nicht mehr (${r.text}). Hafen hat sie selbst neu gestartet.`, app: app.id });
        punkte.push({ id: `app-${app.id}`, stufe: 'warn', titel: `${app.name} wurde neu gestartet`, text: `Sie antwortete nicht mehr (${r.text}).`, hash: `#/store/${app.id}` });
      } else punkte.push({ id: `app-${app.id}`, stufe: 'error', titel: `${app.name} antwortet nicht`, text: `${r.text}. Ein Neustart hat es nicht behoben. Das Protokoll auf der App-Seite nennt meist die Ursache.`, hash: `#/store/${app.id}` });
    }
    const zahl = apps.filter((a) => a.installed).length;
    if (zahl && !punkte.length) punkte.push({ id: 'apps', stufe: 'ok', titel: 'Apps antworten', text: `${apps.filter((a) => a.state === 'running').length} von ${zahl} Apps laufen, alle antworten.` });
    return punkte;
  }

  async function dnsPunkt(apps) {
    const app = apps.find((a) => ['adguard', 'pihole'].includes(a.id) && a.installed && a.state === 'running');
    if (!app || ctx.DEMO) return [];
    const r = new dns.Resolver({ timeout: 3000, tries: 1 });
    r.setServers(['127.0.0.1']);
    try { await r.resolve4('example.com'); return [{ id: 'dns', stufe: 'ok', titel: 'Werbefilter beantwortet Anfragen', text: `${app.name} ist als DNS-Server auf diesem Rechner erreichbar.` }]; }
    catch { return [{ id: 'dns', stufe: 'error', titel: 'Werbefilter ist nicht erreichbar', text: `${app.name} läuft, aber Port 53 antwortet nicht. Unter Colima kann die UDP-Weiterleitung fehlen; in diesem Fall hilft die VM-Fassung oder OrbStack.`, hash: `#/store/${app.id}` }]; }
  }

  function speicherPunkt(sys) {
    if (!sys.disk?.total) return [];
    const frei = sys.disk.total - sys.disk.used, anteil = frei / sys.disk.total, gb = Math.round(frei / 1e9);
    if (anteil < .05 || gb < 5) return [{ id: 'speicher', stufe: 'error', titel: 'Speicher fast voll', text: `Nur noch ${gb} GB frei. Apps und Datenbanken können jetzt ausfallen.`, hash: '#/files' }];
    if (anteil < .12 || gb < 20) return [{ id: 'speicher', stufe: 'warn', titel: 'Speicher wird knapp', text: `Noch ${gb} GB frei.`, hash: '#/files' }];
    return [{ id: 'speicher', stufe: 'ok', titel: 'Genug Speicher frei', text: `${gb} GB frei.` }];
  }

  async function backupPunkte(apps) {
    const s = ctx.config.backup || {}, stand = backupStand();
    if (!s.ziel) return [{ id: 'backup', stufe: 'warn', titel: 'Keine Sicherung eingerichtet', text: 'Fällt die Platte aus, sind alle Daten weg. Richte eine externe Festplatte als Ziel ein.', hash: '#/ziele/sicherung' }];
    if (stand.fehler) return [{ id: 'backup', stufe: 'error', titel: 'Letzte Sicherung fehlgeschlagen', text: stand.fehler, hash: '#/backups' }];
    if (!stand.letzte) return [{ id: 'backup', stufe: 'warn', titel: 'Noch keine Sicherung vorhanden', text: 'Das Ziel ist eingerichtet, gesichert wurde aber noch nichts.', hash: '#/backups' }];
    if (stand.alterTage > 3) return [{ id: 'backup', stufe: 'warn', titel: 'Sicherung ist veraltet', text: `Die letzte ist ${Math.floor(stand.alterTage)} Tage alt. Ist die Festplatte angeschlossen und läuft der Zeitplan?`, hash: '#/backups' }];
    const imSpeicher = apps.filter((a) => a.installed && a.storageDirs?.length);
    if (imSpeicher.length && !s.speicher) return [{ id: 'backup', stufe: 'warn', titel: 'Sicherung lässt deine Dateien aus', text: `${imSpeicher.map((a) => a.name).join(', ')} legen Dateien im Speicher ab. Der Speicher-Ordner ist aber nicht in der Sicherung.`, hash: '#/backups' }];
    return [{ id: 'backup', stufe: 'ok', titel: 'Sicherung ist aktuell', text: `Letzte vor ${Math.max(0, Math.floor(stand.alterTage * 24))} Stunden.` }];
  }

  async function serverPunkte() {
    if (!mac) return [];
    const punkte = [];
    const modell = (await befehl('sysctl', ['-n', 'hw.model'])) || '';
    const batt = (await befehl('pmset', ['-g', 'batt'])) || '';
    const mobil = /MacBook/i.test(modell);
    if (mobil && /Battery Power/.test(batt)) punkte.push({ id: 'strom', stufe: 'warn', titel: 'Server läuft auf Akku', text: 'Auf Akku schläft der Mac ein, dann ist dein Hafen nicht erreichbar. Schließe das Netzteil an.' });
    punkte.push(einst().wach
      ? { id: 'schlaf', stufe: 'ok', titel: 'Mac bleibt wach', text: mobil ? 'Am Netzteil schläft er nicht ein. Beim MacBook gilt das nur bei offenem Deckel, außer ein Monitor ist angeschlossen.' : 'Am Netzteil schläft er nicht ein.' }
      : { id: 'schlaf', stufe: 'warn', titel: 'Mac darf einschlafen', text: 'Schläft er, ist dein Hafen nicht erreichbar.', aktion: { label: 'Wach halten', route: '/api/gesundheit/wach', body: { an: true } } });
    const colima = fs.existsSync(path.join(os.homedir(), 'Library/LaunchAgents/homebrew.mxcl.colima.plist'));
    const docker = colima || fs.existsSync('/Applications/OrbStack.app') || fs.existsSync('/Applications/Docker.app');
    if (!docker) punkte.push({ id: 'autostart', stufe: 'warn', titel: 'Docker startet nicht automatisch', text: 'Nach einem Neustart bleiben alle Apps aus. Führe aus: brew services start colima' });
    const auto = await befehl('defaults', ['read', '/Library/Preferences/com.apple.loginwindow', 'autoLoginUser']);
    if (!auto?.trim()) punkte.push({ id: 'anmeldung', stufe: 'info', quittierbar: true, titel: 'Nach Stromausfall wartet Hafen auf deine Anmeldung', text: 'Hafen startet, sobald du dich am Mac anmeldest. Soll er von allein hochkommen, schalte in den Systemeinstellungen die automatische Anmeldung ein. Mit FileVault ist das nicht möglich.' });
    return punkte;
  }

  function passwortPunkt(apps) {
    // Selbst erzeugte Passwörter sind 12 Zeichen lang; alles Kürzere steht in der Anleitung der App
    const fest = apps.filter((a) => a.installed && Object.entries(a.credentials || {}).some(([k, w]) => /passwort/i.test(k) && String(w).length < 12));
    return fest.map((a) => ({ id: `passwort-${a.id}`, stufe: 'warn', quittierbar: true, titel: `${a.name} nutzt ein Standardpasswort`, text: 'Das Startpasswort steht öffentlich in der Anleitung der App. Ändere es und bestätige das hier.', hash: `#/store/${a.id}` }));
  }

  async function pruefen() {
    const apps = await ctx.apps.list(), sys = await ctx.systemInfo();
    const docker = await ctx.apps.checkDocker();
    const punkte = [docker
      ? { id: 'docker', stufe: 'ok', titel: 'Docker läuft', text: ctx.DEMO ? 'Im Demo-Modus simuliert.' : `Version ${ctx.apps.dockerVersion}.` }
      : { id: 'docker', stufe: 'error', titel: 'Docker läuft nicht', text: 'Ohne Docker läuft keine App. Führe aus: colima start' }];
    if (docker) punkte.push(...await appPunkte(apps), ...await dnsPunkt(apps));
    punkte.push(...speicherPunkt(sys), ...await backupPunkte(apps), ...await serverPunkte(), ...passwortPunkt(apps));
    const t = await ctx.tailscale().catch(() => null);
    punkte.push(t?.state === 'Running'
      ? { id: 'fern', stufe: 'ok', titel: 'Von unterwegs erreichbar', text: `Über Tailscale als ${t.short || 'dieser Rechner'}.` }
      : { id: 'fern', stufe: 'info', quittierbar: true, titel: 'Nur im Heimnetz erreichbar', text: 'Mit Tailscale erreichst du deinen Hafen auch unterwegs.', hash: '#/ziele/fernzugriff' });
    const quittiert = new Set(einst().quittiert);
    const sichtbar = punkte.filter((p) => !(p.quittierbar && quittiert.has(p.id)));
    // Nur Neues melden, sonst nervt jede Prüfung mit derselben Mitteilung
    const aktuell = new Set();
    for (const p of sichtbar.filter((x) => x.stufe === 'error')) {
      aktuell.add(p.id);
      if (!gemeldet.has(p.id)) ctx.events.emit('notify', { level: 'error', title: p.titel, text: p.text });
      gemeldet.set(p.id, true);
    }
    for (const id of gemeldet.keys()) if (!aktuell.has(id)) gemeldet.delete(id);
    const rang = { error: 0, warn: 1, info: 2, ok: 3 };
    ergebnis = { zeit: Date.now(), punkte: sichtbar.sort((a, b) => rang[a.stufe] - rang[b.stufe]) };
    return ergebnis;
  }
  const lauf = () => (laeuft ||= pruefen().catch((e) => { ctx.log('Gesundheit', e); return ergebnis; }).finally(() => { laeuft = null; }));

  setTimeout(() => void lauf(), 20000).unref();
  setInterval(() => void lauf(), 5 * 60000).unref();

  return { routes: {
    'GET /api/gesundheit': { fn: async () => ({ ...(ergebnis.zeit ? ergebnis : await lauf()), einstellungen: { wach: einst().wach, selbstheilung: einst().selbstheilung }, mac }) },
    'POST /api/gesundheit/pruefen': { fn: async () => lauf() },
    'POST /api/gesundheit/wach': { fn: async (req) => {
      const b = await ctx.readJson(req);
      ctx.config.gesundheit = { ...einst(), wach: !!b?.an }; await ctx.saveConfig(); wachHalten();
      return lauf();
    } },
    'POST /api/gesundheit/selbstheilung': { fn: async (req) => {
      const b = await ctx.readJson(req);
      ctx.config.gesundheit = { ...einst(), selbstheilung: !!b?.an }; await ctx.saveConfig();
      return { ok: true };
    } },
    'POST /api/gesundheit/quittieren': { fn: async (req) => {
      const b = await ctx.readJson(req);
      if (typeof b?.id !== 'string' || b.id.length > 80) throw ctx.httpError(400, 'Ungültiger Hinweis.');
      ctx.config.gesundheit = { ...einst(), quittiert: [...new Set([...einst().quittiert, b.id])] }; await ctx.saveConfig();
      return lauf();
    } },
  } };
}
