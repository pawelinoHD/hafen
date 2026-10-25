import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';

const ableiten = promisify(scrypt);
const tag = 86400000;
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gleich = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());

export default async function (ctx) {
  const datei = path.join(ctx.HOME, 'freigaben.json');
  let links = [];
  try { links = JSON.parse(await fs.promises.readFile(datei, 'utf8')); if (!Array.isArray(links)) throw new Error(); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Freigaben konnten nicht gelesen werden.'); }
  const speichern = () => {
    fs.writeFileSync(datei + '.tmp', JSON.stringify(links), { mode: 0o600 });
    fs.renameSync(datei + '.tmp', datei);
  };
  // Änderungen und Download-Zähler werden auch bei gleichzeitigen Anfragen nacheinander gespeichert.
  let kette = Promise.resolve();
  const exklusiv = (fn) => { const p = kette.then(fn); kette = p.catch(() => {}); return p; };
  const fehler = (status, text) => { throw ctx.httpError(status, text); };
  const finden = (token) => links.find((l) => gleich(l.token, typeof token === 'string' ? token : ''));
  function pfadPruefen(rel) {
    if (typeof rel !== 'string' || rel.length > 4096 || /[\x00-\x1f\\:]/.test(rel) || rel.startsWith('/') || rel.split('/').some((p) => p === '..' || p === '.')) fehler(400, 'Ungültiger Pfad.');
    return ctx.safePath(rel);
  }
  function aufloesen(rel) {
    const ziel = pfadPruefen(rel);
    const teile = path.relative(ctx.STORAGE, ziel).split(path.sep).filter(Boolean);
    let aktuell = '';
    for (const teil of teile) {
      aktuell = aktuell ? `${aktuell}/${teil}` : teil;
      if (fs.lstatSync(ctx.safePath(aktuell)).isSymbolicLink()) fehler(400, 'Verknüpfungen können nicht geteilt werden.');
    }
    const echt = fs.realpathSync(ziel), basis = fs.realpathSync(ctx.STORAGE);
    if (echt !== basis && !echt.startsWith(basis + path.sep)) fehler(400, 'Ungültiger Pfad.');
    const st = fs.statSync(ziel);
    if (!st.isFile() && !st.isDirectory()) fehler(400, 'Dieser Dateityp kann nicht geteilt werden.');
    return { ziel, st };
  }
  async function werte(body, alt = {}) {
    const neu = { ...alt };
    if ('tage' in body) {
      if (!Number.isInteger(body.tage) || body.tage < 0 || body.tage > 36500) fehler(400, 'Gib eine Gültigkeit von 0 bis 36500 Tagen an.');
      neu.ablauf = body.tage ? Date.now() + body.tage * tag : null;
    }
    if ('maxDownloads' in body) {
      if (body.maxDownloads !== null && (!Number.isSafeInteger(body.maxDownloads) || body.maxDownloads < 1)) fehler(400, 'Die Download-Grenze muss eine positive ganze Zahl sein.');
      neu.maxDownloads = body.maxDownloads;
    }
    if ('passwort' in body) {
      if (typeof body.passwort !== 'string' || body.passwort.length > 1024) fehler(400, 'Das Passwort darf höchstens 1024 Zeichen haben.');
      const salt = randomBytes(16).toString('hex');
      neu.passwortHash = body.passwort ? `${salt}:${(await ableiten(body.passwort, salt, 64)).toString('hex')}` : null;
    }
    return neu;
  }
  const lesen = async (req) => { const b = await ctx.readJson(req); if (!b || Array.isArray(b) || typeof b !== 'object') fehler(400, 'Ungültige Eingabe.'); return b; };
  const route = (fn) => ({ fn: (...args) => exklusiv(async () => {
    try { return await fn(...args); }
    catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') fehler(404, 'Die Datei wurde nicht gefunden.'); throw e; }
  }) });
  const versuche = new Map();
  function bremse(req, zaehlen = false) {
    const ip = req.socket.remoteAddress || '?', jetzt = Date.now();
    let v = versuche.get(ip);
    if (!v || v.bis < jetzt) { v = { n: 0, bis: jetzt + 600000 }; versuche.set(ip, v); }
    if (v.n >= 30) fehler(429, 'Zu viele Versuche. Bitte warte zehn Minuten.');
    if (zaehlen) v.n++;
  }
  const signatur = (l, zweck, wert) => createHmac('sha256', ctx.config.secret).update(`${l.token}|${l.passwortHash || ''}|${zweck}|${wert}`).digest('base64url');
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => { const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1)]; }));
  function gueltig(req, l, name, zweck) {
    const [zeit, sig] = (cookies(req)[name] || '').split('.');
    return /^\d+$/.test(zeit || '') && Number(zeit) > Date.now() && Number(zeit) <= Date.now() + tag / 2 + 1000 && gleich(sig, signatur(l, zweck, zeit));
  }
  function cookie(req, res, l, name, zweck) {
    const zeit = String(Date.now() + tag / 2);
    res.setHeader('Set-Cookie', `${name}=${zeit}.${signatur(l, zweck, zeit)}; Path=/s/${l.token}; Max-Age=43200; HttpOnly; SameSite=Strict${req.socket.encrypted ? '; Secure' : ''}`);
  }
  const seite = (res, status, inhalt) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Freigabe · Hafen</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#123c42,#08090b 70%);color:#fff;font:15px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;padding:24px}main{width:min(680px,100%);padding:32px;border:1px solid #ffffff24;border-radius:26px;background:#16181bd9;box-shadow:0 30px 80px #0006}h1{font-size:28px;overflow-wrap:anywhere}p,small{color:#ffffffa6;line-height:1.6}a,button{color:white}button,.knopf{display:inline-block;border:0;border-radius:14px;background:#0d8b94;padding:14px 22px;font:inherit;text-decoration:none;cursor:pointer}input{width:100%;padding:13px;margin:12px 0 20px;background:#ffffff09;border:1px solid #ffffff30;border-radius:12px;color:white;font:inherit}img{max-width:100%;max-height:380px;border-radius:16px;margin:16px 0}ul{padding:0;list-style:none}li{padding:13px 0;border-bottom:1px solid #ffffff18;overflow-wrap:anywhere}li a{float:right;margin-left:12px}label{display:block}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid #13a8b2;outline-offset:4px}</style><main><small>HAFEN · FREIGABE</small>${inhalt}</main></html>`);
  };
  const nichtDa = (res) => seite(res, 404, '<h1>Dieser Link ist nicht verfügbar</h1><p>Bitte frag die Person, die ihn geteilt hat, nach einem neuen Link.</p>');
  const formular = (res, l, falsch = false) => seite(res, falsch ? 403 : 200, `<h1>Geschützte Freigabe</h1><p>${falsch ? 'Das Passwort stimmt nicht. Versuch es erneut.' : 'Gib das Passwort ein, um die Freigabe zu öffnen.'}</p><form method="post" action="/s/${l.token}"><label for="passwort">Passwort</label><input id="passwort" name="passwort" type="password" maxlength="1024" required autocomplete="current-password"><button>Freigabe öffnen</button></form>`);
  function archivPruefen(rel) {
    const { ziel, st } = aufloesen(rel);
    if (st.isDirectory()) for (const e of fs.readdirSync(ziel)) archivPruefen(rel ? `${rel}/${e}` : e);
  }
  const aufraeumen = () => exklusiv(() => {
    const alt = links; links = links.filter((l) => !l.ablauf || l.ablauf >= Date.now() - 30 * tag);
    try { if (alt.length !== links.length) speichern(); } catch (e) { links = alt; throw e; }
    for (const [ip, v] of versuche) if (v.bis < Date.now()) versuche.delete(ip);
  }).catch(() => ctx.log('Freigaben konnten nicht aufgeräumt werden.'));
  setInterval(aufraeumen, 3600000).unref();
  return {
    routes: {
      'GET /api/freigaben': route(() => links.map((l) => {
        let info; try { info = aufloesen(l.pfad); } catch {}
        return { token: l.token, pfad: l.pfad, name: path.basename(l.pfad) || 'Speicher', erstellt: l.erstellt, ablauf: l.ablauf, maxDownloads: l.maxDownloads, downloads: l.downloads, passwort: !!l.passwortHash, groesse: info?.st.isDirectory() ? 'Ordner' : info?.st.size ?? null, status: !info ? 'Datei fehlt' : (l.ablauf && l.ablauf <= Date.now()) || (l.maxDownloads !== null && l.downloads >= l.maxDownloads) ? 'abgelaufen' : 'aktiv' };
      })),
      'POST /api/freigaben': route(async (req) => {
        const b = await lesen(req); aufloesen(b.pfad);
        const l = await werte(b, { token: randomBytes(24).toString('base64url'), pfad: b.pfad, erstellt: Date.now(), ablauf: null, passwortHash: null, maxDownloads: null, downloads: 0 });
        links.push(l); try { speichern(); } catch (e) { links.pop(); throw e; }
        return { token: l.token, link: `/s/${l.token}` };
      }),
      'POST /api/freigaben/loeschen': route(async (req) => {
        const l = finden((await lesen(req)).token); if (!l) fehler(404, 'Freigabe nicht gefunden.');
        const alt = links; links = links.filter((x) => x !== l); try { speichern(); } catch (e) { links = alt; throw e; } return { ok: true };
      }),
      'POST /api/freigaben/aendern': route(async (req) => {
        const b = await lesen(req), l = finden(b.token); if (!l) fehler(404, 'Freigabe nicht gefunden.');
        const neu = await werte(b, l), i = links.indexOf(l); links[i] = neu;
        try { speichern(); } catch (e) { links[i] = l; throw e; } return { ok: true };
      }),
    },
    async handle(req, res, url) {
      if (!url.pathname.startsWith('/s/')) return false;
      res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      try {
        await exklusiv(async () => {
          bremse(req);
          const m = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{32})(?:\/(download|datei|ansehen))?$/);
          const l = finden(m?.[1]);
          if (!m || !l || (l.ablauf && l.ablauf <= Date.now())) { bremse(req, true); return nichtDa(res); }
          if (req.method !== 'GET' && !(req.method === 'POST' && !m[2])) { res.setHeader('Allow', m[2] ? 'GET' : 'GET, POST'); return seite(res, 405, '<h1>Diese Anfrage wird nicht unterstützt</h1>'); }
          if (l.passwortHash && req.method === 'POST') {
            if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') fehler(415, 'Bitte verwende das Passwortformular.');
            let body = ''; for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 8192) fehler(413, 'Die Eingabe ist zu lang.'); }
            const pw = new URLSearchParams(body).get('passwort') || '';
            if (pw.length > 1024) fehler(400, 'Das Passwort ist zu lang.');
            const [salt, hash] = l.passwortHash.split(':');
            if (!gleich((await ableiten(pw, salt, 64)).toString('hex'), hash)) { bremse(req, true); return formular(res, l, true); }
            cookie(req, res, l, `freigabe_${l.token}`, 'zugang'); res.writeHead(303, { Location: `/s/${l.token}` }); return res.end();
          }
          if (l.passwortHash && !gueltig(req, l, `freigabe_${l.token}`, 'zugang')) return formular(res, l);
          let info; try { info = aufloesen(l.pfad); } catch { return nichtDa(res); }
          const basis = `/s/${l.token}`, name = path.basename(info.ziel), aktion = m[2];
          if (!aktion) {
            if (l.maxDownloads !== null && l.downloads >= l.maxDownloads) return nichtDa(res);
            let inhalt = `<h1>${esc(name)}</h1><p>${info.st.isDirectory() ? 'Ordner' : `${info.st.size.toLocaleString('de-DE')} Bytes`} · ${l.ablauf ? `Gültig bis ${esc(new Date(l.ablauf).toLocaleString('de-DE'))}` : 'Unbegrenzt gültig'}</p>`;
            const typ = ctx.MEDIA_EXT[path.extname(name).toLowerCase()] || '';
            if (typ.startsWith('image/') && typ !== 'image/svg+xml') inhalt += `<img src="${basis}/ansehen" alt="Vorschau">`;
            if (info.st.isDirectory()) {
              inhalt += '<ul>';
              for (const e of fs.readdirSync(info.ziel, { withFileTypes: true })) {
                const rel = l.pfad ? `${l.pfad}/${e.name}` : e.name;
                try { const item = aufloesen(rel); inhalt += `<li>${item.st.isFile() ? `<a href="${basis}/datei?pfad=${esc(encodeURIComponent(e.name))}">Herunterladen</a>` : ''}${esc(e.name)}${item.st.isDirectory() ? ' · Ordner' : ` · ${item.st.size.toLocaleString('de-DE')} Bytes`}</li>`; } catch {}
              }
              inhalt += '</ul>';
            }
            return seite(res, 200, inhalt + `<a class="knopf" href="${basis}/download">${info.st.isDirectory() ? 'Alles als .tar.gz' : 'Herunterladen'}</a>`);
          }
          let rel = l.pfad;
          if (aktion === 'datei') {
            if (!info.st.isDirectory()) fehler(400, 'Diese Freigabe ist kein Ordner.');
            const sub = url.searchParams.get('pfad'); if (!sub) fehler(400, 'Wähle eine Datei aus.');
            pfadPruefen(sub); rel = rel ? `${rel}/${sub}` : sub;
            const einzel = aufloesen(rel);
            if (!einzel.ziel.startsWith(info.ziel + path.sep) || !einzel.st.isFile()) fehler(400, 'Ungültiger Dateipfad.');
            info = einzel;
          }
          const typ = ctx.MEDIA_EXT[path.extname(info.ziel).toLowerCase()] || '';
          if (aktion === 'ansehen' && (info.st.isDirectory() || !typ.startsWith('image/') || typ === 'image/svg+xml')) fehler(400, 'Für diese Datei gibt es keine Bildvorschau.');
          const zweck = `${rel}|${info.st.size}|${info.st.mtimeMs}`;
          const quittung = `download_${l.token}_${createHash('sha256').update(rel).digest('hex').slice(0, 12)}`;
          const folge = !!req.headers.range && gueltig(req, l, quittung, zweck);
          if (!folge && l.maxDownloads !== null && l.downloads >= l.maxDownloads) return nichtDa(res);
          let start = 0, ende = info.st.size - 1;
          if (req.headers.range) {
            const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
            if (!r || (!r[1] && !r[2]) || info.st.isDirectory()) fehler(416, 'Dieser Bereich ist nicht verfügbar.');
            start = r[1] ? Number(r[1]) : Math.max(0, info.st.size - Number(r[2]));
            ende = r[1] && r[2] ? Math.min(Number(r[2]), ende) : ende;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(ende) || start > ende || start >= info.st.size) { res.setHeader('Content-Range', `bytes */${info.st.size}`); fehler(416, 'Dieser Bereich ist nicht verfügbar.'); }
          }
          if (info.st.isDirectory()) archivPruefen(rel);
          if (aktion !== 'ansehen' && !folge) {
            l.downloads++; try { speichern(); } catch (e) { l.downloads--; throw e; }
            cookie(req, res, l, quittung, zweck);
          }
          const filename = path.basename(info.ziel) + (info.st.isDirectory() ? '.tar.gz' : '');
          const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
          res.setHeader('Content-Disposition', `${aktion === 'ansehen' ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`);
          if (info.st.isDirectory()) {
            const proc = spawn('tar', ['-czf', '-', '-C', path.dirname(info.ziel), '--', path.basename(info.ziel)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            proc.stderr.resume();
            proc.on('error', () => { if (!res.headersSent) seite(res, 503, '<h1>Das Archiv konnte nicht erstellt werden</h1>'); else res.destroy(); });
            proc.on('close', (code) => { if (code !== 0) res.destroy(); });
            res.on('close', () => proc.kill());
            res.setHeader('Content-Type', 'application/gzip'); proc.stdout.pipe(res);
          } else {
            const stream = fs.createReadStream(aufloesen(rel).ziel, info.st.size ? { start, end: ende } : {});
            stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy());
            res.setHeader('Content-Type', aktion === 'ansehen' ? typ : 'application/octet-stream');
            res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Content-Length', Math.max(0, ende - start + 1));
            if (req.headers.range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${ende}/${info.st.size}`); }
            stream.pipe(res);
          }
        });
      } catch (e) {
        if (res.headersSent) res.destroy(); else seite(res, e.status || 500, `<h1>Die Anfrage konnte nicht abgeschlossen werden</h1><p>${esc(e.status ? e.message : 'Bitte versuche es später erneut.')}</p>`);
      }
      return true;
    },
  };
}
