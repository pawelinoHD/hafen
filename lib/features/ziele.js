// Ziele: Nutzer wählen, was ihr Hafen tun soll, statt eine App unter 120 zu suchen.
import { warteAufApp, probe } from '../pruefung.js';

const ZIELE = [
  { id: 'fotos', titel: 'Fotos vom Handy sichern', nutzen: 'Jedes neue Foto landet automatisch bei dir zu Hause statt in einer fremden Cloud.', ersetzt: 'iCloud-Fotos, Google Fotos',
    apps: ['immich'], ram: 6, speicher: 50, schritte: [
      { id: 'konto', text: 'Öffne Immich und lege dein Konto an. Das erste Konto wird Administrator.', app: 'immich' },
      { id: 'handy', text: 'Installiere die App „Immich“ auf deinem Handy und trage die Adresse unten ein.', qr: 'immich' },
      { id: 'upload', text: 'Schalte in der Handy-App die Sicherung ein. Unterwegs hilft das Ziel „Von unterwegs zugreifen“.' },
    ] },
  { id: 'filme', titel: 'Filme und Serien streamen', nutzen: 'Deine eigene Mediathek auf Fernseher, Handy und Tablet, ohne Abo.', ersetzt: 'Streaming-Abos für eigene Filme',
    apps: ['jellyfin'], ram: 2, speicher: 20, schritte: [
      { id: 'konto', text: 'Öffne Jellyfin und lege dein Konto an.', app: 'jellyfin' },
      { id: 'dateien', text: 'Lege Filme in „Medien/Filme“ und Serien in „Medien/Serien“ ab. Das geht direkt im Fenster „Dateien“.', hash: '#/files' },
      { id: 'bibliothek', text: 'Füge in Jellyfin die Bibliothek /media hinzu.', app: 'jellyfin' },
      { id: 'geraet', text: 'Installiere die Jellyfin-App auf Fernseher oder Handy und trage die Adresse unten ein.', qr: 'jellyfin' },
    ] },
  { id: 'dateien', titel: 'Dateien auf allen Geräten', nutzen: 'Deine Dateien, Kalender und Kontakte synchron, und sie bleiben auf deiner Hardware.', ersetzt: 'iCloud Drive, Dropbox, Google Drive',
    apps: ['nextcloud'], ram: 2, speicher: 20, schritte: [
      { id: 'anmelden', text: 'Öffne Nextcloud. Benutzer und Passwort stehen in Hafen auf der App-Seite unter „Zugangsdaten“. Die Ersteinrichtung braucht ein bis zwei Minuten.', app: 'nextcloud' },
      { id: 'geraet', text: 'Installiere die Nextcloud-App auf deinen Geräten und trage die Adresse unten ein.', qr: 'nextcloud' },
    ] },
  { id: 'dokumente', titel: 'Papierkram digitalisieren', nutzen: 'Rechnungen und Briefe werden erkannt, durchsuchbar und sind in Sekunden wiedergefunden.', ersetzt: 'Aktenordner',
    apps: ['paperless-ngx'], ram: 2, speicher: 10, schritte: [
      { id: 'anmelden', text: 'Öffne Paperless. Die Zugangsdaten stehen in Hafen auf der App-Seite.', app: 'paperless-ngx' },
      { id: 'eingang', text: 'Lege Scans oder PDFs in „Dokumente/Eingang“. Paperless holt sie von dort automatisch ab.', hash: '#/files' },
    ] },
  { id: 'werbung', titel: 'Werbung im ganzen WLAN blocken', nutzen: 'Weniger Werbung und Tracker auf allen Geräten, auch dort, wo es keinen Adblocker gibt.', ersetzt: 'Adblocker auf jedem Gerät',
    apps: ['adguard'], ram: 0.5, speicher: 1, dns: true, schritte: [
      { id: 'assistent', text: 'Öffne AdGuard Home und gehe den Assistenten durch. Lass den Web-Port dabei auf 3000.', app: 'adguard' },
      { id: 'router', text: 'Trage im Router die IP-Adresse deines Servers als DNS-Server ein. Vergib ihr vorher dort eine feste Adresse.' },
    ] },
  { id: 'passwoerter', titel: 'Passwörter selbst verwalten', nutzen: 'Ein Tresor für alle Geräte, dessen Daten nur bei dir liegen.', ersetzt: '1Password, LastPass',
    apps: ['vaultwarden'], ram: 0.3, speicher: 1, braucht: 'fernzugriff', schritte: [
      { id: 'https', text: 'Bitwarden-Apps verlangen HTTPS. Führe dazu auf dem Server im Terminal aus: tailscale serve --bg 8222' },
      { id: 'konto', text: 'Öffne die so entstandene https-Adresse und lege deinen Tresor an. Dein Hauptpasswort kann niemand zurücksetzen.' },
      { id: 'geraet', text: 'Installiere die Bitwarden-App und trage bei „Selbst gehostet“ diese Adresse ein.' },
    ] },
  { id: 'kochen', titel: 'Rezepte und Einkauf planen', nutzen: 'Rezepte aus dem Netz sammeln, Woche planen, Einkaufsliste bekommen.', ersetzt: 'Rezepte-Lesezeichen und Zettel',
    apps: ['mealie'], ram: 0.6, speicher: 2, schritte: [
      { id: 'anmelden', text: 'Öffne Mealie, melde dich an und ändere die Startdaten in deinem Profil.', app: 'mealie' },
      { id: 'handy', text: 'Speichere die Adresse auf dem Handy, zum Beispiel über „Zum Home-Bildschirm“.', qr: 'mealie' },
    ] },
  { id: 'ki', titel: 'Privater KI-Assistent', nutzen: 'Chatten, ohne dass deine Texte einen fremden Server sehen.', ersetzt: 'Cloud-Chatbots für Privates',
    apps: ['open-webui'], ram: 1.5, speicher: 10, schritte: [
      { id: 'ollama', text: 'Installiere Ollama direkt auf dem Mac (ollama.com). Nur dort nutzt es die GPU; im Container läuft es auf der CPU.' },
      { id: 'modell', text: 'Lade im Terminal ein Modell, zum Beispiel: ollama pull qwen3.5:9b' },
      { id: 'konto', text: 'Öffne Open WebUI und lege dein Konto an. Das erste Konto wird Administrator.', app: 'open-webui' },
    ] },
  { id: 'fernzugriff', titel: 'Von unterwegs zugreifen', nutzen: 'Dein Hafen ist auch außerhalb des WLANs erreichbar, ohne offene Ports am Router.', ersetzt: 'Portfreigaben und DynDNS',
    apps: [], ram: 0, speicher: 0, pruefe: 'tailscale', schritte: [
      { id: 'mac', text: 'Installiere Tailscale auf dem Server und melde dich an (tailscale.com/download).' },
      { id: 'handy', text: 'Installiere Tailscale auf dem Handy und melde dich mit demselben Konto an. Das Handy erreicht deinen Hafen jetzt von überall.' },
    ] },
  { id: 'sicherung', titel: 'Daten gegen Verlust absichern', nutzen: 'Geht die Platte kaputt, sind deine Daten trotzdem da. Ohne Sicherung gibt es sie nur einmal.', ersetzt: 'Hoffnung',
    apps: [], ram: 0, speicher: 0, pruefe: 'backup', schritte: [
      { id: 'platte', text: 'Schließe eine externe Festplatte an und lass sie angeschlossen.' },
      { id: 'plan', text: 'Trage sie unter „Backups“ als Ziel ein, schalte die tägliche Sicherung ein und nimm den Speicher-Ordner mit dazu.', hash: '#/backups' },
      { id: 'probe', text: 'Klicke einmal auf „Jetzt sichern“ und warte, bis die Sicherung fertig ist.', hash: '#/backups' },
    ] },
];

export default async function (ctx) {
  const zustand = () => (ctx.config.ziele ||= { schritte: {}, begruesst: false });
  const laufend = new Map();
  const antwortet = new Map();
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  // Prüft, was Hafen selbst feststellen kann; Handgriffe am Handy hakt der Nutzer ab
  async function erfuellt(ziel, apps) {
    if (ziel.pruefe === 'tailscale') return (await ctx.tailscale().catch(() => null))?.state === 'Running';
    if (ziel.pruefe === 'backup') {
      const s = ctx.config.backup;
      if (!s?.ziel || !s.aktiv) return false;
      return (await ctx.backupStand?.())?.alterTage < 3;
    }
    // Während der Installation gilt eine App schon als installiert, ist aber noch nicht nutzbar
    return !laufend.has(ziel.id) && ziel.apps.every((id) => { const a = apps.find((x) => x.id === id); return a?.installed && !a.job?.running; });
  }

  async function ressourcen(ziel, apps, sys) {
    const fehlend = ziel.apps.filter((id) => !apps.find((a) => a.id === id)?.installed);
    if (!fehlend.length) return [];
    const hinweise = [];
    const dockerRam = await ctx.apps.dockerMem?.().catch(() => 0);
    const belegt = Object.values(sys.apps || {}).reduce((n, a) => n + (a.mem || 0), 0);
    const gesamt = dockerRam || sys.mem?.total || 0;
    if (gesamt && gesamt - belegt < ziel.ram * 1e9) hinweise.push({ stufe: 'warn', text: `Braucht rund ${String(ziel.ram).replace('.', ',')} GB Arbeitsspeicher. Für Docker sind gerade noch ${((gesamt - belegt) / 1e9).toFixed(1).replace('.', ',')} GB frei. Beende andere Apps oder gib Colima mehr Speicher: colima stop && colima start --memory ${Math.ceil(ziel.ram + 2)}` });
    const frei = (sys.disk?.total || 0) - (sys.disk?.used || 0);
    if (sys.disk && frei < ziel.speicher * 1e9) hinweise.push({ stufe: 'warn', text: `Empfohlen sind ${ziel.speicher} GB freier Speicher, frei sind ${Math.round(frei / 1e9)} GB.` });
    for (const id of fehlend) {
      const meta = apps.find((a) => a.id === id);
      const ports = [meta?.port, ...(meta?.extraPorts || [])];
      const belegter = apps.find((a) => a.installed && a.id !== id && [a.port, ...(a.extraPorts || [])].some((p) => ports.includes(p)));
      if (belegter) hinweise.push({ stufe: 'error', text: `${meta.name} braucht denselben Port wie ${belegter.name}. Entferne zuerst ${belegter.name}.` });
    }
    return hinweise;
  }

  async function einrichten(ziel) {
    const lauf = { schritt: 'Vorbereiten', fehler: null };
    laufend.set(ziel.id, lauf);
    try {
      for (const id of ziel.apps) {
        let app = (await ctx.apps.list()).find((a) => a.id === id);
        if (!app) throw new Error(`Die App ${id} fehlt im Store.`);
        if (!app.installed) {
          lauf.schritt = `${app.name} wird installiert. Das erste Mal kann das einige Minuten dauern.`;
          await ctx.apps.install(id, {});
          for (;;) {
            await warte(ctx.DEMO ? 200 : 1500);
            app = (await ctx.apps.list()).find((a) => a.id === id);
            if (!app.job?.running) break;
          }
          if (app.job?.error) throw new Error(`${app.name} konnte nicht installiert werden. Das Protokoll steht auf der App-Seite.`);
        }
        lauf.schritt = `Warte, bis ${app.name} antwortet`;
        const r = await warteAufApp(app, { demo: ctx.DEMO });
        if (!r.ok) throw new Error(`${app.name} läuft, antwortet aber nach fünf Minuten nicht (${r.text}). Das Protokoll steht auf der App-Seite.`);
        antwortet.set(id, Date.now());
      }
      ctx.events.emit('notify', { level: 'ok', title: `„${ziel.titel}“ ist eingerichtet`, text: 'Jetzt fehlen noch die Schritte auf deinen Geräten.' });
      laufend.delete(ziel.id);
    } catch (e) {
      lauf.fehler = e.message; lauf.schritt = null;
      ctx.events.emit('notify', { level: 'error', title: `„${ziel.titel}“ nicht eingerichtet`, text: e.message });
    }
  }

  return { routes: {
    'GET /api/ziele': { fn: async () => {
      const apps = await ctx.apps.list(), sys = await ctx.systemInfo(), z = zustand();
      const liste = await Promise.all(ZIELE.map(async (ziel) => {
        const eingerichtet = await erfuellt(ziel, apps);
        const haken = z.schritte[ziel.id] || {};
        const erledigt = ziel.schritte.filter((s) => haken[s.id]).length;
        return { ...ziel, eingerichtet, haken, erledigt, fertig: eingerichtet && erledigt === ziel.schritte.length,
          lauf: laufend.get(ziel.id) || null, hinweise: await ressourcen(ziel, apps, sys),
          appDaten: ziel.apps.map((id) => { const a = apps.find((x) => x.id === id); return a && { id, name: a.name, port: a.port, path: a.path, state: a.state, installed: a.installed }; }).filter(Boolean) };
      }));
      return { ziele: liste, begruesst: z.begruesst, appsInstalliert: apps.some((a) => a.installed) };
    } },
    'POST /api/ziele/start': { fn: async (req) => {
      const b = await ctx.readJson(req), ziel = ZIELE.find((x) => x.id === b?.id);
      if (!ziel) throw ctx.httpError(404, 'Dieses Ziel gibt es nicht.');
      if (laufend.get(ziel.id) && !laufend.get(ziel.id).fehler) throw ctx.httpError(409, 'Dieses Ziel wird gerade eingerichtet.');
      const hart = (await ressourcen(ziel, await ctx.apps.list(), await ctx.systemInfo())).find((h) => h.stufe === 'error');
      if (hart) throw ctx.httpError(409, hart.text);
      void einrichten(ziel);
      return { ok: true };
    } },
    'POST /api/ziele/schritt': { fn: async (req) => {
      const b = await ctx.readJson(req), ziel = ZIELE.find((x) => x.id === b?.ziel);
      if (!ziel?.schritte.some((s) => s.id === b?.schritt) || typeof b.fertig !== 'boolean') throw ctx.httpError(400, 'Ungültiger Schritt.');
      const z = zustand();
      (z.schritte[ziel.id] ||= {})[b.schritt] = b.fertig;
      await ctx.saveConfig();
      return { ok: true };
    } },
    'POST /api/ziele/begruesst': { fn: async () => { zustand().begruesst = true; await ctx.saveConfig(); return { ok: true }; } },
  } };
}
