// Prüft, ob eine App wirklich antwortet – „Container läuft“ allein sagt das nicht
import http from 'node:http';
import net from 'node:net';

function tcp(port, ms) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    const fertig = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(ms, () => fertig(false));
    s.once('connect', () => fertig(true));
    s.once('error', () => fertig(false));
  });
}

function web(port, pfad, ms) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pfad || '/', timeout: ms }, (res) => {
      res.resume();
      // 401/403/302 heißen: Die App ist da und will nur eine Anmeldung
      resolve(res.statusCode < 500 ? { ok: true, text: `Antwortet (HTTP ${res.statusCode})` } : { ok: false, text: `Meldet einen Fehler (HTTP ${res.statusCode})` });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, text: 'Antwortet nicht rechtzeitig' }); });
    // Spricht die App kein HTTP (z. B. nur HTTPS), reicht der offene Port
    req.on('error', async (e) => resolve(e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' ? { ok: false, text: 'Antwortet nicht' } : { ok: await tcp(port, 3000), text: 'Port ist offen' }));
  });
}

export async function probe(app, { demo = false, ms = 8000 } = {}) {
  if (demo) return { ok: app.state === 'running', text: app.state === 'running' ? 'Antwortet (Demo)' : 'Läuft nicht' };
  if (app.probe === 'none') return { ok: app.state === 'running', text: app.state === 'running' ? 'Container läuft' : 'Läuft nicht' };
  if (app.web === false) return (await tcp(app.port, ms)) ? { ok: true, text: 'Port ist offen' } : { ok: false, text: 'Port antwortet nicht' };
  return web(app.port, app.path, ms);
}

// Wartet nach einer Installation, bis die App antwortet (große Apps brauchen Minuten)
export async function warteAufApp(app, { demo = false, ms = 300000, abbruch = () => false } = {}) {
  const ende = Date.now() + ms;
  let letzte = { ok: false, text: 'Antwortet nicht' };
  while (Date.now() < ende && !abbruch()) {
    letzte = await probe(app, { demo, ms: 5000 });
    if (letzte.ok) return letzte;
    await new Promise((r) => setTimeout(r, demo ? 200 : 4000));
  }
  return letzte;
}
