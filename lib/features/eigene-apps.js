import fs from 'node:fs/promises';
import path from 'node:path';

const fehler = (text, status = 400) => { throw Object.assign(new Error(text), { status }); };
const objekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const slug = (v) => v.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32).replace(/-$/, '');
const portzahl = (v) => {
  if (!Number.isInteger(v) || v < 1024 || v > 65535) fehler('Der Port muss eine ganze Zahl zwischen 1024 und 65535 sein.');
  return v;
};

// Ein bewusst begrenzter YAML-Leser: Unklare Syntax wird abgelehnt, nie ungeprüft übernommen.
function yaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let pos = 0;
  function clean(s) {
    let q = '';
    for (let i = 0; i < s.length; i++) {
      if (q === '"' && s[i] === '\\') { i++; continue; }
      if (s[i] === q) { if (q === "'" && s[i + 1] === "'") i++; else q = ''; }
      else if (!q && (s[i] === "'" || s[i] === '"')) q = s[i];
      else if (!q && s[i] === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    }
    if (q) fehler('Schließe alle Anführungszeichen in der Compose-Datei.');
    return s.trimEnd();
  }
  function scalar(s) {
    if (s === '{}' || s === '[]') return s === '{}' ? Object.create(null) : [];
    if (/^[&*!\[\{>|%@`]/.test(s) || /:\s/.test(s) && !/^["']/.test(s)) fehler('Nutze eingerücktes YAML ohne Anker, Tags oder Inline-Listen und Inline-Objekte.');
    if (s.startsWith('"')) { try { return JSON.parse(s); } catch { fehler('Nutze gültige doppelte Anführungszeichen in der Compose-Datei.'); } }
    if (s.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(s)) fehler('Ungültiger YAML-Text in einfachen Anführungszeichen.');
      return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
  }
  function peek() {
    while (pos < lines.length) {
      const s = clean(lines[pos]);
      if (s.trim()) return { indent: s.length - s.trimStart().length, text: s.trimStart() };
      pos++;
    }
    return null;
  }
  function pair(s) {
    const m = s.match(/^([a-zA-Z0-9_.-]+|"[^"\\]+"|'[^']+'):\s*(.*)$/);
    if (!m) fehler(`Ungültiger YAML-Eintrag in Zeile ${pos + 1}. Nutze Schlüssel: Wert.`);
    const key = scalar(m[1]);
    if (key === '<<' || ['__proto__', 'constructor', 'prototype'].includes(key)) fehler('Dieser YAML-Schlüssel ist nicht erlaubt.');
    return [key, m[2]];
  }
  function value(s, indent, depth) {
    if (/^[|>][+-]?$/.test(s)) {
      let out = '';
      while (pos < lines.length && (!lines[pos].trim() || lines[pos].search(/\S/) > indent)) out += lines[pos++] + '\n';
      return out;
    }
    if (s) return scalar(s);
    const n = peek();
    return n && (n.indent > indent || n.indent === indent && /^-\s/.test(n.text)) ? block(n.indent, depth + 1) : null;
  }
  function put(o, s, indent, depth) {
    const [k, v] = pair(s);
    if (Object.hasOwn(o, k)) fehler(`Der YAML-Schlüssel „${k}“ kommt doppelt vor.`);
    pos++;
    o[k] = value(v, indent, depth);
  }
  function block(indent, depth = 0) {
    if (depth > 40) fehler('Die Compose-Datei ist zu tief verschachtelt.');
    const list = /^-(?:\s|$)/.test(peek().text), out = list ? [] : Object.create(null);
    while (peek() && peek().indent === indent) {
      const s = peek().text;
      if (list) {
        if (!/^-(?:\s|$)/.test(s)) break;
        const rest = s.slice(1).trimStart();
        if (/^(?:[\w.-]+|"[^"\\]+"|'[^']+'):\s/.test(rest)) {
          const o = Object.create(null);
          put(o, rest, indent + 2, depth);
          while (peek() && peek().indent === indent + 2 && !peek().text.startsWith('- ')) put(o, peek().text, indent + 2, depth);
          out.push(o);
        } else { pos++; out.push(value(rest, indent, depth)); }
      } else { if (/^-/.test(s)) break; put(out, s, indent, depth); }
      if (peek() && peek().indent > indent) fehler(`Prüfe die Einrückung in Zeile ${pos + 1}.`);
    }
    return out;
  }
  if (!peek() || peek().indent !== 0) fehler('Beginne die Compose-Datei ohne Einrückung mit services:.');
  const out = block(0);
  if (peek()) fehler('Die Compose-Datei enthält nicht unterstützte YAML-Syntax.');
  return out;
}

function quelle(v) {
  if (typeof v !== 'string') fehler('Gib für jedes Volume eine eindeutige Quelle an.');
  if (v === '/var/run/docker.sock') return;
  if (/^\$\{(?:APP_DATA_DIR|HAFEN_STORAGE)\}(?:\/[^\s:$\\]*)?$/.test(v) && !v.split('/').includes('..')) return;
  if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(v)) return;
  fehler('Bind-Mounts dürfen nur unter ${APP_DATA_DIR} oder ${HAFEN_STORAGE} liegen. Andere Host-Pfade könnten private Dateien oder das System freigeben. Benannte Volumes und /var/run/docker.sock sind ebenfalls erlaubt.');
}

function pruefeCompose(compose, port, erlaubt) {
  if (typeof compose !== 'string' || !compose.trim() || Buffer.byteLength(compose) > 65536) fehler('Die Compose-Datei darf höchstens 64 KB groß sein und nicht leer sein.');
  if (/^[ \t]*\t/m.test(compose) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(compose)) fehler('Nutze Leerzeichen statt Tabulatoren zur Einrückung und entferne Steuerzeichen.');
  const doc = yaml(compose), ports = new Set(), warnungen = [];
  function rechte(v) {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'privileged' && x != null && !['false', 'no', 'off', '0'].includes(String(x).toLowerCase()) && erlaubt !== true) fehler('Diese App verlangt privilegierten Zugriff. Bestätige „Privilegierten Zugriff erlauben“ ausdrücklich.');
      rechte(x);
    }
  }
  rechte(doc);
  if (!objekt(doc.services) || !Object.keys(doc.services).length) fehler('Die Compose-Datei muss services: mit mindestens einem Dienst enthalten.');
  if (doc.include || doc.configs || doc.secrets) fehler('Externe Compose-Dateien, configs und secrets werden hier nicht unterstützt. Nutze geprüfte Volumes und Umgebungsvariablen.');
  for (const v of Object.values(doc.volumes || {})) if (v && (!objekt(v) || v.driver_opts || v.driver && v.driver !== 'local')) fehler('Volume-Treiber mit eigenen Host-Pfaden oder Optionen sind nicht erlaubt.');
  for (const service of Object.values(doc.services)) {
    if (!objekt(service)) fehler('Jeder Dienst muss eine eingerückte Konfiguration enthalten.');
    if (service.extends || service.volumes_from || service.build || service.env_file || service.develop) fehler('Nutze image, environment und direkte Volumes; externe Dateien, Builds und vererbte Mounts sind hier nicht unterstützt.');
    if (service.privileged != null && !['false', 'no', 'off', '0'].includes(String(service.privileged).toLowerCase()) && erlaubt !== true) fehler('Diese App verlangt privilegierten Zugriff. Bestätige „Privilegierten Zugriff erlauben“ ausdrücklich.');
    if (service.network_mode === 'host') warnungen.push('Host-Netzwerk wird auf dem Mac nicht unterstützt.');
    if (service.devices) warnungen.push('Gerätezugriff musst Du auf Deinem Server prüfen; auf dem Mac sind viele Linux-Geräte nicht verfügbar.');
    if (service.volumes != null && !Array.isArray(service.volumes)) fehler('Nutze unter volumes eine eingerückte Liste.');
    for (const v of service.volumes || []) {
      if (typeof v === 'string') {
        // Ein einzelner Container-Pfad ist ein anonymes Volume ohne Host-Zugriff.
        if (!v.includes(':') && v.startsWith('/')) continue;
        const m = v.match(/^(.+?):(\/[^:]+)(?::(?:ro|rw|z|Z|cached|delegated|consistent)(?:,(?:ro|rw|z|Z|cached|delegated|consistent))*)?$/);
        if (!m) fehler('Prüfe die Volume-Angabe: Quelle:/Container-Pfad[:ro].');
        quelle(m[1]);
      } else if (objekt(v)) {
        if (!['bind', 'volume', 'tmpfs'].includes(v.type)) fehler('Erlaubte Mount-Typen sind bind, volume und tmpfs.');
        if (v.type === 'bind' && typeof v.source === 'string' && !v.source.startsWith('${') && v.source !== '/var/run/docker.sock') fehler('Nutze für Bind-Mounts ${APP_DATA_DIR} oder ${HAFEN_STORAGE}, damit keine fremden Host-Dateien freigegeben werden.');
        if (v.type !== 'tmpfs' && v.source != null) quelle(v.source);
        else if (v.type === 'bind') fehler('Ein Bind-Mount braucht eine Quelle.');
        if (typeof v.target !== 'string' || !v.target.startsWith('/')) fehler('Ein Mount braucht einen absoluten Container-Zielpfad.');
      } else fehler('Ungültiger Volume-Eintrag.');
    }
    if (service.ports != null && !Array.isArray(service.ports)) fehler('Nutze unter ports eine eingerückte Liste.');
    for (const p of service.ports || []) {
      let published;
      if (objekt(p)) published = p.published;
      else if (typeof p === 'string') {
        const parts = p.replace(/\$\{APP_PORT\}/g, String(port)).split(':');
        if (parts.length > 1) published = parts.at(-2);
      } else fehler('Ungültige Port-Angabe.');
      if (published != null) {
        const s = String(published).replace(/\$\{APP_PORT\}/g, String(port));
        if (!/^\d+$/.test(s)) fehler('Veröffentlichte Ports müssen einzelne Zahlen oder ${APP_PORT} sein; Portbereiche werden nicht unterstützt.');
        ports.add(portzahl(Number(s)));
      }
    }
  }
  if (!compose.includes('${APP_PORT}') && !new RegExp(`\\b${port}\\b`).test(compose)) warnungen.push('Die Compose-Datei enthält weder ${APP_PORT} noch Deinen Port. Prüfe die Erreichbarkeit der App.');
  return { ports: [...ports], warnungen: [...new Set(warnungen)] };
}

function zerlegen(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536 || /\0/.test(text)) fehler('Gib einen docker run-Befehl mit höchstens 64 KB ein.');
  const out = []; let token = '', quote = '', started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && quote !== "'") {
      if (text[i + 1] === '\n') { i++; continue; }
      if (text[i + 1] === '\r' && text[i + 2] === '\n') { i += 2; continue; }
      if (i + 1 === text.length) fehler('Der Befehl endet mit einem unvollständigen Backslash.');
      if (quote === '"' && !/["\\$`]/.test(text[i + 1])) token += c;
      else token += text[++i];
      started = true;
    } else if (quote) { if (c === quote) quote = ''; else token += c; }
    else if (c === '"' || c === "'") { quote = c; started = true; }
    else if (/\s/.test(c)) { if (started) { out.push(token); token = ''; started = false; } }
    else { if (/[;|&<>`]/.test(c) || c === '$' && text[i + 1] === '(') fehler('Füge nur einen docker run-Befehl ohne Shell-Verknüpfungen oder Befehlsersetzung ein.'); token += c; started = true; }
  }
  if (quote) fehler('Schließe die Anführungszeichen im Befehl.');
  if (started) out.push(token);
  if (out[0] === 'sudo') out.shift();
  if (out.shift() !== 'docker' || out.shift() !== 'run') fehler('Der Befehl muss mit docker run beginnen.');
  return out;
}

function umwandeln(text) {
  const args = zerlegen(text), service = {}, named = new Set(), warnungen = [];
  let port = 8080, name = '', i = 0;
  const add = (k, v) => (service[k] ||= []).push(v);
  const aliases = { '-p': 'publish', '-v': 'volume', '-e': 'env', '-u': 'user' };
  while (i < args.length && args[i].startsWith('-')) {
    const arg = args[i++];
    if (arg === '--') break;
    if (/^-[itd]+$/.test(arg) || ['--rm', '--detach', '--interactive', '--tty'].includes(arg)) continue;
    let [key, ...rest] = arg.split('='), val = rest.length ? rest.join('=') : undefined;
    if (/^-[pveu].+/.test(key)) { val = key.slice(2); key = key.slice(0, 2); }
    key = aliases[key] || key.replace(/^--/, '');
    if (!['publish', 'volume', 'env', 'env-file', 'name', 'restart', 'network', 'cap-add', 'device', 'user', 'add-host', 'stop-timeout', 'gpus'].includes(key)) fehler(`Die Option „${arg}“ wird nicht unterstützt. Übertrage sie bitte selbst in die Compose-Datei.`);
    if (val === undefined) val = args[i++];
    if (val === undefined || !val.length) fehler(`Bei „${arg}“ fehlt ein Wert.`);
    if (key === 'publish') {
      const m = val.match(/^(?:(?:[^:]+|\[[^\]]+\]):)?(\d+):(\d+)(\/(?:tcp|udp|sctp))?$/);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 65535) fehler('Nutze -p Host-Port:Container-Port, optional mit Adresse und /tcp oder /udp.');
      portzahl(Number(m[1]));
      if (!service.ports) { port = Number(m[1]); add('ports', val.replace(new RegExp(`${m[1]}:${m[2]}`), '${APP_PORT}:' + m[2])); }
      else add('ports', val);
    } else if (key === 'volume') {
      const m = val.match(/^(.+):(\/[^:]+)(?::([^:]+))?$/);
      if (!m) { if (val.startsWith('/') && !val.includes(':')) add('volumes', val); else fehler('Nutze -v Quelle:/Container-Pfad[:ro].'); continue; }
      let src = m[1];
      if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(src)) named.add(src);
      else if (src !== '/var/run/docker.sock' && !/^\$\{(?:APP_DATA_DIR|HAFEN_STORAGE)\}(?:\/|$)/.test(src)) {
        const tail = slug(src.replace(/\\/g, '/').replace(/\/$/, '').split('/').at(-1)) || 'daten';
        const neu = '${APP_DATA_DIR}/' + tail;
        warnungen.push(`Host-Pfad „${src}“ wurde zu „${neu}“. Vorhandene Daten werden nicht kopiert.`); src = neu;
      }
      add('volumes', src + ':' + m[2] + (m[3] ? ':' + m[3] : ''));
    } else if (key === 'env') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:=|$)/.test(val)) fehler('Eine Umgebungsvariable braucht einen gültigen Namen.');
      add('environment', val); if (!val.includes('=')) warnungen.push(`Trage den Wert für „${val}“ selbst ein; die Shell-Umgebung wird nicht übernommen.`);
    } else if (key === 'env-file') warnungen.push(`Die Umgebungsdatei „${val}“ wurde nicht gelesen. Übertrage ihre Werte unter environment.`);
    else if (key === 'name') name = val;
    else if (key === 'network') { service.network_mode = val; if (val === 'host') warnungen.push('Host-Netzwerk wird auf dem Mac nicht unterstützt.'); }
    else if (key === 'device') { add('devices', val); warnungen.push(`Prüfe das Gerät „${val}“; Gerätezugriff ist auf dem Mac eingeschränkt.`); }
    else if (key === 'cap-add') add('cap_add', val);
    else if (key === 'add-host') add('extra_hosts', val);
    else if (key === 'stop-timeout') { if (!/^\d+$/.test(val)) fehler('Die Wartezeit muss eine ganze Zahl sein.'); service.stop_grace_period = val + 's'; }
    else if (key === 'gpus') warnungen.push(`GPU-Option „${val}“ wurde nicht übernommen. Konfiguriere die GPU passend zu Deinem Server.`);
    else service[key] = val;
  }
  const image = args[i++];
  if (!image || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) fehler('Gib ein gültiges Container-Image an.');
  name ||= image.split('/').at(-1).split(':')[0];
  const command = args.slice(i);
  // Docker-Argumente werden nicht ausgeführt; Dollarzeichen bleiben für Compose wörtlich erhalten.
  const q = (v, variables = false) => JSON.stringify(variables ? v.replace(/\$(?!\{(?:APP_PORT|APP_DATA_DIR|HAFEN_STORAGE)\})/g, '$$$$') : v.replace(/\$/g, '$$$$'));
  let compose = 'services:\n  app:\n    image: ' + q(image) + '\n';
  for (const [k, v] of Object.entries(service)) compose += Array.isArray(v) ? `    ${k}:\n` + v.map((x) => '      - ' + q(x, ['ports', 'volumes'].includes(k)) + '\n').join('') : `    ${k}: ${q(v)}\n`;
  if (command.length) compose += '    command:\n' + command.map((x) => '      - ' + q(x) + '\n').join('');
  if (named.size) compose += 'volumes:\n' + [...named].map((v) => `  ${v}: {}\n`).join('');
  if (!service.ports) warnungen.push('Es wurde kein Port veröffentlicht. Prüfe Port und Weboberfläche vor dem Speichern.');
  return { compose, port, name, warnungen: [...new Set(warnungen)] };
}

export default async function (ctx) {
  const root = path.resolve(ctx.CUSTOM_STORE);
  let queue = Promise.resolve();
  const serial = (fn) => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  function idPruefen(id) {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(id)) fehler('Die App-ID muss 2–32 Zeichen lang sein und aus a–z, 0–9 und Bindestrichen bestehen.');
    ctx.safePath(id);
    return id;
  }
  async function datei(id, name = '') {
    idPruefen(id);
    // safePath ist auf STORAGE begrenzt; erst geprüfte relative Teile nach CUSTOM_STORE übertragen.
    const rel = path.relative(ctx.STORAGE, ctx.safePath(path.join(id, name)));
    const target = path.resolve(root, rel);
    if (!target.startsWith(root + path.sep)) fehler('Ungültiger App-Pfad.');
    for (const p of [root, path.join(root, id), ...(name ? [target] : [])]) {
      try { if ((await fs.lstat(p)).isSymbolicLink()) fehler('Symbolische Links sind im eigenen App-Store nicht erlaubt.'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return target;
  }
  const body = async (req) => { const b = await ctx.readJson(req); if (!objekt(b)) fehler('Sende ein JSON-Objekt.'); return b; };
  const route = (fn) => ({ fn: (...args) => serial(async () => {
    try { return await fn(...args); } catch (e) {
      if (e.status) throw e;
      if (e.code === 'ENOENT') fehler('Diese eigene App wurde nicht gefunden.', 404);
      ctx.log('Eigene Apps: Die Anfrage konnte nicht verarbeitet werden.');
      throw ctx.httpError(500, 'Die eigene App konnte nicht gelesen oder gespeichert werden. Prüfe den Datenordner.');
    }
  }) });
  return { routes: {
    'GET /api/eigene-apps': route(async (req, res, url) => {
      const id = idPruefen(url.searchParams.get('id'));
      const app = (await ctx.apps.list()).find((a) => a.id === id && a.custom);
      if (!app) fehler('Diese eigene App wurde nicht gefunden.', 404);
      return { id, app: JSON.parse(await fs.readFile(await datei(id, 'app.json'), 'utf8')), compose: await fs.readFile(await datei(id, 'docker-compose.yml'), 'utf8') };
    }),
    'POST /api/eigene-apps': route(async (req) => {
      const b = await body(req);
      const text = (v, label, max, fallback = '') => { if (v == null) return fallback; if (typeof v !== 'string' || v.length > max || /\0/.test(v)) fehler(`Prüfe das Feld „${label}“ (höchstens ${max} Zeichen).`); return v.trim(); };
      const name = text(b.name, 'Name', 100); if (!name) fehler('Gib Deiner App einen Namen.');
      const id = idPruefen(b.id === undefined ? slug(name) : b.id), all = await ctx.apps.list(), old = all.find((a) => a.id === id);
      if (old && !old.custom) fehler('Diese ID gehört bereits zu einer Store-App. Wähle einen anderen Namen.', 409);
      if (old && b.id === undefined) fehler('Eine eigene App mit diesem Namen existiert bereits. Öffne sie zum Bearbeiten.', 409);
      if (old?.job?.running) fehler('Warte, bis die laufende App-Aktion abgeschlossen ist.', 409);
      const port = portzahl(b.port);
      if (typeof b.web !== 'boolean') fehler('Gib an, ob die App eine Weboberfläche hat.');
      if (b.extraPorts !== undefined && (!Array.isArray(b.extraPorts) || b.extraPorts.length > 100)) fehler('Zusätzliche Ports müssen eine Liste mit höchstens 100 Zahlen sein.');
      const checked = pruefeCompose(b.compose, port, b.erlaubePrivilegiert);
      const ports = [...new Set([port, ...(b.extraPorts || []).map(portzahl), ...checked.ports])];
      for (const p of ports) {
        if (p === Number(ctx.PORT)) fehler(`Port ${p} wird von Hafen verwendet.`, 409);
        const other = all.find((a) => a.id !== id && [a.port, ...(a.extraPorts || [])].includes(p));
        if (other) fehler(`Port ${p} gehört bereits zu „${other.name}“. Wähle einen anderen Port.`, 409);
      }
      const url = (v, label) => { const s = text(v, label, 2048); if (s) { try { const u = new URL(s); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { fehler(`Nutze für „${label}“ eine vollständige HTTP- oder HTTPS-Adresse ohne Zugangsdaten.`); } } return s; };
      const meta = { name, tagline: text(b.tagline, 'Kurzbeschreibung', 240), category: text(b.kategorie, 'Kategorie', 80) || 'Eigene Apps', port,
        extraPorts: ports.filter((p) => p !== port), icon: url(b.icon, 'Icon-URL'), website: url(b.webseite, 'Webseite'), description: text(b.beschreibung, 'Beschreibung', 16000), web: b.web };
      const dir = await datei(id), metaFile = await datei(id, 'app.json'), composeFile = await datei(id, 'docker-compose.yml');
      await fs.mkdir(dir, { recursive: true });
      const before = old ? await fs.readFile(composeFile) : null;
      try {
        await fs.writeFile(composeFile, b.compose, { mode: 0o600 });
        await fs.writeFile(metaFile, JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 });
      } catch (e) {
        if (before) await fs.writeFile(composeFile, before).catch(() => {});
        else await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        throw e;
      }
      return { id, warnungen: checked.warnungen, ...(old?.installed ? { hinweis: 'Zum Übernehmen die App aktualisieren' } : {}) };
    }),
    'POST /api/eigene-apps/loeschen': route(async (req) => {
      const { id } = await body(req); idPruefen(id);
      const app = (await ctx.apps.list()).find((a) => a.id === id && a.custom);
      if (!app) fehler('Diese eigene App wurde nicht gefunden.', 404);
      if (app.installed || app.job?.running) fehler('Deinstalliere die App zuerst und warte auf das Ende aller App-Aktionen. Danach kannst Du sie aus dem Store entfernen.', 409);
      await fs.rm(await datei(id), { recursive: true });
      return { ok: true };
    }),
    'POST /api/eigene-apps/aus-docker-run': route(async (req) => umwandeln((await body(req)).befehl)),
  } };
}
