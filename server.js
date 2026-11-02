// Hafen – ein kleines Heimserver-OS im Stil von Umbrel.
// Läuft direkt unter macOS (Apple Silicon) oder Linux und steuert Apps über Docker.
// Keine npm-Pakete: nur Node ≥ 20 und die Docker-CLI.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { createApps, lanAddresses } from './lib/apps.js';
import { PROVIDERS, listModels, chat as aiChat, explain as aiExplain } from './lib/ai.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEMO = process.argv.includes('--demo') || process.env.HAFEN_DEMO === '1';
const PORT = Number(process.env.HAFEN_PORT || 8420);
const HOME = process.env.HAFEN_HOME || path.join(os.homedir(), DEMO ? 'hafen-demo' : 'hafen-daten');
const STORAGE = path.join(HOME, 'storage');
const CONFIG_FILE = path.join(HOME, 'config.json');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

fs.mkdirSync(HOME, { recursive: true });
for (const d of ['Downloads', 'Medien/Filme', 'Medien/Serien', 'Musik', 'Fotos', 'Dokumente', 'Hörbücher'])
  fs.mkdirSync(path.join(STORAGE, d), { recursive: true });

// ---------- Konfiguration ----------
let config = loadConfig();
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { secret: crypto.randomBytes(32).toString('hex'), wallpaper: 'tiefsee' }; }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
if (!fs.existsSync(CONFIG_FILE)) saveConfig();

// Unter macOS ist der Bonjour-Name (name.local) nicht immer gleich os.hostname()
let bonjourName = null;
if (process.platform === 'darwin') {
  try { bonjourName = execFileSync('scutil', ['--get', 'LocalHostName'], { timeout: 2000 }).toString().trim(); } catch { }
}
const hostName = () => bonjourName || os.hostname().replace(/\.local$/, '');
// ---------- Fernzugriff über Tailscale ----------
// Tailscale läuft als normale Mac-App (oder Linux-Dienst); Hafen liest nur den Status über die CLI.
const TAILSCALE_BINS = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale', '/usr/bin/tailscale', 'tailscale'];
let tailscale = { installed: false, state: 'NotInstalled', checked: 0 };
// Die Mac-App ist zugleich die CLI: Sie als Programm zu starten öffnet jedes Mal die ganze App und löst die
// macOS-Abfrage nach fremden App-Daten aus. Adresse und Tailnet stehen auch ohne sie im System.
async function tailscaleAmMac() {
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(i.address))?.address || '';
  const dnsInfo = await new Promise((resolve) => execFile('scutil', ['--dns'], { timeout: 4000 }, (err, out) => resolve(err ? '' : out)));
  const tailnet = /search domain\[\d+\] : (\S+\.ts\.net)/.exec(dnsInfo)?.[1] || '';
  const short = hostName().toLowerCase();
  return tailscale = { installed: true, state: ip ? 'Running' : 'Stopped', checked: Date.now(), name: ip && tailnet ? `${short}.${tailnet}` : '', short: ip ? short : '', ip, tailnet, peers: null };
}
async function refreshTailscale() {
  if (process.platform === 'darwin' && !DEMO && fs.existsSync('/Applications/Tailscale.app')) return tailscaleAmMac();
  for (const bin of TAILSCALE_BINS) {
    if (bin.startsWith('/') && !fs.existsSync(bin)) continue;
    const out = await new Promise((resolve) => execFile(bin, ['status', '--json'], { timeout: 4000 }, (err, stdout) => resolve(err && !stdout ? null : stdout)));
    if (out == null) continue;
    try {
      const s = JSON.parse(out);
      const self = s.Self || {};
      tailscale = {
        installed: true, state: s.BackendState || 'Unknown', checked: Date.now(),
        name: (self.DNSName || '').replace(/\.$/, ''),
        short: (self.DNSName || '').split('.')[0],
        ip: (self.TailscaleIPs || s.TailscaleIPs || []).find((x) => x.includes('.')) || '',
        tailnet: s.CurrentTailnet?.Name || s.MagicDNSSuffix || '',
        peers: Object.values(s.Peer || {}).filter((p) => p.Online).length,
      };
      return tailscale;
    } catch { /* nächste Möglichkeit probieren */ }
  }
  tailscale = { installed: false, state: 'NotInstalled', checked: Date.now() };
  return tailscale;
}
refreshTailscale();
setInterval(refreshTailscale, 60_000).unref();

const tailscaleHosts = () => (tailscale.state === 'Running' ? [tailscale.short, tailscale.name, tailscale.ip].filter(Boolean) : []);
// Weitere Netzwerknamen: der NetBIOS-Name des Macs (z. B. „MACBOOKAIR-79C8“ – unter dem rufen Windows-PCs ihn auf)
// und was der Router per Rückwärtsauflösung liefert (FritzBox: „name.fritz.box“)
let routerNames = [];
async function refreshRouterNames() {
  const names = [];
  if (process.platform === 'darwin') {
    const netbios = await new Promise((resolve) => execFile('defaults', ['read', '/Library/Preferences/SystemConfiguration/com.apple.smb.server', 'NetBIOSName'],
      { timeout: 3000 }, (err, out) => resolve(err ? '' : out.trim())));
    if (/^[\w-]{1,63}$/.test(netbios)) names.push(netbios);
  }
  for (const ip of lanAddresses()) {
    try {
      for (const n of await dns.reverse(ip)) {
        const name = n.replace(/\.$/, '');
        if (!name || /^\d+\.\d+\.\d+\.\d+$/.test(name)) continue;
        names.push(name);
        if (name.includes('.') && !name.endsWith('.local')) names.push(name.split('.')[0]);
      }
    } catch {}
  }
  routerNames = [...new Set(names)];
}
refreshRouterNames();
setInterval(refreshRouterNames, 10 * 60_000).unref();
const hosts = () => [...new Set(['localhost', `${hostName()}.local`, hostName(), ...routerNames, ...lanAddresses(), ...tailscaleHosts()])];

// Ereignisse für Erweiterungen (z. B. Mitteilungen): 'job' bei jedem Ende einer App-Aktion
const events = new EventEmitter();
events.setMaxListeners(50);
const CUSTOM_STORE = path.join(HOME, 'eigene-apps');
const apps = createApps({ storeDir: path.join(ROOT, 'store'), extraStoreDirs: [CUSTOM_STORE], homeDir: HOME, storageDir: STORAGE,
  demo: DEMO, hosts, onEvent: (e) => events.emit(e.type, e) });

// ---------- Anmeldung ----------
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw) {
  if (!config.user) return false;
  const { hash } = hashPassword(pw, config.user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.user.hash, 'hex'));
}
// Sitzung = signiertes Cookie; überlebt Neustarts, wird durch Passwortwechsel ungültig
function sign(data) {
  return crypto.createHmac('sha256', config.secret + (config.user?.hash || '')).update(data).digest('base64url');
}
function makeSession() {
  const payload = `${Date.now() + 30 * 864e5}`;
  return `${payload}.${sign(payload)}`;
}
function validSession(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)hafen=([^;]+)/);
  if (!m || !config.user) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig || Number(payload) < Date.now()) return false;
  const want = sign(payload);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
const sessionCookie = (v, maxAge) =>
  `hafen=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// Einfache Bremse gegen Passwort-Raten
const failed = new Map();
function throttled(ip) {
  const f = failed.get(ip);
  return f && f.count >= 5 && Date.now() - f.last < 60_000;
}

// ---------- Systemwerte ----------
let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const a = c.times, b = lastCpu[i]?.times || a;
    const t = (k) => a[k] - b[k];
    idle += t('idle');
    total += t('user') + t('nice') + t('sys') + t('idle') + t('irq');
  });
  lastCpu = now;
  return total > 0 ? (1 - idle / total) * 100 : 0;
}

const sh = (cmd, args) => new Promise((resolve) =>
  execFile(cmd, args, { timeout: 4000 }, (err, out) => resolve(err ? '' : out)));

async function memory() {
  const total = os.totalmem();
  // os.freemem() unterschätzt unter macOS massiv (Cache zählt als belegt) → vm_stat lesen
  if (process.platform === 'darwin') {
    const out = await sh('vm_stat', []);
    const page = Number(out.match(/page size of (\d+)/)?.[1] || 16384);
    const get = (k) => Number(out.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] || 0) * page;
    const used = get('Pages active') + get('Pages wired down') + get('Pages occupied by compressor');
    if (used > 0) return { total, used };
  }
  if (process.platform === 'linux') {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const avail = Number(info.match(/MemAvailable:\s+(\d+)/)?.[1] || 0) * 1024;
    if (avail) return { total, used: total - avail };
  }
  return { total, used: total - os.freemem() };
}

async function disk() {
  try {
    const s = await fs.promises.statfs(HOME);
    return { total: s.blocks * s.bsize, used: (s.blocks - s.bavail) * s.bsize };
  } catch { return { total: 0, used: 0 }; }
}

// Gerätemodell, z. B. „Macmini9,1“ – einmal beim Start lesen
let deviceModel = '';
if (process.platform === 'darwin') {
  try { deviceModel = execFileSync('sysctl', ['-n', 'hw.model'], { timeout: 2000 }).toString().trim(); } catch { }
} else if (process.platform === 'linux') {
  try { deviceModel = fs.readFileSync('/sys/devices/virtual/dmi/id/product_name', 'utf8').trim(); } catch { }
}

// Summe der empfangenen/gesendeten Bytes aller echten Netzwerkschnittstellen
async function netBytes() {
  if (process.platform === 'darwin') {
    // netstat -ibn: je Schnittstelle eine <Link#…>-Zeile mit Ibytes/Obytes
    const out = await sh('netstat', ['-ibn']);
    const lines = out.trim().split('\n');
    const head = lines.shift()?.trim().split(/\s+/) || [];
    const iI = head.indexOf('Ibytes'), iO = head.indexOf('Obytes');
    let rx = 0, tx = 0;
    for (const l of lines) {
      const c = l.trim().split(/\s+/);
      if (!c[2]?.startsWith('<Link#') || /^(lo|gif|stf|utun|awdl|llw|anpi|bridge|ap)\d/.test(c[0])) continue;
      // Ohne MAC-Adresse fehlt eine Spalte – von hinten zählen
      const off = c.length - head.length;
      rx += Number(c[iI + off]) || 0; tx += Number(c[iO + off]) || 0;
    }
    return { rx, tx };
  }
  if (process.platform === 'linux') {
    let rx = 0, tx = 0;
    for (const l of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const [name, rest] = l.split(':');
      if (!rest || /^(lo|docker|br-|veth)/.test(name.trim())) continue;
      const c = rest.trim().split(/\s+/);
      rx += Number(c[0]) || 0; tx += Number(c[8]) || 0;
    }
    return { rx, tx };
  }
  return null;
}
let lastNet = null;
async function netRate() {
  if (DEMO && process.platform === 'win32') return { rx: 2e5 + Math.random() * 3e6, tx: 5e4 + Math.random() * 6e5 };
  const now = await netBytes().catch(() => null);
  if (!now) return null;
  const t = Date.now(), prev = lastNet;
  lastNet = { ...now, t };
  if (!prev || t - prev.t < 200) return { rx: 0, tx: 0 };
  const s = (t - prev.t) / 1000;
  return { rx: Math.max(0, (now.rx - prev.rx) / s), tx: Math.max(0, (now.tx - prev.tx) / s) };
}

async function systemInfo() {
  const [mem, dsk, per, net] = await Promise.all([memory(), disk(), apps.containerStats(), netRate()]);
  const cpu = os.cpus();
  return {
    cpu: cpuPercent(), cores: cpu.length, cpuModel: cpu[0]?.model || '', model: deviceModel || os.type(),
    mem, disk: dsk, uptime: os.uptime(), apps: per, net,
    platform: process.platform, arch: process.arch,
  };
}

// ---------- Dateien (Speicher-Ordner) ----------
function safePath(rel = '') {
  const p = path.resolve(STORAGE, '.' + path.sep + rel);
  if (p !== STORAGE && !p.startsWith(STORAGE + path.sep)) throw httpError(400, 'Ungültiger Pfad.');
  return p;
}
async function listFiles(rel) {
  const dir = safePath(rel);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const st = await fs.promises.stat(path.join(dir, e.name)).catch(() => null);
    if (!st) continue;
    out.push({ name: e.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'de'));
}

const MEDIA_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.heic': 'image/heic', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// Alle Fotos und Videos unter storage/Fotos (rekursiv), neueste zuerst
async function listMedia() {
  const root = path.join(STORAGE, 'Fotos');
  const out = [];
  async function walk(dir) {
    if (out.length >= 10000) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      const type = (MEDIA_EXT[path.extname(e.name).toLowerCase()] || '').split('/')[0];
      if (type !== 'image' && type !== 'video') continue;
      const st = await fs.promises.stat(p).catch(() => null);
      if (st) out.push({ path: path.relative(STORAGE, p).split(path.sep).join('/'), name: e.name, type, size: st.size, mtime: st.mtimeMs });
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtime - a.mtime);
}

// Datei direkt anzeigen (Bilder, Videos mit Range für Vorspulen)
function sendInline(req, res, file, type) {
  const st = fs.statSync(file);
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  if (range && st.size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  fs.createReadStream(file).pipe(res);
}

// Zuletzt geänderte Dateien im Speicher (flach gehalten und 30 s zwischengespeichert,
// damit große Mediensammlungen nicht bei jeder Abfrage durchlaufen werden)
const recentCache = new Map();
async function recentFiles(dir = '') {
  const hit = recentCache.get(dir);
  if (hit && Date.now() - hit.t < 30_000) return hit.items;
  const start = safePath(dir);
  const out = [];
  let seen = 0;
  async function walk(dir, depth) {
    if (depth > 4 || seen > 4000) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.endsWith('.hafen-upload')) continue;
      seen++;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p, depth + 1); continue; }
      const st = await fs.promises.stat(p).catch(() => null);
      if (st) out.push({ path: path.relative(STORAGE, p).split(path.sep).join('/'), name: e.name, size: st.size, mtime: st.mtimeMs });
    }
  }
  await walk(start, 0);
  const items = out.sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  recentCache.set(dir, { t: Date.now(), items });
  return items;
}

const WIDGETS = ['speicher', 'live', 'apps', 'uhr', 'wetter', 'netzwerk', 'notiz', 'dateien', 'foto', 'kalender', 'countdown'];
const DEFAULT_WIDGETS = ['uhr', 'wetter', 'live', 'speicher', 'netzwerk', 'notiz'];

// Widgets: [{ id, type, size: 's'|'w', opts }] – ältere Fassungen speicherten nur Typnamen
function normWidgets(list) {
  const out = [], ids = new Set();
  for (const raw of list.slice(0, 12)) {
    const w = typeof raw === 'string' ? { type: raw } : raw;
    if (!w || !WIDGETS.includes(w.type)) continue;
    let id = /^[a-z0-9-]{1,24}$/.test(w.id || '') ? w.id : `${w.type}-${crypto.randomBytes(3).toString('hex')}`;
    while (ids.has(id)) id = `${w.type}-${crypto.randomBytes(3).toString('hex')}`;
    ids.add(id);
    let opts = w.opts && typeof w.opts === 'object' && !Array.isArray(w.opts) ? w.opts : {};
    if (JSON.stringify(opts).length > 6000) opts = {};
    out.push({ id, type: w.type, size: w.size === 'w' ? 'w' : 's', opts });
  }
  return out;
}
function homeWidgets() {
  if (config.widgets?.length && typeof config.widgets[0] === 'object') return config.widgets;
  const list = normWidgets(config.widgets || DEFAULT_WIDGETS);
  // Übernahme aus der Vorgängerfassung: eine Notiz und ein Ort galten global
  for (const w of list) {
    if (w.type === 'notiz' && config.note && !w.opts.text) w.opts.text = config.note;
    if (w.type === 'wetter' && config.place && !w.opts.place) w.opts.place = config.place;
  }
  // Sofort speichern – sonst würde jeder Aufruf erneut (und ohne die alte Notiz) übernehmen
  config.widgets = list;
  delete config.note; delete config.place;
  saveConfig();
  return list;
}
const WALLPAPER_FILE = path.join(HOME, 'hintergrund');

// ---------- KI-Assistent ----------
const aiConfig = () => ({ provider: 'ollama', baseUrl: '', model: '', apiKey: '', think: false, ...(config.ai || {}) });
// Für den Browser: nie den Schlüssel selbst, nur ob einer hinterlegt ist
const aiPublic = () => { const c = aiConfig(); return { provider: c.provider, baseUrl: c.baseUrl, model: c.model, think: c.think, hasKey: !!c.apiKey, ready: !!c.model }; };

const gb = (b) => `${(b / 1e9).toFixed(1).replace('.', ',')} GB`;
async function aiSystemPrompt(host) {
  const [sys, list] = await Promise.all([systemInfo(), apps.list()]);
  const installed = list.filter((a) => a.installed);
  const lines = [
    `Du bist der eingebaute Assistent von „Hafen“, einem Heimserver-Betriebssystem (ähnlich umbrelOS) auf ${config.user?.name ? `${config.user.name}s` : 'dem'} Gerät.`,
    'Antworte auf Deutsch, freundlich, kurz und konkret. Nutze Markdown sparsam (Aufzählungen, **fett**, `Code`).',
    'Erfinde keine Apps, Ports oder Werte – nutze nur die Angaben unten. Weißt du etwas nicht, sag es.',
    '',
    '## Gerät jetzt',
    `- Modell: ${sys.model} · Name: ${hostName()} · ${sys.cores} Kerne`,
    // Prozente fertig ausrechnen – kleine Modelle verrechnen sich sonst
    `- CPU: ${Math.round(sys.cpu)} % ausgelastet · RAM: ${gb(sys.mem.used)} von ${gb(sys.mem.total)} belegt (${Math.round(sys.mem.used / sys.mem.total * 100)} %)`,
    `- Speicher: ${gb(sys.disk.used)} von ${gb(sys.disk.total)} belegt (${Math.round(sys.disk.used / sys.disk.total * 100)} % voll), ${gb(sys.disk.total - sys.disk.used)} frei`,
    `- Docker: ${apps.dockerOk ? 'läuft' : 'läuft NICHT'} · Fernzugriff (Tailscale): ${tailscale.state === 'Running' ? `aktiv als ${tailscale.short}` : 'nicht eingerichtet'}`,
    '',
    '## Installierte Apps',
    ...(installed.length ? installed.map((a) => `- ${a.name} (id: ${a.id}) – ${a.state === 'running' ? 'läuft' : 'gestoppt'} – http://${host}:${a.port}`) : ['- keine']),
    '',
    '## Im App Store verfügbar (noch nicht installiert)',
    ...list.filter((a) => !a.installed).map((a) => `- ${a.name} (id: ${a.id}) – ${a.tagline} [${a.category}]`),
    '',
    '## Speicher-Ordner',
    '- Downloads, Medien/Filme, Medien/Serien, Musik, Fotos, Dokumente, Hörbücher, Bücher',
    '',
    '## Aktionen (wichtig)',
    'Wenn der Nutzer etwas getan haben möchte (installieren, starten, stoppen, neu starten, öffnen, ein Fenster zeigen), gib einen Aktions-Knopf aus.',
    'Ein Knopf ist eine eigene Zeile in genau diesem Format, mit einer id aus den Listen oben:',
    '[[aktion:installieren:ID]]  [[aktion:starten:ID]]  [[aktion:stoppen:ID]]  [[aktion:neustarten:ID]]  [[aktion:oeffnen:ID]]',
    '[[aktion:fenster:dateien]]  [[aktion:fenster:fotos]]  [[aktion:fenster:store]]  [[aktion:fenster:einstellungen]]  [[aktion:fenster:nutzung]]',
    'Hafen zeigt jede solche Zeile als Knopf; der Nutzer drückt ihn selbst. Behaupte nie, du hättest etwas ausgeführt, und sag nicht, dass es unmöglich sei – gib stattdessen den Knopf aus.',
    '',
    'Beispiel – Nutzer: „Starte bitte Jellyfin.“ Antwort:',
    'Klar, ein Klick genügt:',
    '[[aktion:starten:jellyfin]]',
    '',
    'Beispiel – Nutzer: „Ich will meine Fotos sichern.“ Antwort:',
    'Dafür eignet sich Syncthing – es gleicht den Ordner „Fotos“ mit deinem Handy ab:',
    '[[aktion:installieren:syncthing]]',
  ];
  return lines.join('\n');
}

// ---------- HTTP ----------
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req) {
  if (!/application\/json/.test(req.headers['content-type'] || '')) throw httpError(415, 'JSON erwartet.');
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw httpError(413, 'Zu groß.'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw httpError(400, 'Kaputtes JSON.'); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(ROOT, 'public', rel);
  if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 404, 'Nicht gefunden');
  fs.readFile(file, (err, data) => {
    if (err) {
      // Alles Unbekannte bekommt die Oberfläche (Single-Page-App)
      if (!path.extname(rel)) return serveStatic(req, res, '/');
      return send(res, 404, 'Nicht gefunden');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

const routes = {
  // --- ohne Anmeldung ---
  'GET /api/status': { open: true, fn: async (req) => ({
    setup: !!config.user, loggedIn: validSession(req), name: config.user?.name || null,
    wallpaper: config.wallpaper, wallpaperVersion: config.wallpaperVersion || 0, demo: DEMO, version: VERSION }) },

  'POST /api/setup': { open: true, fn: async (req, res) => {
    if (config.user) throw httpError(409, 'Hafen ist schon eingerichtet.');
    const { name, password } = await readJson(req);
    if (!name?.trim() || !password || password.length < 8) throw httpError(400, 'Name und Passwort (mind. 8 Zeichen) nötig.');
    config.user = { name: name.trim().slice(0, 40), ...hashPassword(password) };
    saveConfig();
    res.setHeader('Set-Cookie', sessionCookie(makeSession(), 30 * 86400));
    return { ok: true };
  } },

  'POST /api/login': { open: true, fn: async (req, res) => {
    const ip = req.socket.remoteAddress;
    if (throttled(ip)) throw httpError(429, 'Zu viele Versuche. Bitte eine Minute warten.');
    const { password } = await readJson(req);
    if (!checkPassword(String(password || ''))) {
      const f = failed.get(ip) || { count: 0 };
      failed.set(ip, { count: f.count + 1, last: Date.now() });
      throw httpError(401, 'Falsches Passwort.');
    }
    failed.delete(ip);
    res.setHeader('Set-Cookie', sessionCookie(makeSession(), 30 * 86400));
    return { ok: true };
  } },

  'POST /api/logout': { open: true, fn: async (req, res) => {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return { ok: true };
  } },

  // --- mit Anmeldung ---
  'GET /api/apps': { fn: async () => ({
    apps: await apps.list(), docker: apps.dockerOk, dockerVersion: apps.dockerVersion }) },

  'POST /api/apps/install': { fn: async (req) => {
    const { id, settings } = await readJson(req);
    await apps.install(id, settings);
    return { ok: true };
  } },
  'GET /api/apps/vpn': { fn: async (req, res, url) => apps.vpnStatus(url.searchParams.get('id')) },
  'GET /api/apps/creds': { fn: async (req, res, url) => apps.logCredentials(url.searchParams.get('id')) },
  'POST /api/apps/configure': { fn: async (req) => {
    const { id, settings } = await readJson(req);
    apps.configure(id, settings);
    return { ok: true };
  } },
  'POST /api/apps/uninstall': { fn: async (req) => {
    const { id, deleteData } = await readJson(req);
    await apps.uninstall(id, !!deleteData);
    return { ok: true };
  } },
  'POST /api/apps/control': { fn: async (req) => {
    const { id, action } = await readJson(req);
    apps.control(id, action);
    return { ok: true };
  } },
  'GET /api/apps/logs': { fn: async (req, res, url) => ({ text: await apps.logs(url.searchParams.get('id')) }) },

  'GET /api/remote': { fn: async () => ({ ...(await refreshTailscale()), port: PORT }) },

  'GET /api/ai': { fn: async () => ({ ...aiPublic(), providers: PROVIDERS }) },
  'POST /api/ai': { fn: async (req) => {
    const b = await readJson(req);
    const cur = aiConfig();
    if (b.provider && !PROVIDERS[b.provider]) throw httpError(400, 'Unbekannter Anbieter.');
    const provider = b.provider || cur.provider;
    const next = {
      provider,
      baseUrl: String(b.baseUrl ?? cur.baseUrl).trim().slice(0, 300),
      model: String(b.model ?? cur.model).trim().slice(0, 200),
      think: b.think ?? cur.think,
      // Leeres Schlüsselfeld = alten behalten; Anbieterwechsel ohne neuen Schlüssel = keinen übernehmen
      apiKey: b.apiKey ? String(b.apiKey).trim() : (provider === cur.provider ? cur.apiKey : ''),
    };
    if (next.baseUrl && !/^https?:\/\//i.test(next.baseUrl)) throw httpError(400, 'Die Adresse muss mit http:// oder https:// beginnen.');
    config.ai = next;
    saveConfig();
    return aiPublic();
  } },
  'POST /api/ai/models': { fn: async (req) => {
    // Mit den Formularwerten testen, bevor gespeichert wird
    const b = await readJson(req);
    const cur = aiConfig();
    const provider = b.provider || cur.provider;
    const cfg = { provider, baseUrl: b.baseUrl || '', apiKey: b.apiKey || (provider === cur.provider ? cur.apiKey : '') };
    try { return { models: await listModels(cfg) }; }
    catch (e) { throw httpError(502, `${PROVIDERS[provider].label}: ${aiExplain(e, cfg.baseUrl || PROVIDERS[provider].baseUrl)}`); }
  } },

  'GET /api/system': { fn: async () => ({
    ...(await systemInfo()), hostname: hostName(), hosts: hosts(), storage: STORAGE, home: HOME,
    docker: apps.dockerOk, dockerVersion: apps.dockerVersion, version: VERSION, demo: DEMO }) },

  'POST /api/settings': { fn: async (req) => {
    const { name, wallpaper, widgets, note, place } = await readJson(req);
    if (name?.trim()) config.user.name = name.trim().slice(0, 40);
    if (wallpaper) config.wallpaper = String(wallpaper).slice(0, 30);
    if (Array.isArray(widgets)) config.widgets = normWidgets(widgets);
    if (typeof note === 'string') config.note = note.slice(0, 4000);
    if (place === null) delete config.place;
    else if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
      config.place = { name: String(place.name || '').slice(0, 80), lat: place.lat, lon: place.lon };
    }
    saveConfig();
    return { ok: true };
  } },
  'POST /api/password': { fn: async (req, res) => {
    const { current, next } = await readJson(req);
    if (!checkPassword(String(current || ''))) throw httpError(401, 'Aktuelles Passwort stimmt nicht.');
    if (!next || next.length < 8) throw httpError(400, 'Neues Passwort: mindestens 8 Zeichen.');
    Object.assign(config.user, hashPassword(next));
    saveConfig();
    res.setHeader('Set-Cookie', sessionCookie(makeSession(), 30 * 86400));
    return { ok: true };
  } },

  'GET /api/media': { fn: async () => ({ items: await listMedia() }) },
  'GET /api/recent': { fn: async (req, res, url) => ({ items: await recentFiles(url.searchParams.get('dir') || '') }) },
  'GET /api/home': { fn: async () => ({ widgets: homeWidgets(), all: WIDGETS }) },

  'POST /api/restart': { fn: async () => {
    if (DEMO) throw httpError(400, 'Im Demo-Modus nicht verfügbar.');
    // launchd/systemd starten Hafen sofort neu (KeepAlive bzw. Restart=always)
    setTimeout(() => process.exit(0), 300);
    return { ok: true };
  } },

  'GET /api/files': { fn: async (req, res, url) => ({ entries: await listFiles(url.searchParams.get('path') || '') }) },
  'POST /api/files/mkdir': { fn: async (req) => {
    const { path: rel } = await readJson(req);
    await fs.promises.mkdir(safePath(rel), { recursive: true });
    return { ok: true };
  } },
  'POST /api/files/delete': { fn: async (req) => {
    const { path: rel } = await readJson(req);
    const p = safePath(rel);
    if (p === STORAGE) throw httpError(400, 'Der Hauptordner bleibt.');
    await fs.promises.rm(p, { recursive: true, force: true });
    return { ok: true };
  } },
  'POST /api/files/rename': { fn: async (req) => {
    const { path: rel, name } = await readJson(req);
    if (!name || /[\\/]/.test(name)) throw httpError(400, 'Ungültiger Name.');
    const p = safePath(rel);
    await fs.promises.rename(p, safePath(path.join(path.dirname(path.relative(STORAGE, p)), name)));
    return { ok: true };
  } },
};

async function handleUpload(req, res, url) {
  const name = url.searchParams.get('name') || '';
  if (!name || /[\\/]/.test(name)) throw httpError(400, 'Ungültiger Dateiname.');
  const target = safePath(path.join(url.searchParams.get('path') || '', name));
  const tmp = target + '.hafen-upload';
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  }).catch(async (e) => { await fs.promises.rm(tmp, { force: true }); throw e; });
  await fs.promises.rename(tmp, target);
  send(res, 200, { ok: true });
}

// Antwort der KI als Textstrom. Fehler vor dem ersten Zeichen gehen als normale JSON-Fehlermeldung zurück,
// Fehler mittendrin als markierte Zeile am Ende des Textes.
async function handleAiChat(req, res) {
  const cfg = aiConfig();
  if (!cfg.model) throw httpError(400, 'Der KI-Assistent ist noch nicht eingerichtet.');
  const { messages, host } = await readJson(req);
  const clean = (Array.isArray(messages) ? messages : []).slice(-20)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw httpError(400, 'Keine Frage gestellt.');
  const safeHost = /^[a-z0-9.\-:[\]]{1,100}$/i.test(host || '') ? host : `${hostName()}.local`;
  const system = await aiSystemPrompt(safeHost);

  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  };
  try {
    await aiChat(cfg, system, clean, (t) => { start(); res.write(t); }, abort.signal);
    start();
    res.end();
  } catch (e) {
    if (abort.signal.aborted) return;
    const msg = `${PROVIDERS[cfg.provider].label}: ${aiExplain(e, cfg.baseUrl || PROVIDERS[cfg.provider].baseUrl)}`;
    if (!started) throw httpError(502, msg);
    res.end(`\n\n[[fehler:${msg.replace(/\]\]/g, '] ]')}]]`);
  }
}

function handleDownload(req, res, url) {
  const p = safePath(url.searchParams.get('path'));
  const st = fs.statSync(p);
  if (st.isDirectory()) throw httpError(400, 'Ordner können nicht direkt geladen werden.');
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream', 'Content-Length': st.size,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`,
  });
  fs.createReadStream(p).pipe(res);
}

// ---------- Erweiterungen (lib/features/*.js + public/features/*.js) ----------
// Jede Server-Erweiterung exportiert default async (ctx) => ({ routes?, handle? }).
//   routes: wie oben, überschreiben gleichnamige eingebaute Routen
//   handle(req, res, url, authed): für alles, was nicht JSON ist (z. B. öffentliche Links) – true = erledigt
const featureHandlers = [];
const featureCtx = {
  ROOT, HOME, STORAGE, DEMO, PORT, VERSION, CUSTOM_STORE,
  get config() { return config; }, saveConfig,
  apps, events, systemInfo, hosts, hostName, tailscale: () => refreshTailscale(),
  httpError, readJson, send, safePath, sendInline, MEDIA_EXT,
  log: (...a) => console.log('[feature]', ...a),
};
const FEATURE_DIR = path.join(ROOT, 'lib', 'features');
const loadedFeatures = [];
for (const file of fs.existsSync(FEATURE_DIR) ? fs.readdirSync(FEATURE_DIR).filter((f) => f.endsWith('.js')).sort() : []) {
  try {
    const mod = await import(pathToFileURL(path.join(FEATURE_DIR, file)).href);
    const def = (await mod.default(featureCtx)) || {};
    Object.assign(routes, def.routes || {});
    if (def.handle) featureHandlers.push(def.handle);
    loadedFeatures.push(file.replace(/\.js$/, ''));
  } catch (e) {
    // Eine kaputte Erweiterung darf Hafen nicht lahmlegen
    console.error(`[feature] ${file} konnte nicht geladen werden:`, e);
  }
}
// Die Oberfläche lädt public/features/*.js als ES-Module (ohne Anmeldung abrufbar, enthalten keine Daten)
routes['GET /api/features'] = { open: true, fn: async () => ({
  server: loadedFeatures,
  client: fs.existsSync(path.join(ROOT, 'public', 'features'))
    ? fs.readdirSync(path.join(ROOT, 'public', 'features')).filter((f) => f.endsWith('.js')).sort().map((f) => `/features/${f}`) : [],
}) };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    for (const handle of featureHandlers) if (await handle(req, res, url, validSession(req))) return;
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    const authed = validSession(req);
    if (req.method === 'POST' && url.pathname === '/api/files/upload') {
      if (!authed) throw httpError(401, 'Nicht angemeldet.');
      return await handleUpload(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/api/files/download') {
      if (!authed) throw httpError(401, 'Nicht angemeldet.');
      return handleDownload(req, res, url);
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/chat') {
      if (!authed) throw httpError(401, 'Nicht angemeldet.');
      return await handleAiChat(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/files/raw') {
      if (!authed) throw httpError(401, 'Nicht angemeldet.');
      const p = safePath(url.searchParams.get('path'));
      const type = MEDIA_EXT[path.extname(p).toLowerCase()];
      if (!type || !fs.existsSync(p) || fs.statSync(p).isDirectory()) throw httpError(404, 'Datei nicht gefunden.');
      return sendInline(req, res, p, type);
    }
    // Eigenes Hintergrundbild: lesen ohne Anmeldung (auch der Anmeldebildschirm zeigt es), setzen nur angemeldet
    if (url.pathname === '/api/wallpaper') {
      if (req.method === 'GET') {
        if (!fs.existsSync(WALLPAPER_FILE)) throw httpError(404, 'Kein eigenes Hintergrundbild.');
        return sendInline(req, res, WALLPAPER_FILE, config.wallpaperType || 'image/jpeg');
      }
      if (req.method === 'POST') {
        if (!authed) throw httpError(401, 'Nicht angemeldet.');
        const type = req.headers['content-type'] || '';
        if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(type)) throw httpError(415, 'Bitte ein JPG-, PNG-, WebP- oder AVIF-Bild wählen.');
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 25e6) throw httpError(413, 'Das Bild ist größer als 25 MB.'); chunks.push(c); }
        fs.writeFileSync(WALLPAPER_FILE, Buffer.concat(chunks));
        config.wallpaper = 'eigenes'; config.wallpaperType = type; config.wallpaperVersion = Date.now();
        saveConfig();
        return send(res, 200, { ok: true });
      }
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) throw httpError(404, 'Unbekannter Endpunkt.');
    if (!route.open && !authed) throw httpError(401, 'Nicht angemeldet.');
    send(res, 200, await route.fn(req, res, url));
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  await apps.checkDocker();
  console.log(`Hafen ${VERSION}${DEMO ? ' (Demo-Modus)' : ''}`);
  console.log(`  Daten:   ${HOME}`);
  console.log(`  Docker:  ${apps.dockerOk ? apps.dockerVersion : 'nicht erreichbar'}`);
  for (const h of hosts()) console.log(`  Öffnen:  http://${h}:${PORT}`);
});
