// Hafen-Oberfläche im Stil von umbrelOS: Hintergrundbild, Widgets, App-Raster, Dock,
// Suche (Strg+K) und große Glasfenster für Dateien, Fotos, App Store, Einstellungen und Live-Nutzung.
const $ = (sel, el = document) => el.querySelector(sel);
const root = $('#root');

const WALLPAPERS = { tiefsee: 'Tiefsee', nordlicht: 'Nordlicht', glut: 'Glut', violett: 'Violett', graphit: 'Graphit' };
// Kategorie-Icons (public/icons/kategorien, gestaltet mit Claude Design); Dateiname aus dem Kategorienamen
const catSlug = (c) => c.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/\s+/g, '-');
const CAT_ICONS = new Set(['entdecken', 'dateien', 'downloads', 'entwicklung', 'finanzen', 'fotos', 'ki', 'lesen', 'medien',
  'netzwerk', 'produktivitaet', 'sicherheit', 'smart-home', 'werkzeuge', 'zuhause', 'spiele']);
// Schlägt das Laden fehl (z. B. weil Hafen gerade neu startet), erneut versuchen – patch() ersetzt das Bild sonst nie
const retryImg = (e) => {
  const img = e.currentTarget, n = Number(img.dataset.retry || 0);
  if (n >= 6) return;
  img.dataset.retry = n + 1;
  setTimeout(() => { img.src = img.src.replace(/\?.*$/, '') + `?r=${n + 1}`; }, 1500 * (n + 1));
};
const catIcon = (c, size = 20) => (CAT_ICONS.has(catSlug(c))
  ? h('img', { class: 'cat-ic', src: `/icons/kategorien/${catSlug(c)}.svg`, alt: '', width: size, height: size, onerror: retryImg })
  : h('span', { class: 'cat-ic dot-ic' }));
const FEATURED = ['jellyfin', 'nextcloud', 'home-assistant', 'open-webui', 'paperless-ngx'];

const state = {
  status: null, apps: [], docker: true, system: null, history: { cpu: [], mem: [], rx: [], tx: [] },
  home: null, recent: {}, editMode: false,
  files: { path: '', back: [], fwd: [], entries: null, view: 'list', sort: 'name', dir: 1, q: '', sel: null, error: null },
  photos: { items: null, filter: 'alle', group: 'monat', size: 168, q: '' },
  store: { cat: 'entdecken', q: '', slide: 0 },
  settingsTab: 'alle', settingsQ: '', usageMetric: 'cpu',
};

// ---------- Hilfen ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.status?.loggedIn) { state.status.loggedIn = false; render(); }
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = bad ? 'bad' : ''), 3000);
}

const de = (n, d = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
const fmtBytes = (b) => {
  if (!b) return '0 KB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${de(b / 1024 ** i, i >= 3 ? 2 : i ? 1 : 0)} ${u[i]}`;
};
const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} ${d === 1 ? 'Tag' : 'Tage'}` : hr ? `${hr} Std. ${m} Min.` : `${m} Min.`;
};
const fmtDate = (ms) => {
  const d = new Date(ms), now = new Date();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Heute um ${time}`;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return `Gestern um ${time}`;
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
};
const genitiv = (name) => (/[sßxz]$/i.test(name) ? `${name}’` : `${name}s`);

// ---------- Symbole ----------
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  list: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 6h6M14 9h4M14 16h6M14 19h4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  mem: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v10M11 7v10M15 7v10M6 17v3M18 17v3"/>',
  disk: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="11" r="3.5"/><path d="M12 11h.01M8 18h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>',
  arrowDown: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  photos: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  library: '<path d="M4 4v16M8 4v16"/><rect x="12" y="4" width="8" height="16" rx="1.5"/>',
};
const icon = (name, extra = '') => h('span', { style: 'display:contents', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[name]}</svg>` });

// Hafen-Logo: ein Anker
const LOGO = `<svg class="logo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="32" cy="12" r="5.5"/><path d="M32 18v36"/><path d="M21 27h22"/><path d="M10 38c2 10 11 16 22 16s20-6 22-16"/><path d="M5 42l5-5 5 5M49 42l5-5 5 5"/></svg>`;

// Dock-Symbole: eigene, farbige Kacheln
const DOCK_ART = {
  files: `<svg viewBox="0 0 52 52"><defs><linearGradient id="dfa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset=".5" stop-color="#e2457f"/><stop offset="1" stop-color="#7a3cdc"/></linearGradient></defs>
    <rect width="52" height="52" rx="13" fill="url(#dfa)"/><path d="M9 16a3 3 0 0 1 3-3h9l3 3h16a3 3 0 0 1 3 3v3H9z" fill="#fff" opacity=".55"/><rect x="8" y="19" width="36" height="22" rx="3.5" fill="#fff" opacity=".93"/><rect x="8" y="19" width="36" height="5" rx="2.5" fill="#ffd2c0" opacity=".7"/></svg>`,
  photos: `<svg viewBox="0 0 52 52"><defs><linearGradient id="dpa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26a28d"/><stop offset="1" stop-color="#0d4a55"/></linearGradient><linearGradient id="dpb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset=".55" stop-color="#ff6f61"/><stop offset="1" stop-color="#5b3a8c"/></linearGradient></defs>
    <rect width="52" height="52" rx="13" fill="url(#dpa)"/><rect x="12" y="10" width="28" height="22" rx="3" fill="#fff" opacity=".45" transform="rotate(-8 26 21)"/><rect x="10" y="15" width="32" height="25" rx="3" fill="#fff"/><rect x="12.5" y="17.5" width="27" height="20" rx="1.5" fill="url(#dpb)"/><path d="M12.5 34l8-8 6 6 4-4 9 9v.5H12.5z" fill="#1e2a3a" opacity=".85"/><circle cx="33" cy="23" r="2.5" fill="#fff4c2"/></svg>`,
  store: `<svg viewBox="0 0 52 52"><defs><linearGradient id="dsa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#1238c4"/></linearGradient></defs>
    <rect width="52" height="52" rx="13" fill="url(#dsa)"/><path d="M14 19h24l-2 20a3 3 0 0 1-3 2.7H19a3 3 0 0 1-3-2.7z" fill="#fff"/><path d="M20 19v-2a6 6 0 0 1 12 0v2" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M20.5 28c1.4 2.6 3.3 3.8 5.5 3.8s4.1-1.2 5.5-3.8" fill="none" stroke="#1d4fe0" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  settings: `<svg viewBox="0 0 52 52"><defs><linearGradient id="dea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d96a8"/><stop offset="1" stop-color="#454c5c"/></linearGradient></defs>
    <rect width="52" height="52" rx="13" fill="url(#dea)"/><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M13 17h26M13 26h26M13 35h26" opacity=".55"/></g><g fill="#fff"><rect x="28" y="13" width="7" height="8" rx="2.5"/><rect x="16" y="22" width="7" height="8" rx="2.5"/><rect x="24" y="31" width="7" height="8" rx="2.5"/></g></svg>`,
  usage: `<svg viewBox="0 0 52 52"><defs><linearGradient id="dua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173f33"/><stop offset="1" stop-color="#07170f"/></linearGradient></defs>
    <rect width="52" height="52" rx="13" fill="url(#dua)"/><path d="M10 39h32" stroke="#3ee39a" stroke-opacity=".25" stroke-width="1.5"/><path d="M10 33l6-5 4 6 6-14 5 9 4-5 7 6" fill="none" stroke="#3ee39a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const WINDOWS = { files: 'Dateien', photos: 'Fotos', store: 'App Store', settings: 'Einstellungen', usage: 'Live-Nutzung' };

// ---------- Erweiterungen ----------
// Module aus public/features/ melden sich über window.Hafen an (siehe FEATURES.md)
const ext = { windows: {}, settings: [], fileMenu: [], filesSide: [], appMenu: [], usage: [], storeActions: [], overlays: [], onPoll: [], deleteHint: null };
const dockArt = (k, size) => h('span', { class: 'ic', style: `--s:${size}px;background:none;border:0;box-shadow:none`, html: DOCK_ART[k] });

// App-Icon: dunkle Kachel mit Logo (bei fehlendem Bild ein Buchstabe)
const failedIcons = new Set();
function appIcon(app, size) {
  const wrap = h('span', { class: 'ic', style: size ? `--s:${size}px` : null });
  if (app.icon && !failedIcons.has(app.icon)) {
    // Kein lazy loading: Ansichten werden beim Abfragen abgeglichen, Bilder müssen sofort aus dem Cache kommen
    const img = h('img', { src: app.icon, alt: '' });
    img.onerror = () => { failedIcons.add(app.icon); img.replaceWith(h('span', { class: 'mono' }, app.name[0])); };
    wrap.append(img);
  } else wrap.append(h('span', { class: 'mono' }, app.name[0]));
  return wrap;
}

const appUrl = (app) => `${location.protocol}//${location.hostname}:${app.port}${app.path || ''}`;
// Apps ohne Weboberfläche (z. B. Minecraft-Server): statt „Öffnen“ die Adresse zum Verbinden
const hasWeb = (app) => app.web !== false;
// „localhost“ würde auf einem anderen Gerät (PC, Konsole) auf sich selbst zeigen – dann den Netzwerknamen nehmen
const isLocalHost = (h) => /^(localhost|127\.|\[?::1\]?$)/.test(h);
const connectHosts = () => {
  if (!isLocalHost(location.hostname)) return [location.hostname];
  const hosts = (state.system?.hosts || []).filter((x) => !isLocalHost(x));
  const name = hosts.find((x) => x.endsWith('.local'));
  const ip = hosts.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x) && !x.startsWith('100.'));
  return [name, ip].filter(Boolean).length ? [name, ip].filter(Boolean) : [location.hostname];
};
const connectAddr = (app) => `${connectHosts()[0]}:${app.port}`;
const copyConnect = (app) => navigator.clipboard?.writeText(connectAddr(app)).then(() => toast(`${connectAddr(app)} kopiert`), () => toast(connectAddr(app)));
const isBusy = (app) => app.job?.running;
const dotClass = (app) => (isBusy(app) ? 'busy' : app.state === 'running' ? 'running' : 'exited');
const stateText = (app) => isBusy(app)
  ? ({ install: 'Wird installiert …', uninstall: 'Wird entfernt …', update: 'Wird aktualisiert …', stop: 'Wird gestoppt …', start: 'Startet …', restart: 'Startet neu …', configure: 'Wird neu eingerichtet …' }[app.job.action] || 'Arbeitet …')
  : app.state === 'running' ? 'Läuft' : 'Gestoppt';
const installedApps = () => state.apps.filter((a) => a.installed || isBusy(a));

function wallpaperStyle(name = state.status?.wallpaper) {
  if (name === 'eigenes') return { cls: '', css: `background-image:url(/api/wallpaper?v=${state.status.wallpaperVersion || 0})` };
  return { cls: 'wp-' + (WALLPAPERS[name] ? name : 'tiefsee'), css: '' };
}
function applyWallpaper() {
  const w = wallpaperStyle(), el = $('#wallpaper');
  el.className = w.cls; el.style.cssText = w.css;
}

// ---------- Datenabruf ----------
async function refreshApps() {
  try { const d = await api('/api/apps'); state.apps = d.apps; state.docker = d.docker; } catch { }
}
async function refreshSystem() {
  try {
    state.system = await api('/api/system');
    const hist = state.history;
    hist.cpu.push(state.system.cpu);
    hist.mem.push(pct(state.system.mem.used, state.system.mem.total));
    if (state.system.net) { hist.rx.push(state.system.net.rx); hist.tx.push(state.system.net.tx); }
    for (const k of ['cpu', 'mem', 'rx', 'tx']) if (hist[k].length > 60) hist[k].shift();
  } catch { }
}
let pollTimer;
async function poll() {
  clearTimeout(pollTimer);
  if (!state.status?.loggedIn) return;
  await Promise.all([refreshApps(), refreshSystem(), refreshRecent()]);
  update();
  for (const fn of ext.onPoll) safeExt(fn);
  pollTimer = setTimeout(poll, state.apps.some(isBusy) ? 1200 : 3500);
}

// ---------- Rahmen ----------
const route = () => location.hash.replace(/^#\/?/, '').split('/');
const go = (hash) => { location.hash = hash; };

function render() {
  const s = state.status;
  root.replaceChildren();
  if (!s) return;
  applyWallpaper();
  document.body.classList.toggle('blur', !s.loggedIn || !s.setup);
  if (!s.setup || !s.loggedIn) return root.append(viewAuth(s.setup ? 'login' : 'setup'));
  root.append(h('div', { id: 'desk' }), h('div', { id: 'win' }), viewDock(), ...ext.overlays.map((fn) => safeExt(fn)).filter(Boolean),
    // Klick auf die Kugel öffnet direkt den KI-Assistenten, der Rest der Pille die Suche
    h('button', { class: 'search-pill', onclick: () => openSpotlight() },
      h('span', { class: 'orb', title: 'Hafen fragen', onclick: (e) => { e.stopPropagation(); openSpotlight(true); } }),
      'Suche', h('kbd', {}, navigator.platform.includes('Mac') ? '⌘K' : 'Strg+K')));
  // Einstiegs-Animation nur beim ersten Aufbau – spätere Abgleiche (patch) sollen nichts erneut einblenden
  document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 2200);
  update();
}

// ---------- Bewegung ----------
let motionPref = 'an';
try { motionPref = localStorage.getItem('hafen-motion') || 'an'; } catch { }
const motionOff = () => motionPref === 'aus' || matchMedia('(prefers-reduced-motion: reduce)').matches;
function applyMotion() { document.body.classList.toggle('no-motion', motionPref === 'aus'); }
function setMotion(on) {
  motionPref = on ? 'an' : 'aus';
  try { localStorage.setItem('hafen-motion', motionPref); } catch { }
  applyMotion();
}
applyMotion();

// Nur Veränderungen abgleichen – Eingaben, Scrollpositionen und Hover bleiben erhalten
function update() {
  if (!state.status?.loggedIn) return;
  const desk = $('#desk');
  if (desk) patch(desk, [viewDesktop()]);
  const [page, ...args] = route();
  const win = $('#win');
  const key = WINDOWS[page] ? page : '';
  document.body.classList.toggle('blur', !!key);
  document.querySelectorAll('.dock button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  if (!win) return;
  if (!key) {
    // Fenster gleitet hinaus statt zu verschwinden; wird während dessen ein neues geöffnet, ersetzt es das alte sofort
    const wrap = win.firstElementChild;
    win.dataset.view = '';
    if (wrap && !wrap.classList.contains('closing')) {
      if (motionOff()) wrap.remove();
      else { wrap.classList.add('closing'); setTimeout(() => wrap.remove(), 260); }
    }
    return;
  }
  const fresh = viewWindow(page, args);
  if (win.dataset.view !== key) { win.dataset.view = key; win.replaceChildren(fresh); onWindowOpen(page); }
  else patch($('.window', win), [...$('.window', fresh).childNodes]);
}

function patch(parent, next) {
  const prev = [...parent.childNodes];
  if (prev.length !== next.length) return parent.replaceChildren(...next);
  next.forEach((n, i) => {
    const o = prev[i];
    if (o.isEqualNode(n)) return;
    // Bereiche mit data-keep (z. B. die Notiz, in die gerade getippt wird) bleiben wie sie sind
    if (o.nodeType === 1 && n.nodeType === 1 && o.dataset.keep && o.dataset.keep === n.dataset.keep) return;
    if (o.nodeType === 1 && n.nodeType === 1 && o.tagName === n.tagName && sameAttrs(o, n) && n.childNodes.length) patch(o, [...n.childNodes]);
    else o.replaceWith(n);
  });
}
function sameAttrs(a, b) {
  if (a.attributes.length !== b.attributes.length) return false;
  for (const { name, value } of a.attributes) if (b.getAttribute(name) !== value) return false;
  return true;
}

function onWindowOpen(page) {
  try { ext.windows[page]?.onOpen?.(); } catch (e) { console.error('[feature]', e); }
  if (page === 'files') loadFiles();
  if (page === 'photos') loadMedia();
  if (page === 'settings') { loadRemote(); loadAiConfig().then(update); }
  const inp = $('#win .autofocus');
  if (inp && matchMedia('(hover: hover)').matches) inp.focus();
}

// ---------- Anmeldung ----------
function viewAuth(mode) {
  const err = h('div', { class: 'error', role: 'alert' });
  const fields = mode === 'setup'
    ? [h('input', { class: 'input', placeholder: 'Dein Name', autocomplete: 'name', 'aria-label': 'Name' }),
      h('input', { class: 'input', type: 'password', placeholder: 'Passwort (mind. 8 Zeichen)', autocomplete: 'new-password', 'aria-label': 'Passwort' }),
      h('input', { class: 'input', type: 'password', placeholder: 'Passwort wiederholen', autocomplete: 'new-password', 'aria-label': 'Passwort wiederholen' })]
    : [h('input', { class: 'input', type: 'password', placeholder: 'Passwort', autocomplete: 'current-password', 'aria-label': 'Passwort' })];
  setTimeout(() => fields[0].focus(), 60);
  return h('div', { class: 'auth' }, h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        if (mode === 'setup') {
          if (fields[1].value !== fields[2].value) throw new Error('Die beiden Passwörter sind verschieden.');
          await api('/api/setup', { name: fields[0].value, password: fields[1].value });
        } else await api('/api/login', { password: fields[0].value });
        await boot();
      } catch (x) { err.textContent = x.message; }
    },
  },
  h('span', { html: LOGO, style: 'display:contents' }),
  h('h1', {}, mode === 'setup' ? 'Willkommen bei Hafen' : 'Willkommen zurück'),
  h('p', {}, mode === 'setup' ? 'Leg deinen Namen und ein Passwort fest. Damit meldest du dich künftig an.' : `Hallo ${state.status.name}, gib dein Passwort ein.`),
  fields, err, h('button', { class: 'btn', type: 'submit' }, mode === 'setup' ? 'Weiter' : 'Anmelden')));
}

// ---------- Startseite ----------
function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Gute Nacht' : hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Guten Tag' : hr < 22 ? 'Guten Abend' : 'Gute Nacht';
}

// ---------- Widgets ----------
// Jedes Widget: { id, type, size: 's' | 'w', opts } – gleiche Typen dürfen mehrfach vorkommen
const WIDGET_INFO = {
  uhr: ['Uhr', 'Digital oder analog, auch mit anderer Zeitzone'],
  wetter: ['Wetter', 'Aktuelles Wetter, breit mit Vorhersage'],
  kalender: ['Kalender', 'Der aktuelle Monat auf einen Blick'],
  countdown: ['Countdown', 'Tage bis zu einem wichtigen Datum'],
  notiz: ['Notiz', 'Ein farbiger Zettel für schnelle Notizen'],
  live: ['Live-Nutzung', 'CPU, RAM, Speicher und Netzwerk'],
  speicher: ['Speicher', 'Belegter und freier Speicherplatz'],
  netzwerk: ['Netzwerk', 'Download- und Upload-Rate mit Verlauf'],
  apps: ['Apps', 'Wie viele deiner Apps gerade laufen'],
  dateien: ['Zuletzt geändert', 'Die neuesten Dateien, auf Wunsch aus einem Ordner'],
  foto: ['Foto', 'Bilder aus deinem Fotos-Ordner, auf Wunsch wechselnd'],
};
const HAS_OPTS = new Set(['uhr', 'wetter', 'countdown', 'notiz', 'live', 'dateien', 'foto']);
const MAX_WIDGETS = 12;

const fmtRate = (b) => (b >= 1048576 ? `${de(b / 1048576, 1)} MB/s` : `${de(b / 1024, 0)} KB/s`);
const kw = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
const relTime = (ms) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} ${Math.floor(s / 86400) === 1 ? 'Tag' : 'Tagen'}`;
  return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};
function miniSpark(values, cls = '') {
  if (values.length < 2) return h('div', { class: 'spark ' + cls });
  const max = Math.max(...values, 1), w = 100, hh = 30;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hh - (v / max) * (hh - 3) - 1).toFixed(1)}`).join(' ');
  return h('div', { class: 'spark ' + cls, html: `<svg viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none"><polygon points="0,${hh} ${pts} ${w},${hh}" fill="currentColor" opacity=".15"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>` });
}
const widgetLabel = (w) => w.opts.label || (w.type === 'uhr' && w.opts.tz ? tzCity(w.opts.tz) : w.type === 'countdown' && w.opts.title) || WIDGET_INFO[w.type][0];

// Rahmen um jedes Widget; im Bearbeiten-Modus mit Knöpfen zum Entfernen, Anpassen und für die Breite
function widgetBox(w, cls, onclick, ...content) {
  const edit = state.editMode;
  const label = widgetLabel(w);
  return h('div', {
    class: `widget-wrap${w.size === 'w' ? ' wide' : ''}${edit ? ' edit' : ''}${drag.id === w.id ? ' dragging' : ''}`,
    'data-wid': w.id, onpointerdown: edit ? (e) => startDrag(e, w.id) : null,
  },
  h(onclick && !edit ? 'button' : 'div', { class: `widget ${cls}`, onclick: edit ? null : onclick }, content),
  h('span', {}, label),
  edit && h('button', { class: 'wbtn rm', title: 'Entfernen', 'aria-label': `${label} entfernen`, onclick: () => removeWidget(w.id) }, icon('x', 'stroke-width="3"')),
  edit && HAS_OPTS.has(w.type) && h('button', { class: 'wbtn cfg', title: 'Anpassen', 'aria-label': `${label} anpassen`, onclick: () => widgetSettings(w.id) }, icon('sliders')),
  edit && h('button', { class: 'wbtn size', title: w.size === 'w' ? 'Schmal machen' : 'Breit machen', 'aria-label': w.size === 'w' ? 'Schmal machen' : 'Breit machen', onclick: () => toggleSize(w.id) }, icon(w.size === 'w' ? 'shrink' : 'expand')));
}

// ---- Uhr ----
const TIMEZONES = [['', 'Ortszeit dieses Geräts'], ['Europe/Berlin', 'Berlin'], ['Europe/London', 'London'], ['Europe/Istanbul', 'Istanbul'], ['Europe/Moscow', 'Moskau'],
  ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['America/Los_Angeles', 'Los Angeles'], ['America/Sao_Paulo', 'São Paulo'],
  ['Asia/Dubai', 'Dubai'], ['Asia/Kolkata', 'Mumbai'], ['Asia/Bangkok', 'Bangkok'], ['Asia/Shanghai', 'Peking'], ['Asia/Tokyo', 'Tokio'], ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland']];
const tzCity = (tz) => (TIMEZONES.find(([k]) => k === tz) || [, tz.split('/').pop().replace(/_/g, ' ')])[1];
function tzParts(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { H: +p.hour, M: +p.minute, S: +p.second };
}
function tzOffset(tz) {
  if (!tz) return '';
  const now = new Date();
  const diff = Math.round((new Date(now.toLocaleString('en-US', { timeZone: tz })) - new Date(now.toLocaleString('en-US'))) / 36e5 * 2) / 2;
  return diff === 0 ? 'gleiche Zeit' : `${diff > 0 ? '+' : '−'}${de(Math.abs(diff))} Std.`;
}
function analogFace({ H, M, S }, secs) {
  const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="${i % 3 ? 8 : 6}" x2="50" y2="${i % 3 ? 11 : 13}" transform="rotate(${i * 30} 50 50)" stroke="rgba(255,255,255,${i % 3 ? .35 : .8})" stroke-width="${i % 3 ? 1.4 : 2.4}" stroke-linecap="round"/>`).join('');
  const hand = (deg, len, wdt, col) => `<line x1="50" y1="56" x2="50" y2="${50 - len}" transform="rotate(${deg} 50 50)" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round"/>`;
  return h('span', { class: 'face', html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.14)" stroke-width="1.2"/>${ticks}
    ${hand(((H % 12) + M / 60) * 30, 24, 4.2, '#fff')}${hand((M + S / 60) * 6, 35, 2.8, '#fff')}${secs ? hand(S * 6, 38, 1.2, '#ff9f43') : ''}<circle cx="50" cy="50" r="3" fill="${secs ? '#ff9f43' : '#fff'}"/></svg>` });
}

// ---- Wetter: direkt bei Open-Meteo (kostenlos, ohne Schlüssel), je Ort alle 15 Minuten ----
const WMO = [[0, '☀️', 'Klar'], [1, '🌤️', 'Überwiegend klar'], [2, '⛅', 'Teils bewölkt'], [3, '☁️', 'Bedeckt'], [48, '🌫️', 'Nebel'],
  [57, '🌦️', 'Nieselregen'], [67, '🌧️', 'Regen'], [77, '🌨️', 'Schnee'], [82, '🌧️', 'Regenschauer'], [86, '🌨️', 'Schneeschauer'], [99, '⛈️', 'Gewitter']];
const wmo = (c) => WMO.find(([max]) => c <= max) || WMO[WMO.length - 1];
const weatherCache = new Map();
const weatherKey = (w) => `${w.opts.place.lat},${w.opts.place.lon},${w.opts.unit || 'c'}`;
async function loadWeather(w) {
  const key = weatherKey(w), c = weatherCache.get(key);
  if (c && (c.loading || Date.now() - c.at < (c.data ? 15 * 60e3 : 60e3))) return;
  weatherCache.set(key, { ...c, loading: true, at: Date.now() });
  const { lat, lon } = w.opts.place;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto${w.opts.unit === 'f' ? '&temperature_unit=fahrenheit' : ''}`;
    const d = await (await fetch(u)).json();
    weatherCache.set(key, { at: Date.now(), data: {
      temp: d.current.temperature_2m, code: d.current.weather_code,
      days: d.daily.time.map((t, i) => ({ t, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i] })) } });
  } catch { weatherCache.set(key, { at: Date.now(), error: 'Wetter nicht erreichbar' }); }
  updateDesk();
}
async function geocode(q) {
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=de`)).json();
  const r = g.results?.[0];
  return r ? { name: r.name, lat: r.latitude, lon: r.longitude } : null;
}

// ---- Countdown ----
function countdownTarget(o) {
  const t = new Date(`${o.date}T00:00`), today = new Date(); today.setHours(0, 0, 0, 0);
  if (o.yearly) { t.setFullYear(today.getFullYear()); if (t < today) t.setFullYear(today.getFullYear() + 1); }
  return { t, days: Math.round((t - today) / 864e5) };
}

// Wechselnde Fotos je Widget
const photoPick = new Map();
function pickPhoto(w) {
  const imgs = state.home.images || [];
  if (!imgs.length) return null;
  const cur = photoPick.get(w.id), every = (w.opts.every || 0) * 1000;
  if (!cur || !imgs.some((m) => m.path === cur.m.path) || (every && Date.now() - cur.at > every)) {
    const others = imgs.length > 1 && cur ? imgs.filter((m) => m.path !== cur.m.path) : imgs;
    photoPick.set(w.id, { m: others[Math.floor(Math.random() * others.length)], at: Date.now() });
  }
  return photoPick.get(w.id).m;
}

const NOTE_COLORS = { gelb: 'Gelb', blau: 'Blau', gruen: 'Grün', rosa: 'Rosa', lila: 'Lila', grau: 'Grau' };

const WIDGET_VIEWS = {
  uhr: (w) => {
    const o = w.opts, tz = o.tz || undefined, now = new Date();
    const fmt = (opt) => now.toLocaleString('de-DE', { timeZone: tz, ...opt });
    const date = o.tz ? `${fmt({ weekday: 'short' })}, ${fmt({ day: 'numeric', month: 'short' })} · ${tzOffset(o.tz)}`
      : `${fmt({ day: 'numeric', month: 'long', year: 'numeric' })} · KW ${kw(now)}`;
    const head = o.tz ? tzCity(o.tz) : fmt({ weekday: 'long' });
    if (o.style === 'analog') {
      return widgetBox(w, 'clock analog', null, analogFace(tzParts(o.tz), o.seconds),
        h('div', { class: 'ana-txt' }, h('div', { class: 'k' }, head), h('div', { class: 'v' }, fmt({ hour: '2-digit', minute: '2-digit' })), h('div', { class: 's' }, date)));
    }
    return widgetBox(w, 'clock', null,
      h('div', { class: 'k' }, head),
      h('div', { class: 'time' + (o.seconds ? ' secs' : '') }, fmt({ hour: '2-digit', minute: '2-digit', ...(o.seconds ? { second: '2-digit' } : {}) })),
      h('div', { class: 's' }, date));
  },
  wetter: (w) => {
    const place = w.opts.place, open = () => widgetSettings(w.id);
    if (!place) return widgetBox(w, 'weather', open, h('div', { class: 'k' }, 'Wetter'), h('div', { class: 'big-emoji', style: 'margin-top:8px' }, '🌤️'),
      h('div', { class: 's' }, 'Tippe hier, um deinen Ort festzulegen'));
    const c = weatherCache.get(weatherKey(w));
    if (!c?.data) { loadWeather(w); return widgetBox(w, 'weather', open, h('div', { class: 'k' }, place.name), h('div', { class: 's' }, c?.error || 'Lade Wetter …')); }
    const d = c.data, [, emo, text] = wmo(d.code), r = Math.round;
    const now = [h('div', { class: 'k' }, place.name),
      h('div', { class: 'row', style: 'gap:12px;margin-top:2px' }, h('span', { class: 'big-emoji' }, emo), h('span', { class: 'temp' }, `${r(d.temp)}°`)),
      h('div', { class: 's' }, `${text} · H ${r(d.days[0].max)}° T ${r(d.days[0].min)}°`)];
    if (w.size !== 'w') return widgetBox(w, 'weather', open, now);
    return widgetBox(w, 'weather split', open, h('div', { class: 'w-now' }, now),
      h('div', { class: 'w-days' }, d.days.slice(1).map((x) => h('div', { class: 'w-day' },
        h('b', {}, new Date(`${x.t}T12:00`).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')),
        h('span', { class: 'e' }, wmo(x.code)[1]), h('span', {}, `${r(x.max)}°`), h('small', {}, `${r(x.min)}°`)))));
  },
  kalender: (w) => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const cells = [...Array(first).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
    return widgetBox(w, 'cal', null,
      h('div', { class: 'cal-head' }, h('b', {}, now.toLocaleDateString('de-DE', { month: 'long' })), h('span', {}, `${y} · KW ${kw(now)}`)),
      h('div', { class: 'cal-grid' }, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => h('i', {}, d)),
        cells.map((d, i) => h('span', { class: (d === now.getDate() ? 'today' : '') + (i % 7 > 4 ? ' we' : '') }, d))));
  },
  countdown: (w) => {
    const o = w.opts;
    if (!o.date) return widgetBox(w, 'count', () => widgetSettings(w.id), h('div', { class: 'k' }, 'Countdown'), h('div', { class: 'big-emoji', style: 'margin-top:8px' }, '⏳'),
      h('div', { class: 's' }, 'Tippe hier, um ein Datum festzulegen'));
    const { t, days } = countdownTarget(o);
    const big = days === 0 ? 'Heute!' : String(Math.abs(days));
    const unit = days === 0 ? '' : Math.abs(days) === 1 ? 'Tag' : 'Tage';
    return widgetBox(w, 'count', null,
      h('div', { class: 'k' }, o.title || 'Countdown'),
      h('div', { class: 'cd' }, days < 0 && h('small', {}, 'vor '), big, unit && h('small', {}, ` ${unit}`)),
      h('div', { class: 's' }, `${t.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}${o.yearly ? ' · jährlich' : ''}`));
  },
  live: (w, sys) => {
    const show = w.opts.show?.length ? w.opts.show : ['cpu', 'ram', 'disk'];
    const tiles = {
      cpu: ['cpu', 'CPU', `${Math.round(sys.cpu)} %`], ram: ['mem', 'RAM', fmtBytes(sys.mem.used)],
      disk: ['disk', 'Speicher', fmtBytes(sys.disk.used)], net: ['arrowDown', 'Netz', sys.net ? fmtRate(sys.net.rx) : '–'],
    };
    return widgetBox(w, 'trio', () => go('#/usage'), show.filter((k) => tiles[k]).map((k) => {
      const [ic, label, v] = tiles[k];
      return h('div', { class: 't' }, icon(ic), h('b', {}, label), h('span', {}, v));
    }));
  },
  speicher: (w, sys) => {
    const p = pct(sys.disk.used, sys.disk.total);
    return widgetBox(w, '', () => go('#/usage'),
      h('div', { class: 'k' }, 'Speicher'),
      h('div', { class: 'v' }, fmtBytes(sys.disk.used), h('small', {}, ` / ${fmtBytes(sys.disk.total)}`)),
      h('div', { class: 's' }, `${fmtBytes(sys.disk.total - sys.disk.used)} frei`),
      h('div', { class: 'bar' + (p > 90 ? ' hot' : '') }, h('i', { style: `width:${p}%` })));
  },
  netzwerk: (w, sys) => {
    const n = sys.net;
    if (!n) return widgetBox(w, '', null, h('div', { class: 'k' }, 'Netzwerk'), h('div', { class: 's' }, 'Auf diesem System nicht messbar'));
    return widgetBox(w, 'net', () => go('#/usage'),
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', {}, h('div', { class: 'k' }, '↓ Rein'), h('div', { class: 'v sm' }, fmtRate(n.rx))),
        h('div', { style: 'text-align:right' }, h('div', { class: 'k' }, '↑ Raus'), h('div', { class: 'v sm' }, fmtRate(n.tx)))),
      miniSpark(state.history.rx, 'rx'));
  },
  apps: (w, sys, apps, running) => widgetBox(w, '', () => go('#/usage'),
    h('div', { class: 'k' }, 'Apps'),
    h('div', { class: 'v' }, `${running}`, h('small', {}, ` / ${apps.length}`)),
    h('div', { class: 's' }, apps.length ? (running === apps.length ? 'Alle laufen' : `${apps.length - running} gestoppt`) : 'Noch keine installiert'),
    h('div', { class: 'bar' }, h('i', { style: `width:${pct(running, apps.length)}%` }))),
  notiz: (w) => {
    // data-keep: patch() lässt das Feld in Ruhe, sonst ginge beim Abfragen der Fokus verloren
    const ta = h('textarea', { class: 'note-in', placeholder: 'Notiz schreiben …', 'aria-label': widgetLabel(w), spellcheck: 'false',
      oninput: (e) => { w.opts.text = e.target.value; saveWidgets(); } }, w.opts.text || '');
    return widgetBox(w, `note c-${NOTE_COLORS[w.opts.color] ? w.opts.color : 'gelb'}${w.opts.big ? ' big' : ''}`, null,
      h('div', { 'data-keep': `note-${w.id}`, style: 'display:contents' }, ta));
  },
  dateien: (w) => {
    const dir = w.opts.dir || '';
    const items = (state.recent[dir] || []).slice(0, 3);
    return widgetBox(w, 'recent', null,
      items.length ? items.map((f) => h('button', { class: 'rf', title: f.path, onclick: () => cd(f.path.split('/').slice(0, -1).join('/')) },
        h('span', { style: 'display:contents', html: fileSvg(fileType({ name: f.name })) }),
        h('span', { class: 'rn' }, f.name), h('small', {}, relTime(f.mtime))))
        : [h('div', { class: 'k' }, dir || 'Zuletzt geändert'), h('div', { class: 's', style: 'margin-top:auto' }, dir ? `Noch keine Dateien in „${dir}“` : 'Noch keine Dateien im Speicher')]);
  },
  foto: (w) => {
    const p = pickPhoto(w);
    if (!p) return widgetBox(w, 'photo', () => go('#/photos'), h('div', { class: 'k' }, 'Foto'), h('div', { class: 's', style: 'margin-top:auto' }, 'Leg Bilder in den Ordner „Fotos“'));
    return widgetBox(w, 'photo has', () => go('#/photos'),
      h('img', { src: `/api/files/raw?path=${encodeURIComponent(p.path)}`, alt: '' }),
      h('div', { class: 'cap' }, new Date(p.mtime).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })));
  },
};

// ---- Laden & Speichern ----
async function loadHome() {
  try {
    const [home, media] = await Promise.all([api('/api/home'), api('/api/media')]);
    state.home = { widgets: home.widgets, images: media.items.filter((m) => m.type === 'image') };
    await refreshRecent();
  } catch { state.home ||= { widgets: [], images: [] }; }
}
async function refreshRecent() {
  const dirs = [...new Set((state.home?.widgets || []).filter((w) => w.type === 'dateien').map((w) => w.opts.dir || ''))];
  await Promise.all(dirs.map(async (d) => {
    try { state.recent[d] = (await api(`/api/recent?dir=${encodeURIComponent(d)}`)).items; } catch { }
  }));
}
let widgetTimer;
function saveWidgets(now) {
  clearTimeout(widgetTimer);
  const send = () => api('/api/settings', { widgets: state.home.widgets }).catch((e) => toast(e.message, true));
  if (now) send(); else widgetTimer = setTimeout(send, 500);
}
const newWidgetId = (type) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

// ---- Bearbeiten-Modus ----
function enterEdit() {
  if (route()[0]) go('#/');
  state.editMode = true;
  updateDesk();
}
function exitEdit() {
  state.editMode = false;
  saveWidgets(true);
  updateDesk();
}
function removeWidget(id) {
  state.home.widgets = state.home.widgets.filter((w) => w.id !== id);
  photoPick.delete(id);
  saveWidgets(true); updateDesk();
}
function toggleSize(id) {
  const w = state.home.widgets.find((x) => x.id === id);
  w.size = w.size === 'w' ? 's' : 'w';
  saveWidgets(true); updateDesk();
}
function addWidget() {
  if (state.home.widgets.length >= MAX_WIDGETS) return toast(`Höchstens ${MAX_WIDGETS} Widgets`, true);
  let wrap;
  const grid = h('div', { class: 'wpick' }, Object.entries(WIDGET_INFO).map(([type, [name, desc]]) => {
    const count = state.home.widgets.filter((w) => w.type === type).length;
    return h('button', { class: 'wp-item', onclick: () => {
      wrap.remove();
      const w = { id: newWidgetId(type), type, size: type === 'wetter' || type === 'kalender' ? 'w' : 's', opts: {} };
      state.home.widgets.push(w);
      saveWidgets(true); refreshRecent().then(updateDesk); updateDesk();
      if (type === 'wetter' || type === 'countdown') widgetSettings(w.id);
    } }, h('span', { class: 'num' }, count ? `${count}×` : '+'), h('b', {}, name), h('small', {}, desc));
  }));
  wrap = dialog('Widget hinzufügen', 'Jedes Widget lässt sich danach verschieben, breit machen und anpassen. Manche, wie die Uhr, kannst du auch mehrfach nehmen.', { extra: grid, wide: true });
}

// Sortieren per Ziehen: das gezogene Widget tauscht live die Position mit dem unter dem Zeiger
const drag = { id: null, moved: false };
function startDrag(e, id) {
  if (e.target.closest('.wbtn') || e.button > 0) return;
  e.preventDefault();
  drag.id = id; drag.moved = false;
  updateDesk();
  const move = (ev) => {
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.widget-wrap[data-wid]')?.dataset.wid;
    if (!over || over === drag.id) return;
    const list = state.home.widgets;
    const from = list.findIndex((x) => x.id === drag.id), to = list.findIndex((x) => x.id === over);
    list.splice(to, 0, list.splice(from, 1)[0]);
    drag.moved = true;
    updateDesk();
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    drag.id = null; updateDesk();
    if (drag.moved) saveWidgets(true);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

// Einstellungen je Widget
function field(label, el, hint) {
  return h('label', { class: 'f' }, h('span', {}, label), el, hint && h('small', {}, hint));
}
function choice(options, value) {
  const el = h('div', { class: 'seg' });
  let cur = value;
  const draw = () => el.replaceChildren(...options.map(([v, l]) => h('button', { type: 'button', class: v === cur ? 'on' : null,
    onclick: () => { cur = v; draw(); } }, l)));
  draw();
  return { el, get: () => cur };
}
function check(label, value) {
  const box = h('input', { type: 'checkbox', checked: !!value });
  return { el: h('label', { class: 'chk' }, box, label), get: () => box.checked };
}
async function widgetSettings(id) {
  const w = state.home.widgets.find((x) => x.id === id);
  if (!w) return;
  const o = w.opts, fields = [];
  let apply;
  const labelIn = h('input', { class: 'input', value: o.label || '', placeholder: WIDGET_INFO[w.type][0], 'aria-label': 'Beschriftung' });
  const labelField = field('Beschriftung unter dem Widget', labelIn);

  if (w.type === 'uhr') {
    const style = choice([['digital', 'Digital'], ['analog', 'Analog']], o.style || 'digital');
    const tz = h('select', { class: 'input', 'aria-label': 'Zeitzone' }, TIMEZONES.map(([v, l]) => h('option', { value: v, selected: (o.tz || '') === v }, l)));
    const secs = check('Sekunden anzeigen', o.seconds);
    fields.push(field('Stil', style.el), field('Zeitzone', tz), secs.el, labelField);
    apply = () => { o.style = style.get(); o.tz = tz.value; o.seconds = secs.get(); };
  } else if (w.type === 'wetter') {
    const place = h('input', { class: 'input', value: o.place?.name || '', placeholder: 'z. B. Hamburg', 'aria-label': 'Ort' });
    const unit = choice([['c', '°C'], ['f', '°F']], o.unit || 'c');
    fields.push(field('Ort', place, 'Nur die Koordinaten des Orts gehen an Open-Meteo.'), field('Einheit', unit.el), labelField);
    apply = async () => {
      const q = place.value.trim();
      if (q && q !== o.place?.name) {
        const p = await geocode(q).catch(() => null);
        if (!p) throw new Error(`„${q}“ wurde nicht gefunden`);
        o.place = p;
      } else if (!q) delete o.place;
      o.unit = unit.get();
    };
  } else if (w.type === 'countdown') {
    const title = h('input', { class: 'input', value: o.title || '', placeholder: 'z. B. Urlaub', 'aria-label': 'Titel' });
    const date = h('input', { class: 'input', type: 'date', value: o.date || '', 'aria-label': 'Datum' });
    const yearly = check('Jedes Jahr wiederholen (z. B. Geburtstag)', o.yearly);
    fields.push(field('Wofür?', title), field('Datum', date), yearly.el);
    apply = () => { if (!date.value) throw new Error('Bitte ein Datum wählen'); o.title = title.value.trim(); o.date = date.value; o.yearly = yearly.get(); };
  } else if (w.type === 'notiz') {
    const color = choice(Object.entries(NOTE_COLORS).map(([k, l]) => [k, h('span', { class: `sw c-${k}`, title: l })]), o.color || 'gelb');
    color.el.classList.add('swatches');
    const big = check('Große Schrift', o.big);
    fields.push(field('Farbe', color.el), big.el, labelField);
    apply = () => { o.color = color.get(); o.big = big.get(); };
  } else if (w.type === 'live') {
    const cur = o.show?.length ? o.show : ['cpu', 'ram', 'disk'];
    const boxes = [['cpu', 'CPU'], ['ram', 'Arbeitsspeicher'], ['disk', 'Speicher'], ['net', 'Netzwerk (Download)']].map(([k, l]) => [k, check(l, cur.includes(k))]);
    fields.push(field('Angezeigte Werte', h('div', { class: 'chks' }, boxes.map(([, c]) => c.el))), labelField);
    apply = () => {
      const show = boxes.filter(([, c]) => c.get()).map(([k]) => k);
      if (!show.length) throw new Error('Mindestens einen Wert auswählen');
      o.show = show;
    };
  } else if (w.type === 'dateien') {
    const dirs = await api('/api/files?path=').then((r) => r.entries.filter((e) => e.dir).map((e) => e.name)).catch(() => []);
    const dir = h('select', { class: 'input', 'aria-label': 'Ordner' }, [['', 'Ganzer Speicher'], ...dirs.map((d) => [d, d])].map(([v, l]) =>
      h('option', { value: v, selected: (o.dir || '') === v }, l)));
    fields.push(field('Ordner', dir), labelField);
    apply = () => { o.dir = dir.value; };
  } else if (w.type === 'foto') {
    const every = choice([[0, 'Nie'], [30, '30 Sek.'], [300, '5 Min.'], [3600, '1 Std.']], o.every || 0);
    fields.push(field('Bild wechseln', every.el), labelField);
    apply = () => { o.every = every.get(); photoPick.delete(w.id); };
  }

  dialog(`${WIDGET_INFO[w.type][0]} anpassen`, null, {
    confirm: 'Übernehmen', extra: h('div', { class: 'wform' }, fields),
    onConfirm: async () => {
      try {
        await apply();
        if (fields.includes(labelField)) o.label = labelIn.value.trim();
        saveWidgets(true);
        await refreshRecent();
        updateDesk();
      } catch (x) { toast(x.message, true); }
    },
  });
}

// Nur die Startseite neu abgleichen (für Sekundentakt und Widget-Änderungen)
function updateDesk() {
  const desk = $('#desk');
  if (desk && state.status?.loggedIn) patch(desk, [viewDesktop()]);
}
// Uhren mit Sekunden oder Zeigern brauchen einen Sekundentakt
setInterval(() => {
  if (document.hidden || route()[0] || drag.id) return;
  if (state.home?.widgets.some((w) => w.type === 'uhr' && (w.opts.seconds || w.opts.style === 'analog'))) updateDesk();
}, 1000);

function viewDesktop() {
  const sys = state.system;
  const apps = installedApps();
  const running = apps.filter((a) => a.state === 'running').length;
  const d = h('div', { class: 'desktop', oncontextmenu: (e) => {
    if (e.target.closest('.app, textarea, input')) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      state.editMode ? { label: 'Fertig', fn: exitEdit } : { label: 'Widgets bearbeiten', fn: enterEdit },
      { label: 'Widget hinzufügen', fn: () => { enterEdit(); addWidget(); } },
      { label: 'Hintergrundbild ändern', fn: () => go('#/settings') }, '-',
      { label: 'App Store öffnen', fn: () => go('#/store') },
    ]);
  } },
  h('span', { html: LOGO, style: 'display:contents' }),
    h('h1', {}, `${greeting()}, ${state.status.name}.`));

  if (state.status.demo) d.append(h('div', { class: 'hinweis' }, 'Demo-Modus: Installationen werden nur simuliert.'));
  else if (!state.docker) d.append(h('div', { class: 'hinweis' }, 'Docker läuft nicht. Starte ', h('code', {}, 'colima start'), ' oder OrbStack.'));

  if (sys && state.home) {
    const list = state.home.widgets.map((w) => WIDGET_VIEWS[w.type] && WIDGET_VIEWS[w.type](w, sys, apps, running)).filter(Boolean);
    if (state.editMode && list.length < MAX_WIDGETS) list.push(h('div', { class: 'widget-wrap' },
      h('button', { class: 'widget add-w', onclick: addWidget }, icon('plus'), 'Widget hinzufügen'), h('span', {}, ' ')));
    if (list.length) d.append(h('div', {
      class: 'widgets' + (state.editMode ? ' editing' : ''),
      // Langes Drücken auf dem Handy startet den Bearbeiten-Modus
      onpointerdown: (e) => {
        if (state.editMode || e.pointerType === 'mouse' || e.target.closest('textarea')) return;
        const t = setTimeout(() => { navigator.vibrate?.(10); enterEdit(); }, 600);
        const stop = () => { clearTimeout(t); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); };
        addEventListener('pointerup', stop); addEventListener('pointercancel', stop);
      },
    }, list.map((el, i) => { el.style.setProperty('--i', i); return el; })));
    d.append(state.editMode
      ? h('div', { class: 'edit-bar' }, h('span', {}, 'Ziehen zum Sortieren · Pfeile für die Breite · Regler zum Anpassen'),
        h('button', { class: 'btn', onclick: exitEdit }, 'Fertig'))
      : h('button', { class: 'customize', onclick: enterEdit }, icon('sliders'), 'Widgets anpassen'));
  }

  const grid = h('div', { class: 'apps' });
  for (const [i, app] of apps.entries()) {
    const off = !isBusy(app) && app.state !== 'running';
    grid.append(h('a', {
      class: 'app' + (off ? ' off' : '') + (isBusy(app) ? ' busy' : ''), style: `--i:${i}`,
      onclick: (e) => launch(e.currentTarget),
      href: app.state === 'running' && !isBusy(app) && hasWeb(app) ? appUrl(app) : `#/store/${app.id}`,
      target: app.state === 'running' && !isBusy(app) && hasWeb(app) ? '_blank' : null, rel: 'noopener',
      title: `${app.name} – ${stateText(app)}`,
      oncontextmenu: (e) => { e.preventDefault(); appMenu(e.clientX, e.clientY, app); },
    }, appIcon(app), off || isBusy(app) ? h('span', { class: 'state' }, h('i', { class: 'dot ' + dotClass(app) })) : null, h('span', { class: 'name' }, app.name)));
  }
  grid.append(h('a', { class: 'app', href: '#/store', style: `--i:${apps.length}` },
    h('span', { class: 'ic', style: 'background:rgba(255,255,255,.08);font-size:30px;font-weight:300;color:rgba(255,255,255,.7)' }, '+'),
    h('span', { class: 'name' }, 'App Store')));
  d.append(grid);
  return d;
}

// Kurzer Hüpfer als Rückmeldung beim Öffnen (Dock und App-Icons)
function launch(el) {
  if (motionOff()) return;
  el.classList.remove('launch');
  void el.offsetWidth; // Animation neu starten
  el.classList.add('launch');
  el.addEventListener('animationend', () => el.classList.remove('launch'), { once: true });
}

function viewDock() {
  const dock = h('nav', { class: 'dock', 'aria-label': 'Dock' }, Object.entries(WINDOWS).filter(([k]) => !ext.windows[k]?.hidden).map(([k, label]) =>
    h('button', { 'data-page': k, 'data-tip': label, 'aria-label': label, html: DOCK_ART[k],
      onclick: (e) => { if (route()[0] !== k) launch(e.currentTarget); go(route()[0] === k ? '#/' : `#/${k}`); } })));
  // Vergrößerung wie im macOS-Dock: je näher der Zeiger, desto größer das Symbol
  dock.addEventListener('mousemove', (e) => {
    if (motionOff()) return;
    for (const b of dock.children) {
      const r = b.getBoundingClientRect();
      const s = 1 + 0.42 * Math.max(0, 1 - Math.abs(e.clientX - (r.left + r.width / 2)) / 120);
      b.style.transform = `translateY(${(-(s - 1) * 24).toFixed(1)}px) scale(${s.toFixed(3)})`;
    }
  });
  dock.addEventListener('mouseleave', () => { for (const b of dock.children) b.style.transform = ''; });
  return dock;
}

// ---------- Menüs & Dialoge ----------
function closeMenu() { document.querySelector('.menu')?.remove(); }
function openMenu(x, y, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' }, items.map((it) => it === '-' ? h('hr')
    : it && h('button', { class: it.danger ? 'danger' : null, onclick: () => { closeMenu(); it.fn(); } }, it.label)));
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  setTimeout(() => addEventListener('click', closeMenu, { once: true }), 0);
}
function appMenu(x, y, app) {
  const running = app.state === 'running';
  openMenu(x, y, [
    running && hasWeb(app) && { label: 'Öffnen', fn: () => window.open(appUrl(app), '_blank') },
    !hasWeb(app) && { label: 'Adresse kopieren', fn: () => copyConnect(app) },
    { label: 'Details', fn: () => go(`#/store/${app.id}`) }, '-',
    running ? { label: 'Stoppen', fn: () => control(app, 'stop') } : { label: 'Starten', fn: () => control(app, 'start') },
    { label: 'Neu starten', fn: () => control(app, 'restart') },
    { label: 'Aktualisieren', fn: () => control(app, 'update') },
    { label: 'Protokoll', fn: () => showLogs(app) },
    app.settings && { label: 'Einstellungen …', fn: () => appSettingsDialog(app, 'configure') }, '-',
    ...ext.appMenu.map((fn) => safeExt(() => fn(app))),
    { label: 'Deinstallieren', danger: true, fn: () => confirmUninstall(app) },
  ]);
}

function dialog(title, text, { confirm = 'OK', danger, extra, onConfirm, cancel = 'Abbrechen', wide }) {
  const wrap = h('div', { class: 'dialog-wrap', onclick: (e) => { if (e.target === wrap) wrap.remove(); } });
  const ok = onConfirm && h('button', { class: 'btn' + (danger ? ' danger' : ''), onclick: () => { wrap.remove(); onConfirm(); } }, confirm);
  wrap.append(h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title,
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && ok) ok.click(); } },
  h('h3', {}, title), text && h('p', {}, text), extra,
  h('div', { class: 'acts' }, h('button', { class: 'btn ghost', onclick: () => wrap.remove() }, onConfirm ? cancel : 'Schließen'), ok)));
  document.body.append(wrap);
  setTimeout(() => wrap.querySelector('input:not([type=checkbox])')?.focus(), 30);
  return wrap;
}

async function install(app, settings) {
  // Apps mit Einstellungen (z. B. VPN-Zugangsdaten) fragen vor dem Installieren nach
  if (app.settings && !settings) return appSettingsDialog(app, 'install');
  try { await api('/api/apps/install', { id: app.id, settings }); toast(`${app.name} wird installiert`); poll(); }
  catch (e) { toast(e.message, true); if (settings) appSettingsDialog(app, 'install', settings); }
}

// Formular aus der Beschreibung in app.json; Felder mit showIf erscheinen nur bei passender Auswahl
function appSettingsDialog(app, mode, prefill) {
  const cur = prefill || (mode === 'install'
    ? Object.fromEntries(app.settings.map((f) => [f.key, f.default ?? '']))
    : Object.fromEntries(app.settings.map((f) => [f.key, f.secret ? '' : app.settingsValues?.[f.key] ?? ''])));
  const inputs = {};
  const rows = app.settings.map((f) => {
    let el;
    if (f.options) {
      el = h('select', { class: 'input', 'aria-label': f.label, onchange: sync },
        f.options.map((o) => h('option', { value: o.value, selected: String(cur[f.key]) === String(o.value) }, o.label)));
    } else {
      const has = mode === 'configure' && f.secret && app.settingsValues?.[f.key];
      el = h('input', { class: 'input', type: f.secret ? 'password' : 'text', value: cur[f.key] || '', autocomplete: 'off', spellcheck: 'false',
        'aria-label': f.label, placeholder: has ? 'Hinterlegt – leer lassen, um es zu behalten' : f.placeholder || '' });
    }
    inputs[f.key] = el;
    const required = f.required === true || typeof f.required === 'object';
    const row = field(`${f.label}${required ? '' : ' (optional)'}`, el, f.help);
    row.dataset.key = f.key;
    return row;
  });
  // Abhängige Felder ein- und ausblenden
  function sync() {
    for (const [i, f] of app.settings.entries()) {
      const show = !f.showIf || Object.entries(f.showIf).every(([k, vals]) => vals.includes(inputs[k]?.value));
      rows[i].style.display = show ? '' : 'none';
    }
  }
  sync();
  const values = () => Object.fromEntries(app.settings.map((f) => {
    const visible = rows[app.settings.indexOf(f)].style.display !== 'none';
    return [f.key, visible ? inputs[f.key].value : ''];
  }));
  dialog(mode === 'install' ? `${app.name} einrichten` : `${app.name}: Einstellungen`,
    mode === 'install' ? 'Diese Angaben braucht die App, bevor sie starten kann. Du kannst sie später jederzeit ändern.'
      : 'Nach dem Speichern wird die App mit den neuen Werten neu gestartet.', {
      confirm: mode === 'install' ? 'Installieren' : 'Speichern und neu starten', wide: true,
      extra: h('div', { class: 'wform' }, rows),
      onConfirm: async () => {
        const v = values();
        if (mode === 'install') return install(app, v);
        try { await api('/api/apps/configure', { id: app.id, settings: v }); toast('Einstellungen gespeichert'); poll(); }
        catch (e) { toast(e.message, true); appSettingsDialog(app, 'configure', v); }
      },
    });
}
async function control(app, action) {
  try { await api('/api/apps/control', { id: app.id, action }); poll(); }
  catch (e) { toast(e.message, true); }
}
async function updateAll() {
  const list = state.apps.filter((a) => a.installed && !isBusy(a));
  if (!list.length) return toast('Keine installierten Apps');
  for (const a of list) await api('/api/apps/control', { id: a.id, action: 'update' }).catch(() => {});
  toast(`${list.length} ${list.length === 1 ? 'App wird' : 'Apps werden'} aktualisiert`);
  poll();
}
function confirmUninstall(app) {
  const box = h('input', { type: 'checkbox' });
  dialog(`${app.name} deinstallieren?`, 'Die Container dieser App werden entfernt. Deine Dateien im Speicher bleiben erhalten.', {
    confirm: 'Deinstallieren', danger: true, extra: h('label', {}, box, 'Auch Einstellungen und Daten der App löschen'),
    onConfirm: async () => {
      try { await api('/api/apps/uninstall', { id: app.id, deleteData: box.checked }); toast(`${app.name} wird deinstalliert`); poll(); }
      catch (e) { toast(e.message, true); }
    },
  });
}
async function showLogs(app) {
  const pre = h('pre', { class: 'log big' }, 'Lade …');
  const wrap = h('div', { class: 'dialog-wrap', onclick: (e) => { if (e.target === wrap) wrap.remove(); } },
    h('div', { class: 'dialog', style: 'width:min(920px,100%);height:min(640px,88vh)' },
      h('div', { class: 'row' }, h('h3', {}, `Protokoll: ${app.name}`), h('div', { class: 'spacer' }),
        h('button', { class: 'icon-btn', onclick: () => wrap.remove(), 'aria-label': 'Schließen' }, icon('x'))), pre));
  document.body.append(wrap);
  try { pre.textContent = (await api(`/api/apps/logs?id=${encodeURIComponent(app.id)}`)).text || '(leer)'; pre.scrollTop = pre.scrollHeight; }
  catch (e) { pre.textContent = e.message; }
}

// ---------- Fenster ----------
function viewWindow(page, args) {
  const builtin = { files: viewFiles, photos: viewPhotos, store: viewStore, settings: viewSettings, usage: viewUsage }[page];
  const content = builtin ? builtin(args) : ext.windows[page].render(args);
  return h('div', { class: 'win-wrap' },
    h('div', { class: 'bg', onclick: () => go('#/') }),
    h('div', { class: 'window', role: 'dialog', 'aria-label': WINDOWS[page] },
      h('button', { class: 'close', onclick: () => go('#/'), 'aria-label': 'Schließen' }, icon('x', 'stroke-width="3.2"')),
      content));
}

// ---------- Dateien ----------
async function loadFiles() {
  const f = state.files;
  try { f.entries = (await api(`/api/files?path=${encodeURIComponent(f.path)}`)).entries; f.error = null; }
  catch (e) { f.entries = []; f.error = e.message; }
  update();
}
function cd(p, { history = true } = {}) {
  const f = state.files;
  if (history && p !== f.path) { f.back.push(f.path); f.fwd = []; }
  f.path = p; f.q = ''; f.sel = null; f.entries = null;
  if (route()[0] !== 'files') go('#/files'); else update();
  loadFiles();
}
const FILE_TYPES = [
  [/\.(jpe?g|png|gif|webp|heic|avif|svg)$/i, 'Bild'], [/\.(mp4|mkv|mov|avi|webm|m4v)$/i, 'Video'],
  [/\.(mp3|flac|m4a|m4b|wav|ogg|aac)$/i, 'Audio'], [/\.pdf$/i, 'PDF'], [/\.(zip|rar|7z|tar|gz|dmg|iso)$/i, 'Archiv'],
  [/\.(txt|md|log|json|yml|yaml|csv)$/i, 'Text'], [/\.(docx?|odt|pages)$/i, 'Dokument'],
];
const fileType = (e) => (e.dir ? 'Ordner' : (FILE_TYPES.find(([re]) => re.test(e.name)) || [, 'Datei'])[1]);
const FOLDER_SVG = '<svg class="ficon" viewBox="0 0 24 24"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.2l2 2h8.8A2.5 2.5 0 0 1 22 8.5v1H2z" fill="#0f7f88"/><rect x="2" y="8" width="20" height="12" rx="2.3" fill="#18a3ad"/><rect x="2" y="8" width="20" height="2.4" rx="1.2" fill="#3cc7cf" opacity=".6"/></svg>';
const fileSvg = (t) => `<svg class="ficon" viewBox="0 0 24 24"><path d="M6 2.5h8l5 5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5v-16A2 2 0 0 1 6 2.5z" fill="#e8eaee"/><path d="M14 2.5v5h5" fill="#c4c8d0"/><text x="12" y="18" text-anchor="middle" font-size="5" font-weight="700" font-family="Inter,sans-serif" fill="${{ Bild: '#e2457f', Video: '#7a3cdc', Audio: '#0d8b94', PDF: '#d33', Archiv: '#a77b12' }[t] || '#6b7280'}">${{ Bild: 'IMG', Video: 'VID', Audio: 'AUD', PDF: 'PDF', Archiv: 'ZIP', Text: 'TXT', Dokument: 'DOC' }[t] || ''}</text></svg>`;

function viewFiles() {
  const f = state.files;
  const join = (...p) => p.filter(Boolean).join('/');
  const folders = ['Downloads', 'Dokumente', 'Fotos', 'Medien', 'Musik', 'Hörbücher'];
  const navItem = (label, p, ic) => h('button', { class: 'nav-item' + (f.path === p ? ' on' : ''), onclick: () => cd(p) }, ic, label);

  let entries = f.entries || [];
  if (f.q) entries = entries.filter((e) => e.name.toLowerCase().includes(f.q.toLowerCase()));
  const key = { name: (e) => e.name.toLowerCase(), mtime: (e) => e.mtime, size: (e) => (e.dir ? -1 : e.size), type: (e) => fileType(e) }[f.sort];
  entries = [...entries].sort((a, b) => (b.dir - a.dir) || (key(a) > key(b) ? f.dir : key(a) < key(b) ? -f.dir : 0));

  const open = (e) => {
    const p = join(f.path, e.name);
    if (e.dir) return cd(p);
    if (/^(Bild|Video|Audio|PDF|Text)$/.test(fileType(e))) window.open(`/api/files/raw?path=${encodeURIComponent(p)}`, '_blank');
    else location.href = `/api/files/download?path=${encodeURIComponent(p)}`;
  };
  const menuFor = (e, x, y) => {
    const p = join(f.path, e.name);
    openMenu(x, y, [
      { label: e.dir ? 'Öffnen' : 'Öffnen', fn: () => open(e) },
      !e.dir && { label: 'Herunterladen', fn: () => (location.href = `/api/files/download?path=${encodeURIComponent(p)}`) },
      { label: 'Umbenennen', fn: () => renameFile(p, e.name) },
      ...ext.fileMenu.map((fn) => safeExt(() => fn(e, p, loadFiles))), '-',
      { label: 'Löschen', danger: true, fn: () => dialog(`„${e.name}“ löschen?`, ext.deleteHint ? ext.deleteHint(e) : e.dir ? 'Der Ordner und alles darin werden endgültig gelöscht.' : 'Die Datei wird endgültig gelöscht.', {
        confirm: 'Löschen', danger: true, onConfirm: async () => { try { await api('/api/files/delete', { path: p }); toast('Gelöscht'); loadFiles(); } catch (x) { toast(x.message, true); } } }) },
    ]);
  };
  const thumb = (e) => {
    if (e.dir) return h('span', { style: 'display:contents', html: FOLDER_SVG });
    if (fileType(e) === 'Bild' && f.view === 'grid') return h('img', { class: 'thumb', src: `/api/files/raw?path=${encodeURIComponent(join(f.path, e.name))}`, alt: '', loading: 'lazy' });
    return h('span', { style: 'display:contents', html: fileSvg(fileType(e)) });
  };
  const sortBtn = (k, label) => h('button', { onclick: () => { if (f.sort === k) f.dir *= -1; else { f.sort = k; f.dir = 1; } update(); } },
    label, f.sort === k && h('span', { style: `display:inline-flex;width:12px;transform:rotate(${f.dir > 0 ? 0 : 180}deg)` }, icon('down')));

  let body;
  if (!f.entries) body = h('div', { class: 'empty' }, 'Lade …');
  else if (f.error) body = h('div', { class: 'empty' }, h('b', {}, 'Ordner nicht lesbar'), f.error);
  else if (!entries.length) body = h('div', { class: 'empty' }, h('b', {}, f.q ? 'Nichts gefunden' : 'Dieser Ordner ist leer'),
    f.q ? `Kein Eintrag enthält „${f.q}“.` : 'Zieh Dateien hierher oder nutze „Hochladen“.');
  else if (f.view === 'grid') body = h('div', { class: 'fgrid' }, entries.map((e) => h('div', {
    class: 'fcell' + (f.sel === e.name ? ' sel' : ''), title: e.name,
    onclick: () => { f.sel = e.name; update(); }, ondblclick: () => open(e),
    oncontextmenu: (ev) => { ev.preventDefault(); menuFor(e, ev.clientX, ev.clientY); },
  }, thumb(e), h('span', {}, e.name))));
  else body = h('div', { class: 'ftable' },
    h('div', { class: 'frow fhead' }, sortBtn('name', 'Name'), sortBtn('mtime', 'Geändert'), sortBtn('size', 'Größe'), sortBtn('type', 'Typ'), h('span')),
    entries.map((e) => h('div', {
      class: 'frow' + (f.sel === e.name ? ' sel' : ''),
      onclick: () => { f.sel = e.name; update(); }, ondblclick: () => open(e),
      oncontextmenu: (ev) => { ev.preventDefault(); menuFor(e, ev.clientX, ev.clientY); },
    },
    h('div', { class: 'fname' }, thumb(e), h('span', { title: e.name }, e.name)),
    h('span', { class: 'm' }, fmtDate(e.mtime)),
    h('span', { class: 'm' }, e.dir ? '—' : fmtBytes(e.size)),
    h('span', { class: 'm' }, fileType(e)),
    h('button', { class: 'more', 'aria-label': `Aktionen für ${e.name}`, onclick: (ev) => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); menuFor(e, r.right - 200, r.bottom + 4); } }, '⋯'))));

  const parts = f.path ? f.path.split('/') : [];
  const input = h('input', { type: 'file', multiple: true, style: 'display:none', onchange: (e) => uploadFiles([...e.target.files], f.path) });
  const home = `${genitiv(state.status.name)} Hafen`;
  return h('div', { class: 'split' },
    h('aside', { class: 'side' },
      h('h2', { class: 'win-title' }, 'Dateien'),
      navItem(home, '', icon('home')),
      h('h5', {}, 'Favoriten'),
      folders.map((p) => navItem(p, p, h('span', { style: 'display:contents', html: FOLDER_SVG.replace('class="ficon"', 'width="17" height="17"') }))),
      h('hr'),
      h('button', { class: 'nav-item', onclick: () => go('#/photos') }, icon('photos'), 'Fotos ansehen'),
      ext.filesSide.map((s) => h('button', { class: 'nav-item' + (s.active?.() ? ' on' : ''), onclick: s.onClick }, s.icon ? s.icon() : icon('folder'), s.label))),
    h('section', { class: 'main' },
      h('div', { class: 'toolbar' },
        h('button', { class: 'icon-btn', disabled: !f.back.length, 'aria-label': 'Zurück', onclick: () => { f.fwd.push(f.path); cd(f.back.pop(), { history: false }); } }, icon('left')),
        h('button', { class: 'icon-btn', disabled: !f.fwd.length, 'aria-label': 'Vor', onclick: () => { f.back.push(f.path); cd(f.fwd.pop(), { history: false }); } }, icon('right')),
        h('nav', { class: 'crumbs', 'aria-label': 'Pfad' },
          h('button', { onclick: () => cd('') }, f.path ? home : 'Startseite'),
          parts.map((p, i) => [icon('right'), h('button', { onclick: () => cd(parts.slice(0, i + 1).join('/')) }, p)])),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost small', onclick: newFolder }, icon('folderPlus'), 'Ordner'),
        h('button', { class: 'btn ghost small', onclick: () => input.click() }, icon('upload'), 'Hochladen'),
        h('label', { class: 'search', style: 'min-width:170px;height:32px' }, icon('search'),
          h('input', { placeholder: 'Suchen', value: f.q, 'aria-label': 'Im Ordner suchen', oninput: (e) => { f.q = e.target.value; update(); } })),
        h('div', { class: 'seg' },
          h('button', { class: f.view === 'grid' ? 'on' : null, 'aria-label': 'Symbole', onclick: () => { f.view = 'grid'; update(); } }, icon('grid', 'width="15" height="15"')),
          h('button', { class: f.view === 'list' ? 'on' : null, 'aria-label': 'Liste', onclick: () => { f.view = 'list'; update(); } }, icon('list', 'width="15" height="15"'))),
        input),
      h('div', {
        class: 'panel',
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
        ondragleave: (e) => e.currentTarget.classList.remove('drop'),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('drop'); uploadFiles([...e.dataTransfer.files], f.path); },
      }, body, f.entries && h('div', { class: 'foot' }, `${entries.length} ${entries.length === 1 ? 'Element' : 'Elemente'}`))));
}

async function uploadFiles(files, dir, after = loadFiles) {
  for (const file of files) {
    toast(`„${file.name}“ wird hochgeladen …`);
    const res = await fetch(`/api/files/upload?path=${encodeURIComponent(dir)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    if (!res.ok) toast((await res.json().catch(() => ({}))).error || `„${file.name}“ konnte nicht hochgeladen werden`, true);
  }
  if (files.length) toast(files.length === 1 ? 'Hochgeladen' : `${files.length} Dateien hochgeladen`);
  after();
}
function renameFile(p, old) {
  const inp = h('input', { class: 'input', value: old, 'aria-label': 'Neuer Name' });
  dialog('Umbenennen', null, { confirm: 'Umbenennen', extra: inp,
    onConfirm: async () => { try { await api('/api/files/rename', { path: p, name: inp.value }); toast('Umbenannt'); loadFiles(); } catch (x) { toast(x.message, true); } } });
  setTimeout(() => inp.setSelectionRange(0, old.lastIndexOf('.') > 0 ? old.lastIndexOf('.') : old.length), 40);
}
function newFolder() {
  const inp = h('input', { class: 'input', placeholder: 'Name des Ordners', 'aria-label': 'Name des Ordners' });
  dialog('Neuer Ordner', null, { confirm: 'Anlegen', extra: inp,
    onConfirm: async () => {
      try { await api('/api/files/mkdir', { path: [state.files.path, inp.value.replace(/[\\/]/g, '')].filter(Boolean).join('/') }); toast('Ordner angelegt'); loadFiles(); }
      catch (x) { toast(x.message, true); }
    } });
}

// ---------- Fotos ----------
async function loadMedia() {
  try { state.photos.items = (await api('/api/media')).items; } catch { state.photos.items = []; }
  update();
}
const durations = new Map();
function viewPhotos() {
  const p = state.photos;
  let items = p.items || [];
  if (p.filter === 'fotos') items = items.filter((m) => m.type === 'image');
  if (p.filter === 'videos') items = items.filter((m) => m.type === 'video');
  if (p.q) items = items.filter((m) => m.path.toLowerCase().includes(p.q.toLowerCase()));
  const total = items.reduce((s, m) => s + m.size, 0);
  const groupKey = (m) => {
    const d = new Date(m.mtime);
    if (p.group === 'jahr') return String(d.getFullYear());
    if (p.group === 'tag') return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };
  const groups = new Map();
  items.forEach((m, i) => { const k = groupKey(m); if (!groups.has(k)) groups.set(k, []); groups.get(k).push([m, i]); });
  const navItem = (k, label, ic) => h('button', { class: 'nav-item' + (p.filter === k ? ' on' : ''), onclick: () => { p.filter = k; update(); } }, icon(ic), label);
  const src = (m) => `/api/files/raw?path=${encodeURIComponent(m.path)}`;
  const input = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*', style: 'display:none', onchange: (e) => uploadFiles([...e.target.files], 'Fotos', loadMedia) });

  let body;
  if (!p.items) body = h('div', { class: 'empty' }, 'Lade …');
  else if (!items.length) body = h('div', { class: 'empty' }, h('b', {}, p.q ? 'Nichts gefunden' : 'Noch keine Fotos'),
    p.q ? `Kein Dateiname enthält „${p.q}“.` : 'Lade Bilder und Videos hoch oder lege sie in den Ordner „Fotos“.');
  else body = h('div', { style: `--th:${p.size}px` }, [...groups].map(([k, list]) => h('section', { class: 'ph-group' },
    h('h4', {}, k),
    h('div', { class: 'ph-grid' }, list.map(([m, i]) => h('button', { class: 'ph', title: m.name, onclick: () => lightbox(items, i) },
      m.type === 'image'
        ? h('img', { src: src(m), alt: m.name, loading: 'lazy', decoding: 'async' })
        : h('video', { src: `${src(m)}#t=0.5`, preload: 'metadata', muted: true, playsinline: true,
          onloadedmetadata: (e) => { durations.set(m.path, e.target.duration); const l = e.target.nextSibling; if (l) l.lastChild.textContent = fmtDur(e.target.duration); } }),
      m.type === 'video' && h('span', { class: 'dur' }, icon('play', 'width="10" height="10"'), durations.has(m.path) ? fmtDur(durations.get(m.path)) : '')))))));

  return h('div', { class: 'split' },
    h('aside', { class: 'side' },
      h('h2', { class: 'win-title' }, 'Fotos'),
      navItem('alle', 'Mediathek', 'library'), navItem('fotos', 'Fotos', 'image'), navItem('videos', 'Videos', 'video'),
      h('hr'),
      h('button', { class: 'nav-item', onclick: () => cd('Fotos') }, icon('folder'), 'Ordner „Fotos“'),
      h('div', { class: 'side-promo' }, h('b', {}, 'Fotos vom Handy sichern'),
        'Syncthing aus dem App Store gleicht den Ordner „Fotos“ automatisch mit deinem Smartphone ab.',
        h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn small', onclick: () => go('#/store/syncthing') }, 'Syncthing ansehen')))),
    h('section', { class: 'main' },
      h('div', { class: 'ph-head' },
        h('div', { style: 'margin-right:auto' }, h('h3', {}, { alle: 'Mediathek', fotos: 'Fotos', videos: 'Videos' }[p.filter]),
          h('p', {}, `${items.length} ${items.length === 1 ? 'Element' : 'Elemente'} · ${fmtBytes(total)}`)),
        h('div', { class: 'seg' }, [['jahr', 'Jahre'], ['monat', 'Monate'], ['tag', 'Tage']].map(([k, l]) =>
          h('button', { class: p.group === k ? 'on' : null, onclick: () => { p.group = k; update(); } }, l))),
        h('div', { class: 'slider' },
          h('button', { 'aria-label': 'Kleiner', onclick: () => { p.size = Math.max(90, p.size - 30); update(); } }, '−'),
          h('input', { type: 'range', min: 90, max: 320, step: 10, value: p.size, 'aria-label': 'Vorschaugröße', oninput: (e) => { p.size = +e.target.value; update(); } }),
          h('button', { 'aria-label': 'Größer', onclick: () => { p.size = Math.min(320, p.size + 30); update(); } }, '+')),
        h('button', { class: 'btn ghost', style: 'height:38px', onclick: () => input.click() }, icon('upload'), 'Hochladen'),
        h('label', { class: 'search', style: 'min-width:170px' }, icon('search'),
          h('input', { placeholder: 'Suchen', value: p.q, 'aria-label': 'Fotos suchen', oninput: (e) => { p.q = e.target.value; update(); } })),
        input),
      h('div', { style: 'overflow-y:auto;flex:1;min-height:0;padding-right:4px' }, body)));
}
const fmtDur = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

function lightbox(items, index) {
  let i = index;
  const stage = h('div', { style: 'display:contents' });
  const cap = h('div', { class: 'cap' });
  const show = () => {
    const m = items[i];
    const src = `/api/files/raw?path=${encodeURIComponent(m.path)}`;
    stage.replaceChildren(m.type === 'image' ? h('img', { src, alt: m.name }) : h('video', { src, controls: true, autoplay: true }));
    cap.textContent = `${m.name} · ${fmtDate(m.mtime)} · ${i + 1} von ${items.length}`;
  };
  const step = (d) => { i = (i + d + items.length) % items.length; show(); };
  const close = () => { wrap.remove(); removeEventListener('keydown', keys, true); };
  const keys = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  };
  const wrap = h('div', { class: 'lightbox', onclick: (e) => { if (e.target === wrap) close(); } }, cap, stage,
    items.length > 1 && h('button', { class: 'icon-btn nav l', 'aria-label': 'Vorheriges', onclick: () => step(-1) }, icon('left')),
    items.length > 1 && h('button', { class: 'icon-btn nav r', 'aria-label': 'Nächstes', onclick: () => step(1) }, icon('right')),
    h('button', { class: 'icon-btn x', 'aria-label': 'Schließen', onclick: close }, icon('x')));
  addEventListener('keydown', keys, true);
  show();
  document.body.append(wrap);
}

// ---------- App Store ----------
function viewStore(args) {
  if (args[0]) return viewAppDetail(args[0]);
  const s = state.store;
  const cats = [...new Set(state.apps.map((a) => a.category))].sort((a, b) => a.localeCompare(b, 'de'));
  const card = (a, i = 0) => h('div', { class: 'acard', role: 'button', tabindex: 0, style: `--i:${Math.min(i, 14)}`, onclick: () => go(`#/store/${a.id}`),
    onkeydown: (e) => { if (e.key === 'Enter') go(`#/store/${a.id}`); } },
  appIcon(a), h('b', {}, a.name), h('span', {}, a.tagline),
  (a.installed || isBusy(a)) && h('div', { class: 'inst' }, h('i', { class: 'dot ' + dotClass(a) }), isBusy(a) ? stateText(a) : 'Installiert'));
  const lcard = (a, i = 0) => h('div', { class: 'lcard', role: 'button', tabindex: 0, style: `--i:${Math.min(i, 14)}`, onclick: () => go(`#/store/${a.id}`),
    onkeydown: (e) => { if (e.key === 'Enter') go(`#/store/${a.id}`); } },
  appIcon(a), h('div', { class: 't' }, h('b', {}, a.name), h('span', {}, a.tagline)),
  a.installed || isBusy(a) ? h('span', { class: 'muted', style: 'font-size:12px' }, isBusy(a) ? 'Arbeitet …' : 'Installiert')
    : h('button', { class: 'btn small ghost', disabled: !state.docker, onclick: (e) => { e.stopPropagation(); install(a); } }, 'Installieren'));

  let content;
  if (s.q) {
    const q = s.q.toLowerCase();
    const hits = state.apps.filter((a) => `${a.name} ${a.tagline} ${a.category} ${a.description}`.toLowerCase().includes(q));
    content = hits.length ? h('div', { class: 'list-cards' }, hits.map(lcard))
      : h('div', { class: 'empty' }, h('b', {}, 'Keine App gefunden'), `Nichts passt zu „${s.q}“.`);
  } else if (s.cat === 'entdecken') {
    const feat = FEATURED.map((id) => state.apps.find((a) => a.id === id)).filter(Boolean);
    const busy = state.apps.filter(isBusy);
    const car = h('div', { class: 'carousel', onscroll: (e) => {
      const n = Math.round(e.target.scrollLeft / (e.target.firstChild?.offsetWidth + 16 || 1));
      if (n !== s.slide) { s.slide = n; e.target.parentNode.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === n)); }
    } }, feat.map((a) => h('div', { class: 'banner', style: `--c:${catColor(a.category)}`, onclick: () => go(`#/store/${a.id}`) },
      h('span', { class: 'big-ic', style: 'position:absolute;inset:0;pointer-events:none' }, appIcon(a, 210)),
      h('small', {}, a.name), h('h3', {}, a.description.split('. ')[0].replace(/\.$/, '') + '.'))));
    const scrollTo = (d) => { const w = car.firstChild.offsetWidth + 16; car.scrollBy({ left: d * w, behavior: 'smooth' }); };
    content = h('div', {},
      busy.length > 0 && h('div', { class: 'notice' }, appIcon(busy[0], 44),
        h('div', { style: 'flex:1' }, h('b', {}, stateText(busy[0])), h('span', {}, busy.length > 1 ? `${busy[0].name} und ${busy.length - 1} weitere` : busy[0].name)),
        h('button', { class: 'btn', onclick: () => go(`#/store/${busy[0].id}`) }, 'Ansehen')),
      car,
      h('div', { class: 'car-nav' }, h('div', { class: 'dots' }, feat.map((_, j) => h('i', { class: j === s.slide ? 'on' : null }))),
        h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onclick: () => scrollTo(-1) }, icon('left')),
        h('button', { class: 'icon-btn', 'aria-label': 'Weiter', onclick: () => scrollTo(1) }, icon('right'))),
      h('div', { class: 'sec-title' }, h('small', {}, 'Empfohlen'), h('h3', {}, 'Beliebt bei Heimservern')),
      h('div', { class: 'cards' }, state.apps.filter((a) => !FEATURED.includes(a.id)).slice(0, 12).map(card)),
      cats.map((c) => [h('div', { class: 'sec-title' }, h('h3', { class: 'with-ic' }, catIcon(c, 24), c)),
        h('div', { class: 'list-cards' }, state.apps.filter((a) => a.category === c).map(lcard))]));
  } else {
    content = h('div', { class: 'cards' }, state.apps.filter((a) => a.category === s.cat).map(card));
  }

  return h('div', { class: 'win-body' },
    h('div', { class: 'store-head' },
      h('h2', { class: 'win-title' }, 'App Store'),
      h('label', { class: 'search', style: 'min-width:240px' }, icon('search'),
        h('input', { class: 'autofocus', placeholder: 'Apps suchen', value: s.q, 'aria-label': 'Apps suchen', oninput: (e) => { s.q = e.target.value; update(); } })),
      ext.storeActions.map((a) => h('button', { class: 'btn ghost', style: 'height:38px', onclick: a.onClick }, a.icon ? a.icon() : null, a.label)),
      state.apps.some((a) => a.installed) && h('button', { class: 'btn ghost', style: 'height:38px', onclick: updateAll }, icon('refresh'), 'Alle aktualisieren')),
    !s.q && h('div', { class: 'cats' },
      h('button', { class: 'cat' + (s.cat === 'entdecken' ? ' on' : ''), onclick: () => { s.cat = 'entdecken'; update(); } }, catIcon('Entdecken'), 'Entdecken'),
      cats.map((c) => h('button', { class: 'cat' + (s.cat === c ? ' on' : ''), onclick: () => { s.cat = c; update(); } }, catIcon(c), c))),
    content);
}
const CAT_COLORS = { 'Medien': '#7a3cdc', 'Dateien': '#1d6fe0', 'Smart Home': '#0f9d77', 'KI': '#d0406a', 'Produktivität': '#3a8a2e', 'Fotos': '#e0702b', 'Netzwerk': '#0d8b94', 'Sicherheit': '#b8323c', 'Entwicklung': '#5b6478', 'Werkzeuge': '#6b6f7a', 'Downloads': '#2a7fd4', 'Finanzen': '#2f9e5b', 'Lesen': '#b5651d', 'Zuhause': '#c2452f', 'Spiele': '#4f46e5' };
const catColor = (c) => CAT_COLORS[c] || '#0d8b94';

function viewAppDetail(id) {
  const app = state.apps.find((a) => a.id === id);
  const back = h('button', { class: 'back', onclick: () => go('#/store') }, icon('left'), 'App Store');
  if (!app) return h('div', { class: 'win-body' }, back, h('div', { class: 'empty' }, h('b', {}, 'App nicht gefunden'), 'Diese App gibt es nicht im Store.'));
  const busy = isBusy(app);
  const acts = h('div', { class: 'acts' });
  if (busy) acts.append(h('button', { class: 'btn big', disabled: true }, stateText(app)));
  else if (!app.installed) acts.append(h('button', { class: 'btn big', disabled: !state.docker, onclick: () => install(app) }, 'Installieren'));
  else acts.append(...[
    h('button', { class: 'btn ghost big', 'aria-label': 'Weitere Aktionen', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); appMenu(r.left, r.bottom + 6, app); } }, '⋯'),
    app.settings && h('button', { class: 'btn ghost big', onclick: () => appSettingsDialog(app, 'configure') }, icon('sliders'), 'Einstellungen'),
    app.state === 'running'
      ? (hasWeb(app) ? h('a', { class: 'btn big', href: appUrl(app), target: '_blank', rel: 'noopener' }, 'Öffnen')
        : h('button', { class: 'btn big', onclick: () => copyConnect(app) }, 'Adresse kopieren'))
      : h('button', { class: 'btn big', onclick: () => control(app, 'start') }, 'Starten'),
  ].filter(Boolean));

  const job = app.job && (app.job.running || app.job.error || Date.now() - app.job.ended < 15000) && [
    h('pre', { class: 'log' + (app.job.error ? ' tall' : '') }, app.job.log.join('\n')),
    app.job.error && h('button', { class: 'btn ghost small', style: 'margin-top:10px',
      onclick: () => navigator.clipboard?.writeText(app.job.log.join('\n')).then(() => toast('Protokoll kopiert')) }, 'Protokoll kopieren'),
  ];
  return h('div', { class: 'win-body' }, back,
    h('div', { class: 'detail-head' }, appIcon(app, 100),
      h('div', {}, h('h2', {}, app.name), h('p', {}, app.tagline)), acts),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'box' }, h('h4', {}, 'Über diese App'), h('p', {}, app.description), job),
      h('div', { style: 'display:flex;flex-direction:column;gap:18px' },
        app.vpn && app.installed && !busy && vpnBox(app),
        app.logCredentials && app.installed && !busy && logCredsBox(app),
        h('div', { class: 'box' }, h('h4', {}, 'Informationen'), h('dl', { class: 'kv' },
          h('dt', {}, 'Status'), h('dd', {}, app.installed || busy ? h('span', { class: 'row', style: 'justify-content:flex-end;gap:7px' }, h('i', { class: 'dot ' + dotClass(app) }), stateText(app)) : 'Nicht installiert'),
          h('dt', {}, 'Kategorie'), h('dd', {}, app.category),
          h('dt', {}, 'Port'), h('dd', {}, app.extraPorts ? `${app.port} (+ ${app.extraPorts.join(', ')})` : app.port),
          !hasWeb(app) && connectHosts().map((host, i) => {
            const addr = `${host}:${app.port}`;
            return [h('dt', {}, i === 0 ? 'Verbinden mit' : 'oder per IP'), h('dd', {}, h('span', { class: 'cred', title: 'Zum Kopieren klicken',
              onclick: () => navigator.clipboard?.writeText(addr).then(() => toast(`${addr} kopiert`)) }, addr))];
          }),
          app.website && [h('dt', {}, 'Webseite'), h('dd', {}, h('a', { href: app.website, target: '_blank', rel: 'noopener' }, new URL(app.website).hostname))]),
        !hasWeb(app) && app.connectHint && h('p', { class: 'cred-hint' }, app.connectHint)),
        app.credentials && h('div', { class: 'box' }, h('h4', {}, 'Zugangsdaten'), h('dl', { class: 'kv' },
          Object.entries(app.credentials).map(([k, v]) => [h('dt', {}, k), h('dd', {}, h('span', { class: 'cred', title: 'Zum Kopieren klicken',
            onclick: () => navigator.clipboard?.writeText(v).then(() => toast(`${k} kopiert`)) }, v))]))))));
}

// VPN-Zustand einer Gluetun-App, alle paar Sekunden neu abgefragt, solange die App-Seite offen ist
const vpnCache = new Map();
async function loadVpn(id) {
  const c = vpnCache.get(id);
  if (c?.loading || (c && Date.now() - c.at < 5000)) return;
  vpnCache.set(id, { ...c, loading: true, at: Date.now() });
  try { vpnCache.set(id, { at: Date.now(), data: await api(`/api/apps/vpn?id=${encodeURIComponent(id)}`) }); }
  catch (e) { vpnCache.set(id, { at: Date.now(), error: e.message }); }
  update();
}
function vpnBox(app) {
  loadVpn(app.id);
  const c = vpnCache.get(app.id), d = c?.data;
  let dot = 'busy', title = 'Wird geprüft …', lines = [];
  if (c?.error) { dot = 'exited'; title = 'Status nicht abrufbar'; lines = [c.error]; }
  else if (d) {
    if (d.state !== 'running') { dot = 'exited'; title = 'VPN-Container läuft nicht'; }
    else if (d.health === 'healthy') { dot = 'running'; title = 'VPN verbunden'; }
    else if (d.health === 'unhealthy') { dot = 'exited'; title = 'Keine VPN-Verbindung'; }
    else { title = 'Verbindung wird aufgebaut …'; }
    if (d.health === 'healthy' && d.ip) lines.push(h('span', {}, 'Öffentliche IP ', h('b', {}, d.ip)), d.where);
    if (d.health !== 'healthy') {
      lines.push('qBittorrent hat ohne Tunnel kein Internet – deine echte IP bleibt verborgen.');
      if (d.error) lines.push(h('code', { class: 'vpn-err' }, d.error));
      lines.push(h('button', { class: 'btn small', onclick: () => appSettingsDialog(app, 'configure') }, 'Zugangsdaten prüfen'));
    }
  }
  return h('div', { class: 'box vpn' }, h('h4', {}, 'VPN-Status'),
    h('div', { class: 'row', style: 'gap:9px;font-weight:600;font-size:14px' }, h('i', { class: 'dot ' + dot }), title),
    lines.filter(Boolean).map((l) => h('div', { class: 'vpn-line' }, l)));
}

// Zugangsdaten, die die App nur in ihr Protokoll schreibt (qBittorrent-Einmalpasswort)
const credsCache = new Map();
async function loadLogCreds(id) {
  const c = credsCache.get(id);
  if (c?.loading || (c && Date.now() - c.at < 8000)) return;
  credsCache.set(id, { ...c, loading: true, at: Date.now() });
  try { credsCache.set(id, { at: Date.now(), data: await api(`/api/apps/creds?id=${encodeURIComponent(id)}`) }); }
  catch (e) { credsCache.set(id, { at: Date.now(), error: e.message }); }
  update();
}
function logCredsBox(app) {
  loadLogCreds(app.id);
  const c = credsCache.get(app.id), d = c?.data;
  const copy = (k, v) => h('span', { class: 'cred', title: 'Zum Kopieren klicken', onclick: () => navigator.clipboard?.writeText(v).then(() => toast(`${k} kopiert`)) }, v);
  let pw, hint;
  if (c?.error) { pw = '—'; hint = c.error; }
  else if (!d) pw = 'Wird gelesen …';
  else if (d.own) { pw = 'von dir festgelegt'; hint = 'Du hast in qBittorrent ein eigenes Passwort gesetzt – das Startpasswort gilt nicht mehr.'; }
  else if (d.password) { pw = copy('Passwort', d.password); hint = app.logCredentials.hint || 'Einmal-Passwort: Es ändert sich bei jedem Neustart der App. Leg nach dem Login unter Werkzeuge → Optionen → WebUI ein eigenes fest.'; }
  else { pw = 'noch nicht vergeben'; hint = 'qBittorrent startet gerade – das Passwort erscheint hier, sobald es im Protokoll steht.'; }
  return h('div', { class: 'box' }, h('h4', {}, 'Zugangsdaten'),
    h('dl', { class: 'kv' }, h('dt', {}, 'Benutzer'), h('dd', {}, d ? copy('Benutzer', d.user) : '…'), h('dt', {}, 'Passwort'), h('dd', {}, pw)),
    hint && h('p', { class: 'cred-hint' }, hint));
}

// ---------- Einstellungen ----------
function viewSettings() {
  const sys = state.system || {};
  const ip = (sys.hosts || []).find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)) || '—';
  const wp = wallpaperStyle();
  const upload = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', style: 'display:none', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const res = await fetch('/api/wallpaper', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Hochladen fehlgeschlagen');
      state.status = await api('/api/status'); applyWallpaper(); update(); toast('Hintergrundbild gesetzt');
    } catch (x) { toast(x.message, true); }
  } });
  const setWp = async (k) => {
    state.status.wallpaper = k; applyWallpaper(); update();
    await api('/api/settings', { wallpaper: k }).catch((x) => toast(x.message, true));
  };

  const item = ({ ic, title, desc, right, onclick, tab }) => ({ tab, text: `${title} ${desc}`.toLowerCase(),
    el: h('div', { class: 'item' + (onclick ? ' click' : ''), onclick },
      h('span', { class: 'sq' }, icon(ic)), h('div', { class: 't' }, h('b', {}, title), h('span', {}, desc)),
      right ?? (onclick && h('span', { style: 'display:contents' }, icon('right', 'class="chev"'))))});
  const groups = [
    [
      item({ tab: 'konto', ic: 'user', title: 'Name', desc: `Du wirst als „${state.status.name}“ begrüßt`, onclick: editName }),
      item({ tab: 'konto', ic: 'key', title: 'Passwort', desc: 'Das Passwort für die Anmeldung an Hafen ändern', onclick: editPassword }),
      item({ tab: 'konto', ic: 'image', title: 'Hintergrundbild', desc: 'Wähle ein Motiv oder lade ein eigenes Bild hoch',
        right: h('div', { class: 'wps' },
          Object.entries(WALLPAPERS).map(([k, l]) => h('button', { class: `wp-${k}` + (state.status.wallpaper === k ? ' on' : ''), title: l, 'aria-label': l, onclick: () => setWp(k) })),
          state.status.wallpaperVersion ? h('button', { class: state.status.wallpaper === 'eigenes' ? 'on' : null, title: 'Eigenes Bild', 'aria-label': 'Eigenes Bild',
            style: `background-image:url(/api/wallpaper?v=${state.status.wallpaperVersion})`, onclick: () => setWp('eigenes') }) : null,
          h('button', { class: 'add', title: 'Eigenes Bild hochladen', 'aria-label': 'Eigenes Bild hochladen', onclick: () => upload.click() }, '+'), upload) }),
      item({ tab: 'konto', ic: 'grid', title: 'Widgets', desc: `${state.home?.widgets.length || 0} auf der Startseite – hinzufügen, sortieren, anpassen`, onclick: enterEdit }),
    ],
    [
      item({ tab: 'system', ic: 'globe', title: 'Erreichbarkeit', desc: 'Adressen, unter denen du Hafen im Heimnetz öffnest', onclick: showHosts }),
      item({ tab: 'system', ic: 'sparkle', title: 'KI-Assistent', onclick: () => aiSettingsDialog(),
        desc: state.ai?.cfg?.ready ? `${state.ai.cfg.providers?.[state.ai.cfg.provider]?.label || state.ai.cfg.provider} · ${state.ai.cfg.model}` : 'Die Kugel in der Suche mit Ollama, OpenAI oder Claude verbinden',
        right: h('span', { class: 'row', style: 'gap:7px;font-size:13px' }, h('i', { class: 'dot ' + (state.ai?.cfg?.ready ? 'running' : 'exited') }), state.ai?.cfg?.ready ? 'Bereit' : 'Einrichten') }),
      item({ tab: 'system', ic: 'shield', title: 'Fernzugriff von unterwegs', desc: remoteDesc(), onclick: showRemote,
        right: h('span', { class: 'row', style: 'gap:7px;font-size:13px' }, h('i', { class: 'dot ' + (state.remote?.state === 'Running' ? 'running' : 'exited') }),
          state.remote?.state === 'Running' ? 'Aktiv' : state.remote?.installed ? 'Aus' : 'Einrichten') }),
      item({ tab: 'system', ic: 'box', title: 'Docker', desc: sys.docker ? `Läuft, Version ${sys.dockerVersion}` : 'Nicht erreichbar – starte Colima, OrbStack oder Docker Desktop',
        right: h('span', { class: 'row', style: 'gap:7px;font-size:13px' }, h('i', { class: 'dot ' + (sys.docker ? 'running' : 'exited') }), sys.docker ? 'Verbunden' : 'Getrennt') }),
      item({ tab: 'system', ic: 'folder', title: 'Speicherort', desc: sys.storage || '', onclick: () => cd('') }),
      item({ tab: 'system', ic: 'refresh', title: 'Alle Apps aktualisieren', desc: 'Lädt für jede installierte App die neueste Version', onclick: updateAll }),
      item({ tab: 'system', ic: 'play', title: 'Animationen', desc: 'Bewegungen beim Öffnen, im Dock und auf der Startseite',
        right: h('button', { class: 'switch' + (motionPref === 'an' ? ' on' : ''), role: 'switch', 'aria-checked': motionPref === 'an' ? 'true' : 'false', 'aria-label': 'Animationen',
          onclick: (e) => { setMotion(motionPref !== 'an'); e.currentTarget.classList.toggle('on', motionPref === 'an'); e.currentTarget.setAttribute('aria-checked', motionPref === 'an'); } }, h('i')) }),
      item({ tab: 'system', ic: 'info', title: 'Über Hafen', desc: `Version ${sys.version || ''}${sys.demo ? ' · Demo-Modus' : ''} · ${sys.platform || ''}/${sys.arch || ''}` }),
    ],
  ];
  const extItems = ext.settings.map((fn) => safeExt(() => fn(sys))).filter(Boolean).map(item);
  if (extItems.length) groups.splice(1, 0, extItems);
  const q = state.settingsQ.toLowerCase(), tab = state.settingsTab;
  const shown = groups.map((g) => g.filter((it) => (tab === 'alle' || it.tab === tab) && (!q || it.text.includes(q)))).filter((g) => g.length);

  const stat = (label, used, total, p) => h('div', { class: 'stat' },
    h('div', { class: 'row' }, label, h('b', {}, used, total && h('small', {}, ` / ${total}`))),
    h('div', { class: 'bar brand' }, h('i', { style: `width:${p}%` })));

  return h('div', { class: 'win-body' }, h('div', { class: 'settings' },
    h('aside', { class: 'profile' },
      h('h2', { class: 'win-title', style: 'margin-bottom:8px' }, 'Einstellungen'),
      h('div', { class: 'preview' },
        h('div', { class: 'pv-bg ' + wp.cls, style: wp.css }),
        h('div', { class: 'pv' }, h('span', { html: LOGO.replace('class="logo"', 'width="16" height="16"'), style: 'display:contents' }),
          `${greeting()}, ${state.status.name}.`, h('div', { class: 'row', style: 'gap:5px' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'avatar' }, state.status.name[0].toUpperCase())),
      h('h3', {}, genitiv(state.status.name), h('span', {}, ' Hafen')),
      h('div', { class: 'info' }, h('dl', { class: 'kv' },
        h('dt', {}, 'Läuft'), h('dd', {}, `Hafen ${sys.version || ''}`),
        h('dt', {}, 'Gerät'), h('dd', {}, sys.model || '—'),
        h('dt', {}, 'Lokale IP'), h('dd', {}, ip),
        h('dt', {}, 'Betriebszeit'), h('dd', {}, sys.uptime ? fmtUptime(sys.uptime) : '—'))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn ghost small', onclick: logout }, 'Abmelden'),
        h('button', { class: 'btn ghost small', onclick: restartHafen }, 'Hafen neu starten')),
      sys.mem && [
        stat('Speicherplatz', fmtBytes(sys.disk.used), fmtBytes(sys.disk.total), pct(sys.disk.used, sys.disk.total)),
        stat('Arbeitsspeicher', fmtBytes(sys.mem.used), fmtBytes(sys.mem.total), pct(sys.mem.used, sys.mem.total)),
        stat('CPU', `${Math.round(sys.cpu)} %`, null, Math.round(sys.cpu))]),
    h('section', {},
      h('div', { class: 'set-head' },
        h('div', { class: 'seg' }, [['alle', 'Alle'], ['konto', 'Konto'], ['system', 'System']].map(([k, l]) =>
          h('button', { class: tab === k ? 'on' : null, onclick: () => { state.settingsTab = k; update(); } }, l))),
        h('label', { class: 'search' }, icon('search'),
          h('input', { placeholder: 'Suche', value: state.settingsQ, 'aria-label': 'Einstellungen durchsuchen', oninput: (e) => { state.settingsQ = e.target.value; update(); } }))),
      shown.length ? shown.map((g) => h('div', { class: 'group' }, g.map((it) => it.el)))
        : h('div', { class: 'empty' }, h('b', {}, 'Keine Einstellung gefunden'), `Nichts passt zu „${state.settingsQ}“.`))));
}

function editName() {
  const inp = h('input', { class: 'input', value: state.status.name, 'aria-label': 'Name' });
  dialog('Name ändern', 'So begrüßt dich Hafen auf der Startseite.', { confirm: 'Speichern', extra: inp,
    onConfirm: async () => {
      try { await api('/api/settings', { name: inp.value }); state.status.name = inp.value.trim(); toast('Name gespeichert'); update(); }
      catch (x) { toast(x.message, true); }
    } });
}
function editPassword() {
  const cur = h('input', { class: 'input', type: 'password', placeholder: 'Aktuelles Passwort', autocomplete: 'current-password', 'aria-label': 'Aktuelles Passwort' });
  const nxt = h('input', { class: 'input', type: 'password', placeholder: 'Neues Passwort (mind. 8 Zeichen)', autocomplete: 'new-password', 'aria-label': 'Neues Passwort' });
  dialog('Passwort ändern', null, { confirm: 'Passwort ändern', extra: [cur, nxt],
    onConfirm: async () => {
      try { await api('/api/password', { current: cur.value, next: nxt.value }); toast('Passwort geändert'); }
      catch (x) { toast(x.message, true); }
    } });
}
function showHosts() {
  const port = location.port ? `:${location.port}` : '';
  const hosts = state.system?.hosts || [];
  dialog('Erreichbarkeit', 'Öffne eine dieser Adressen auf einem Gerät im selben WLAN. Am iPhone kannst du die Seite über „Teilen → Zum Home-Bildschirm“ wie eine App ablegen.', {
    extra: h('dl', { class: 'kv' }, hosts.map((x) => [h('dt', {}, x === 'localhost' ? 'Auf diesem Mac' : x.endsWith('.local') ? 'Im Heimnetz'
      : isTailscaleHost(x) ? 'Unterwegs (Tailscale)' : 'Über die IP'),
      h('dd', {}, h('a', { href: `http://${x}${port}` }, `${x}${port}`))])) });
}

// ---------- Fernzugriff (Tailscale) ----------
const isTailscaleHost = (x) => !!state.remote && [state.remote.short, state.remote.name, state.remote.ip].includes(x);
async function loadRemote() {
  try { state.remote = await api('/api/remote'); } catch { }
  update();
}
function remoteDesc() {
  const r = state.remote;
  if (!r) return 'Hafen von überall öffnen – sicher über Tailscale';
  if (r.state === 'Running') return `Unterwegs erreichbar unter ${r.short}:${r.port}`;
  if (r.installed) return 'Tailscale ist installiert, aber nicht verbunden';
  return 'Hafen von überall öffnen – sicher über Tailscale, ohne Portfreigabe';
}
async function showRemote() {
  await loadRemote();
  const r = state.remote || {};
  const copy = (t) => h('span', { class: 'cred', title: 'Zum Kopieren klicken', onclick: () => navigator.clipboard?.writeText(t).then(() => toast('Kopiert')) }, t);
  const steps = (...items) => h('ol', { class: 'steps' }, items.map((x) => h('li', {}, x)));
  const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  let body;
  if (r.state === 'Running') {
    const urls = [`http://${r.short}:${r.port}`, `http://${r.ip}:${r.port}`];
    body = [
      h('div', { class: 'remote-ok' }, h('i', { class: 'dot running' }), h('b', {}, 'Fernzugriff ist aktiv'),
        h('span', {}, r.peers ? `${r.peers} ${r.peers === 1 ? 'weiteres Gerät' : 'weitere Geräte'} online` : 'Noch kein anderes Gerät online')),
      h('p', {}, 'Auf jedem Gerät, auf dem Tailscale mit demselben Konto läuft, öffnest du Hafen von überall mit:'),
      h('dl', { class: 'kv' }, h('dt', {}, 'Name'), h('dd', {}, copy(urls[0])), h('dt', {}, 'Adresse'), h('dd', {}, copy(urls[1]))),
      h('p', { class: 'hint' }, 'Deine Apps erreichst du genauso – nur mit ihrem eigenen Port. Apps, die nur bekannte Adressen erlauben (z. B. Nextcloud), einmal über „Aktualisieren“ neu einrichten, damit sie die Tailscale-Adresse kennen.'),
    ];
  } else if (r.installed) {
    body = [
      h('p', {}, 'Tailscale ist auf diesem Mac installiert, aber gerade nicht verbunden.'),
      steps('Öffne Tailscale in der Menüleiste oben rechts (Symbol mit Punkten).', 'Melde dich an bzw. schalte „Connect“ ein.',
        'Aktiviere in den Tailscale-Einstellungen „Launch at login“, damit es nach einem Neustart von selbst verbindet.'),
    ];
  } else {
    body = [
      h('p', {}, 'Mit Tailscale öffnest du Hafen auch vom Handy im Mobilfunk oder aus einem fremden WLAN. Es baut ein privates, verschlüsseltes Netz nur zwischen deinen Geräten – ohne Portfreigabe am Router. Für bis zu 100 Geräte kostenlos.'),
      steps(h('span', {}, 'Lade Tailscale für den Mac: ', ext('https://tailscale.com/download/mac', 'tailscale.com/download/mac'), ' (oder aus dem Mac App Store).'),
        'Starte es und melde dich an, z. B. mit deinem Apple- oder Google-Konto.',
        'Installiere Tailscale auch auf deinem iPhone und PC und melde dich mit demselben Konto an.',
        'Öffne danach diesen Dialog wieder – hier steht dann deine Adresse für unterwegs.'),
    ];
  }
  body.push(h('p', { class: 'hint' }, 'Der Mac muss dafür eingeschaltet sein und darf nicht schlafen.'));
  dialog('Fernzugriff von unterwegs', null, { extra: h('div', { class: 'wform' }, body), wide: true,
    confirm: 'Erneut prüfen', onConfirm: showRemote, cancel: 'Schließen' });
}
async function logout() {
  await api('/api/logout', {}).catch(() => {});
  state.status.loggedIn = false; go('#/'); render();
}
function restartHafen() {
  dialog('Hafen neu starten?', 'Die Oberfläche ist ein paar Sekunden nicht erreichbar. Deine Apps laufen weiter.', {
    confirm: 'Neu starten', onConfirm: async () => {
      try { await api('/api/restart', {}); toast('Hafen startet neu …'); setTimeout(() => location.reload(), 4000); }
      catch (x) { toast(x.message, true); }
    } });
}

// ---------- Live-Nutzung ----------
function viewUsage() {
  const sys = state.system;
  if (!sys) return h('div', { class: 'win-body' }, h('h2', { class: 'win-title' }, 'Live-Nutzung'), h('div', { class: 'empty' }, 'Lade …'));
  const metric = state.usageMetric;
  const apps = state.apps.filter((a) => a.installed);
  const running = apps.filter((a) => a.state === 'running').length;
  const card = (k, label, v, s, p, pick) => h(pick ? 'button' : 'div', { class: 'ucard' + (pick ? ' pick' : '') + (metric === k ? ' on' : ''), onclick: pick ? () => { state.usageMetric = k; update(); } : null },
    h('div', { class: 'k' }, label), h('div', { class: 'v' }, v), h('div', { class: 's' }, s),
    h('div', { class: 'bar' + (metric === k ? ' brand' : '') }, h('i', { style: `width:${p}%` })));
  // docker stats zählt CPU je Kern – auf die Gesamtleistung umrechnen, damit es zur System-Zeile passt
  const val = (s) => (metric === 'cpu' ? s.cpu / sys.cores : s.mem);
  const fmt = (v) => (metric === 'cpu' ? `${de(v, 2)} %` : fmtBytes(v));
  const width = (v) => (metric === 'cpu' ? Math.min(100, v) : pct(v, sys.mem.total));
  const rows = apps.map((a) => ({ a, v: val(sys.apps[a.id] || { cpu: 0, mem: 0 }) })).sort((x, y) => y.v - x.v);
  const sysV = metric === 'cpu' ? sys.cpu : sys.mem.used;

  return h('div', { class: 'win-body' },
    h('h2', { class: 'win-title' }, 'Live-Nutzung'),
    h('div', { class: 'usage-cards' },
      card('cpu', 'CPU', `${Math.round(sys.cpu)} %`, `${sys.cores} Threads`, Math.round(sys.cpu), true),
      card('mem', 'Arbeitsspeicher', fmtBytes(sys.mem.used), `${fmtBytes(sys.mem.total - sys.mem.used)} frei`, pct(sys.mem.used, sys.mem.total), true),
      card('disk', 'Speicherplatz', fmtBytes(sys.disk.used), `${fmtBytes(sys.disk.total - sys.disk.used)} frei`, pct(sys.disk.used, sys.disk.total)),
      card('apps', 'Apps', `${running} / ${apps.length}`, 'laufen gerade', pct(running, apps.length))),
    h('div', { class: 'ulist' },
      h('div', { class: 'urow' }, h('span', { class: 'sys-ic', html: LOGO.replace('class="logo"', 'width="16" height="16"') }),
        h('span', { class: 'n' }, 'System'),
        h('div', { class: 'bar brand' }, h('i', { style: `width:${width(sysV)}%` })),
        h('span', { class: 'num' }, fmt(sysV)), h('span')),
      rows.map(({ a, v }) => h('div', { class: 'urow' }, appIcon(a, 26),
        h('span', { class: 'n' }, a.name, a.state !== 'running' && h('small', {}, stateText(a))),
        h('div', { class: 'bar' }, h('i', { style: `width:${width(v)}%` })),
        h('span', { class: 'num' }, fmt(v)),
        h('button', { class: 'more', 'aria-label': `Aktionen für ${a.name}`, onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); appMenu(r.right - 200, r.bottom + 4, a); } }, '⋯'))),
      !rows.length && h('div', { class: 'empty' }, 'Installierte Apps erscheinen hier mit ihrem Verbrauch.')),
    ext.usage.map((fn) => safeExt(() => fn(sys))));
}

// ---------- KI-Assistent (die Kugel) ----------
// Verlauf bleibt erhalten, solange die Seite offen ist; der Server kennt nur die jeweils gesendeten Nachrichten
state.ai = { cfg: null, messages: [], streaming: false, ctrl: null };

async function loadAiConfig() {
  try { state.ai.cfg = await api('/api/ai'); } catch { }
  return state.ai.cfg;
}

// Markdown in sichere DOM-Knoten (kein innerHTML – die Antwort kommt von einem fremden Modell)
function mdInline(s) {
  const out = [];
  for (const part of s.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push(h('b', {}, part.slice(2, -2)));
    else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) out.push(h('code', {}, part.slice(1, -1)));
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) out.push(h('i', {}, part.slice(1, -1)));
    else out.push(part);
  }
  return out;
}
function md(text) {
  const out = h('div', { class: 'md' });
  let list = null, code = null;
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) { if (code) { out.append(code); code = null; } else code = h('pre', { class: 'md-code' }); continue; }
    if (code) { code.append(raw + '\n'); continue; }
    const li = raw.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)/);
    if (li) {
      if (!list) { list = h(li[1] ? 'ol' : 'ul'); out.append(list); }
      list.append(h('li', {}, mdInline(li[2])));
      continue;
    }
    list = null;
    if (!raw.trim()) continue;
    const hd = raw.match(/^#{1,4}\s+(.*)/);
    out.append(h('p', { class: hd ? 'md-h' : null }, mdInline(hd ? hd[1] : raw)));
  }
  if (code) out.append(code);
  return out;
}

// Aktions-Zeilen [[aktion:verb:ziel]] herauslösen; während des Streamens halbe Marker am Ende ausblenden
const AI_WINDOWS = { dateien: 'files', fotos: 'photos', store: 'store', einstellungen: 'settings', nutzung: 'usage' };
function splitActions(text, streaming) {
  const acts = [];
  let t = text.replace(/`{0,4}\[\[aktion:([a-z]+):([a-z0-9-]+)\]\]`{0,4}/g, (_, verb, target) => { acts.push({ verb, target }); return ''; });
  let error = null;
  t = t.replace(/\[\[fehler:([\s\S]*?)\]\]/g, (_, m) => { error = m; return ''; });
  if (streaming) t = t.replace(/\[\[[^\]]*$/, '');
  // Übrig gebliebene leere Code-Zäune, in die manche Modelle die Aktionen packen
  t = t.split('\n').filter((l) => !/^\s*`{3,}\s*$/.test(l)).join('\n').trim();
  return { text: t, acts, error };
}
// Nur Knöpfe, die zum echten Zustand passen (z. B. kein „Öffnen“ für eine nicht installierte App)
function actionButton({ verb, target }, done) {
  if (verb === 'fenster') {
    const win = AI_WINDOWS[target];
    return win && { label: `${WINDOWS[win]} öffnen`, ic: dockArt(win, 22), run: () => { done(); go(`#/${win}`); } };
  }
  const app = state.apps.find((a) => a.id === target);
  if (!app) return null;
  const ic = appIcon(app, 22);
  if (verb === 'installieren') return !app.installed && { label: `${app.name} installieren`, ic, run: () => { done(); go(`#/store/${app.id}`); install(app); } };
  if (!app.installed) return { label: `${app.name} ansehen`, ic, run: () => { done(); go(`#/store/${app.id}`); } };
  const running = app.state === 'running';
  if (verb === 'oeffnen' && !hasWeb(app)) return { label: `Adresse ${connectAddr(app)} kopieren`, ic, run: () => copyConnect(app) };
  if (verb === 'oeffnen') return running ? { label: `${app.name} öffnen`, ic, run: () => window.open(appUrl(app), '_blank') }
    : { label: `${app.name} starten`, ic, run: () => control(app, 'start') };
  if (verb === 'starten') return !running && { label: `${app.name} starten`, ic, run: () => control(app, 'start') };
  if (verb === 'stoppen') return running && { label: `${app.name} stoppen`, ic, run: () => control(app, 'stop') };
  if (verb === 'neustarten') return { label: `${app.name} neu starten`, ic, run: () => control(app, 'restart') };
  return null;
}

function aiMessage(m, close) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, m.content));
  const { text, acts, error } = splitActions(m.content, m.pending);
  const seen = new Set();
  const buttons = acts.map((a) => actionButton(a, close)).filter((b) => b && !seen.has(b.label) && seen.add(b.label));
  return h('div', { class: 'msg bot' + (m.pending ? ' pending' : '') },
    text ? md(text) : m.pending && h('div', { class: 'typing' }, h('i'), h('i'), h('i')),
    buttons.length > 0 && h('div', { class: 'ai-acts' }, buttons.map((b) => h('button', { class: 'ai-act', onclick: (e) => {
      b.run(); const el = e.currentTarget; el.disabled = true; el.classList.add('done');
    } }, b.ic, b.label))),
    (error || m.error) && h('div', { class: 'ai-err' }, error || m.error));
}

async function sendAi(question, redraw) {
  const ai = state.ai;
  if (ai.streaming || !question.trim()) return;
  ai.messages.push({ role: 'user', content: question.trim() });
  const bot = { role: 'assistant', content: '', pending: true };
  ai.messages.push(bot);
  ai.streaming = true; ai.ctrl = new AbortController();
  redraw();
  try {
    const history = ai.messages.filter((m) => m !== bot && !m.error).map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: location.hostname, messages: history }), signal: ai.ctrl.signal });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bot.content += dec.decode(value, { stream: true });
      redraw(true);
    }
  } catch (e) {
    if (e.name !== 'AbortError') bot.error = e.message;
    else bot.content += bot.content ? '\n\n*(abgebrochen)*' : '*(abgebrochen)*';
  } finally {
    bot.pending = false; ai.streaming = false; ai.ctrl = null;
    redraw();
  }
}

// ---------- Suche (Strg+K) ----------
function openSpotlight(startInAi) {
  if ($('.spot-wrap')) return;
  let hits = [], cur = 0, mode = 'search';
  const input = h('input', { placeholder: 'Apps, Dateien und Einstellungen durchsuchen', 'aria-label': 'Suchen' });
  const appsRow = h('div', { class: 'spot-apps' });
  const list = h('div', { class: 'spot-list' });
  const box = h('div', { class: 'spot-box' });
  const close = () => { state.ai.ctrl?.abort(); wrap.remove(); };
  const act = (fn) => () => { close(); fn(); };
  const orb = h('button', { class: 'orb', title: 'Hafen fragen', 'aria-label': 'KI-Assistent', onclick: () => (mode === 'ai' ? showSearch() : showAi()) });

  // ---- Suche ----
  const commands = () => [
    ...Object.entries(WINDOWS).map(([k, l]) => ({ label: l, ic: dockArt(k, 38), fn: () => go(`#/${k}`) })),
    { label: 'KI-Assistent einrichten', sub: 'in Einstellungen', ic: dockArt('settings', 38), fn: aiSettingsDialog, extra: 'ollama openai claude modell' },
    { label: 'Alle Apps aktualisieren', ic: dockArt('store', 38), fn: updateAll },
    { label: 'Hintergrundbild', sub: 'in Einstellungen', ic: dockArt('settings', 38), fn: () => go('#/settings') },
    { label: 'Passwort ändern', sub: 'in Einstellungen', ic: dockArt('settings', 38), fn: editPassword },
    { label: 'Erreichbarkeit', sub: 'in Einstellungen', ic: dockArt('settings', 38), fn: showHosts },
    { label: 'Fernzugriff / VPN', sub: 'in Einstellungen', ic: dockArt('settings', 38), fn: showRemote, extra: 'tailscale vpn unterwegs' },
    { label: 'Widgets bearbeiten', ic: dockArt('settings', 38), fn: enterEdit },
    { label: 'Widget hinzufügen', ic: dockArt('settings', 38), fn: () => { enterEdit(); addWidget(); } },
    ...state.apps.filter((a) => !a.installed).map((a) => ({ label: a.name, sub: 'im App Store', ic: appIcon(a, 38), fn: () => go(`#/store/${a.id}`), extra: `${a.tagline} ${a.category}` })),
  ];
  const draw = (fresh) => {
    const raw = input.value.trim(), q = raw.toLowerCase();
    const apps = installedApps().filter((a) => !q || a.name.toLowerCase().includes(q));
    let cmds = commands().filter((c) => (q ? `${c.label} ${c.sub || ''} ${c.extra || ''}`.toLowerCase().includes(q) : !c.sub || (c.sub !== 'im App Store' && c.sub !== 'in Einstellungen')));
    if (q) {
      cmds.push({ label: `„${raw}“`, sub: 'in Dateien suchen', ic: dockArt('files', 38), fn: () => { state.files.q = raw; go('#/files'); update(); } });
    }
    cmds = cmds.slice(0, 9);
    hits = [...apps.map((a) => ({ fn: () => (a.state === 'running' && !isBusy(a) && hasWeb(a) ? window.open(appUrl(a), '_blank') : go(`#/store/${a.id}`)) })), ...cmds];
    if (fresh) cur = 0;
    cur = Math.min(cur, Math.max(0, hits.length - 1));
    appsRow.replaceChildren(...apps.map((a, i) => h('button', { class: i === cur ? 'hit' : null, onclick: act(hits[i].fn) }, appIcon(a), h('span', {}, a.name))));
    appsRow.style.display = apps.length ? '' : 'none';
    list.replaceChildren(...cmds.map((c, j) => h('button', { class: apps.length + j === cur ? 'hit' : null, onclick: act(c.fn) }, c.ic, c.label, c.sub && h('small', {}, c.sub))));
    if (!hits.length) list.replaceChildren(h('div', { class: 'spot-empty' }, `Nichts gefunden für „${raw}“.`));
    (appsRow.querySelector('.hit') || list.querySelector('.hit'))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  input.addEventListener('input', () => draw(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' && input.selectionStart === input.value.length) { e.preventDefault(); cur = Math.min(cur + 1, hits.length - 1); draw(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' && input.selectionStart === 0 && !input.value) { e.preventDefault(); cur = Math.max(cur - 1, 0); draw(); }
    if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); act(hits[cur].fn)(); }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  function showSearch() {
    mode = 'search';
    orb.classList.remove('ai');
    box.replaceChildren(h('label', { class: 'spot-in' }, icon('search'), input), appsRow, list);
    draw(true);
    input.focus();
  }

  // ---- Chat ----
  const log = h('div', { class: 'ai-log', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'ai-in', rows: 1, placeholder: 'Frag Hafen etwas …', 'aria-label': 'Nachricht an den KI-Assistenten' });
  const sendBtn = h('button', { class: 'ai-send', 'aria-label': 'Senden' });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  const submit = () => {
    if (state.ai.streaming) { state.ai.ctrl?.abort(); return; }
    const v = ta.value; ta.value = ''; grow();
    sendAi(v, redraw);
  };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.stopPropagation(); if (state.ai.streaming) state.ai.ctrl?.abort(); else showSearch(); }
  });
  sendBtn.addEventListener('click', submit);

  // Beim Streamen nur die letzte Nachricht neu zeichnen und mitscrollen, wenn man unten war
  function redraw(onlyLast) {
    if (mode !== 'ai') return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const msgs = state.ai.messages;
    if (onlyLast && log.lastChild && msgs.length) log.lastChild.replaceWith(aiMessage(msgs[msgs.length - 1], close));
    else log.replaceChildren(...(msgs.length ? msgs.map((m) => aiMessage(m, close)) : [aiWelcome()]));
    if (atBottom || !onlyLast) log.scrollTop = log.scrollHeight;
    orb.classList.toggle('thinking', state.ai.streaming);
    sendBtn.replaceChildren(icon(state.ai.streaming ? 'stop' : 'send'));
    sendBtn.setAttribute('aria-label', state.ai.streaming ? 'Antwort abbrechen' : 'Senden');
  }
  function aiWelcome() {
    const ex = ['Welche Apps laufen gerade?', 'Wie voll ist mein Speicher?', 'Ich will Filme auf dem Fernseher schauen – was brauche ich?', 'Wie greife ich von unterwegs auf Hafen zu?'];
    return h('div', { class: 'ai-welcome' }, h('b', {}, `Hallo ${state.status.name}!`),
      h('p', {}, 'Ich kenne deinen Hafen: Apps, Speicher, Auslastung. Frag mich etwas – wenn du etwas tun willst, schlage ich dir einen Knopf vor.'),
      h('div', { class: 'ai-ex' }, ex.map((q) => h('button', { onclick: () => sendAi(q, redraw) }, q))));
  }
  async function showAi(question) {
    mode = 'ai';
    orb.classList.add('ai');
    const cfg = state.ai.cfg || await loadAiConfig();
    const model = cfg?.model ? cfg.model.split('/').pop() : '';
    const head = h('div', { class: 'ai-head' },
      h('button', { class: 'ai-back', onclick: showSearch }, icon('left'), 'Suche'),
      h('span', { class: 'ai-model', title: cfg?.model || '' }, cfg?.ready ? `${cfg.providers?.[cfg.provider]?.label || cfg.provider} · ${model}` : ''),
      h('div', { class: 'spacer' }),
      state.ai.messages.length > 0 && h('button', { class: 'btn ghost small', onclick: () => { state.ai.ctrl?.abort(); state.ai.messages = []; showAi(); } }, 'Neuer Chat'),
      h('button', { class: 'icon-btn', title: 'KI einrichten', 'aria-label': 'KI einrichten', onclick: () => aiSettingsDialog(() => { state.ai.cfg = null; showAi(); }) }, icon('sliders')));
    if (!cfg?.ready) {
      box.replaceChildren(head, h('div', { class: 'ai-welcome' }, h('b', {}, 'KI-Assistent einrichten'),
        h('p', {}, 'Verbinde Hafen mit Ollama (lokal, kostenlos) oder einer API wie OpenAI, OpenRouter oder Claude. Danach beantwortet die Kugel Fragen zu deinem Hafen.'),
        h('button', { class: 'btn', onclick: () => aiSettingsDialog(() => { state.ai.cfg = null; showAi(question); }) }, 'Jetzt einrichten')));
      return;
    }
    box.replaceChildren(head, log, h('div', { class: 'ai-compose' }, ta, sendBtn));
    redraw();
    if (question) sendAi(question, redraw); else ta.focus();
  }

  const wrap = h('div', { class: 'spot-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'spot' }, orb, box));
  document.body.append(wrap);
  if (startInAi) showAi(); else showSearch();
}

// ---------- KI einrichten ----------
async function aiSettingsDialog(after) {
  const cfg = await loadAiConfig() || { provider: 'ollama', providers: {} };
  const P = cfg.providers;
  let provider = cfg.provider || 'ollama';
  const seg = h('div', { class: 'seg' });
  const url = h('input', { class: 'input', 'aria-label': 'Adresse', spellcheck: 'false', value: cfg.baseUrl || '' });
  const key = h('input', { class: 'input', type: 'password', autocomplete: 'off', 'aria-label': 'API-Schlüssel' });
  const model = h('input', { class: 'input', 'aria-label': 'Modell', list: 'ai-models', value: cfg.model || '', spellcheck: 'false', placeholder: 'Modell wählen oder eintippen' });
  const dl = h('datalist', { id: 'ai-models' });
  const think = h('input', { type: 'checkbox', checked: !!cfg.think });
  const status = h('div', { class: 'ai-status' });
  const urlHint = h('small', {}), keyRow = field('API-Schlüssel', key), thinkRow = h('label', { class: 'chk' }, think, 'Denkmodus (gründlicher, aber deutlich langsamer)');
  const HINTS = {
    ollama: 'Läuft Ollama auf diesem Mac, passt die Vorgabe. Auf einem anderen Rechner: http://IP:11434 – dort Ollama mit OLLAMA_HOST=0.0.0.0 starten.',
    openai: 'z. B. https://api.openai.com/v1 · https://openrouter.ai/api/v1 · https://api.groq.com/openai/v1 · LM Studio: http://localhost:1234/v1',
    anthropic: 'Die Vorgabe passt. Den Schlüssel bekommst du unter console.anthropic.com.',
  };
  const fields = () => ({ provider, baseUrl: url.value.trim(), apiKey: key.value.trim(), model: model.value.trim(), think: think.checked });

  let loadTimer;
  async function loadModels() {
    status.className = 'ai-status'; status.textContent = 'Verbinde …';
    try {
      const { models } = await api('/api/ai/models', fields());
      dl.replaceChildren(...models.map((m) => h('option', { value: m })));
      status.className = 'ai-status ok'; status.textContent = `Verbunden · ${models.length} ${models.length === 1 ? 'Modell' : 'Modelle'} gefunden`;
      if (!model.value && models.length) model.value = models[0];
    } catch (e) { status.className = 'ai-status bad'; status.textContent = e.message; }
  }
  const queueLoad = () => { clearTimeout(loadTimer); loadTimer = setTimeout(loadModels, 500); };
  function drawProvider() {
    seg.replaceChildren(...Object.entries(P).map(([k, p]) => h('button', { type: 'button', class: k === provider ? 'on' : null,
      onclick: () => { if (k === provider) return; provider = k; url.value = ''; key.value = ''; model.value = ''; dl.replaceChildren(); drawProvider(); queueLoad(); } }, p.label)));
    url.placeholder = P[provider]?.baseUrl || '';
    urlHint.textContent = HINTS[provider];
    keyRow.style.display = P[provider]?.needsKey ? '' : 'none';
    key.placeholder = cfg.hasKey && provider === cfg.provider ? 'Hinterlegt – leer lassen, um ihn zu behalten' : provider === 'anthropic' ? 'sk-ant-…' : 'sk-…';
    thinkRow.style.display = provider === 'ollama' ? '' : 'none';
  }
  url.addEventListener('input', queueLoad);
  key.addEventListener('change', loadModels);
  drawProvider();
  loadModels();

  dialog('KI-Assistent einrichten', 'Die Kugel in der Suche beantwortet dann Fragen zu deinem Hafen. Dein API-Schlüssel bleibt auf diesem Mac.', {
    confirm: 'Speichern', wide: true,
    extra: h('div', { class: 'wform' },
      field('Anbieter', seg),
      h('label', { class: 'f' }, h('span', {}, 'Adresse'), url, urlHint),
      keyRow,
      field('Modell', h('div', { class: 'row', style: 'gap:8px' }, model, h('button', { type: 'button', class: 'btn ghost small', onclick: loadModels }, 'Neu laden')), 'Kleine Modelle (unter 7B) verstehen Hafen schlechter – 8B oder mehr ist deutlich besser.'),
      dl, thinkRow, status),
    onConfirm: async () => {
      try {
        const f = fields();
        if (!f.model) throw new Error('Bitte ein Modell wählen.');
        state.ai.cfg = await api('/api/ai', f);
        state.ai.cfg.providers = P;
        toast('KI-Assistent gespeichert');
        update();
        after?.();
      } catch (e) { toast(e.message, true); }
    },
  });
}

// ---------- Start ----------
async function boot() {
  state.status = await api('/api/status');
  if (state.status.loggedIn) await Promise.all([refreshApps(), refreshSystem(), loadHome()]);
  render();
  if (state.status.loggedIn) poll();
}

addEventListener('hashchange', () => { closeMenu(); update(); });
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.status?.loggedIn) { e.preventDefault(); openSpotlight(); return; }
  if (e.key !== 'Escape') return;
  const dlg = document.querySelector('.dialog-wrap, .spot-wrap');
  if (dlg) dlg.remove();
  else if (document.querySelector('.menu')) closeMenu();
  else if (route()[0]) go(route()[0] === 'store' && route()[1] ? '#/store' : '#/');
  else if (state.editMode) exitEdit();
});
// ---------- Schnittstelle für Erweiterungen (public/features/*.js) ----------
// Fehler in einer Erweiterung dürfen die Oberfläche nicht lahmlegen
function safeExt(fn) {
  try { return fn(); } catch (e) { console.error('[feature]', e); return null; }
}
window.Hafen = {
  // Bausteine
  h, api, toast, dialog, field, check, choice, icon, icons: I, md, appIcon, dockArt, LOGO,
  openMenu, closeMenu, fmtBytes, fmtDate, relTime, de, pct,
  // Zustand und Navigation
  state, update, go, route, cd: (p) => cd(p), reloadFiles: () => loadFiles(), poll: () => poll(),
  control: (app, action) => control(app, action), install: (app) => install(app), appUrl, isBusy, connectHosts,
  // Ein Fenster: key, { title, dockSvg (52×52-SVG-Text), render(args) → Element, onOpen?(), hidden? }
  // hidden: true = nicht im Dock, nur über go('#/key') oder die Suche erreichbar
  registerWindow(key, { title, dockSvg, render, onOpen, hidden = false }) {
    WINDOWS[key] = title;
    DOCK_ART[key] = dockSvg;
    ext.windows[key] = { render, onOpen, hidden };
  },
  // fn(sys) → { tab: 'konto'|'system', ic, title, desc, onclick?, right? } oder null
  addSettingsItem: (fn) => ext.settings.push(fn),
  // fn(entry, relPath, reload) → { label, fn, danger? } oder null
  addFileMenuItem: (fn) => ext.fileMenu.push(fn),
  // { label, icon?() → Element, onClick, active?() → bool }
  addFilesSideItem: (item) => ext.filesSide.push(item),
  // fn(app) → { label, fn, danger? } oder null
  addAppMenuItem: (fn) => ext.appMenu.push(fn),
  // fn(sys) → Element (unter der App-Liste in „Live-Nutzung“)
  addUsageSection: (fn) => ext.usage.push(fn),
  // { label, icon?() → Element, onClick } – Knopf oben im App Store
  addStoreAction: (a) => ext.storeActions.push(a),
  // fn() → Element, das einmal fest über der Startseite liegt (z. B. Glocke)
  addOverlay: (fn) => ext.overlays.push(fn),
  // fn() – nach jeder Abfrage (alle 1–4 s)
  onPoll: (fn) => ext.onPoll.push(fn),
  // fn(entry) → Text im Löschen-Dialog der Dateien
  setDeleteHint: (fn) => { ext.deleteHint = fn; },
  // Zusätzliches CSS
  css(text) { document.head.append(h('style', {}, text)); },
};

// Erweiterungen laden, bevor die Oberfläche aufgebaut wird (sie tragen sich in Dock und Menüs ein)
async function loadFeatures() {
  let list = [];
  try { list = (await api('/api/features')).client; } catch { }
  for (const src of list) {
    try { await import(src); } catch (e) { console.error('[feature] konnte nicht geladen werden:', src, e); }
  }
}
loadFeatures().finally(() => boot().catch((e) => {
  root.replaceChildren(h('div', { class: 'auth' }, h('form', {}, h('h1', {}, 'Hafen antwortet nicht'),
    h('p', {}, `${e.message}. Prüfe, ob der Hafen-Dienst läuft, und lade die Seite neu.`))));
}));
