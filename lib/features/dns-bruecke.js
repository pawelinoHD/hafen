// DNS-Brücke für den Mac: Colima leitet UDP aus der VM nicht weiter und hält TCP-Port 53 selbst belegt.
// Deshalb nimmt Hafen die Anfragen auf UDP 53 an und reicht sie per DNS über TCP an den Werbefilter weiter.
import dgram from 'node:dgram';
import net from 'node:net';

const ZEITLIMIT = 4000;

function weiterreichen(frage, port) {
  return new Promise((resolve) => {
    const tcp = net.connect({ host: '127.0.0.1', port });
    let daten = Buffer.alloc(0);
    const fertig = (antwort) => { tcp.destroy(); resolve(antwort); };
    tcp.setTimeout(ZEITLIMIT, () => fertig(null));
    tcp.once('error', () => fertig(null));
    tcp.once('connect', () => {
      const laenge = Buffer.alloc(2);
      laenge.writeUInt16BE(frage.length);
      tcp.write(Buffer.concat([laenge, frage]));
    });
    tcp.on('data', (d) => {
      daten = Buffer.concat([daten, d]);
      if (daten.length >= 2 && daten.length >= 2 + daten.readUInt16BE(0)) fertig(daten.subarray(2, 2 + daten.readUInt16BE(0)));
    });
  });
}

export default async function (ctx) {
  if (process.platform !== 'darwin' || ctx.DEMO) return {};
  let sock = null, ziel = 0;

  const stoppen = () => { sock?.close(); sock = null; };
  function starten() {
    const s = dgram.createSocket('udp4');
    s.on('error', (e) => { ctx.log(`DNS-Brücke: ${e.message}`); if (sock === s) stoppen(); });
    s.on('message', async (frage, von) => {
      const antwort = await weiterreichen(frage, ziel);
      if (antwort && sock === s) s.send(antwort, von.port, von.address);
    });
    s.bind(53, '0.0.0.0', () => ctx.log('DNS-Brücke: lauscht auf UDP 53.'));
    sock = s;
  }
  async function abgleichen() {
    const app = (await ctx.apps.list().catch(() => [])).find((a) => a.dnsBruecke && a.installed && a.state === 'running');
    if (app) { ziel = app.dnsBruecke; if (!sock) starten(); } else stoppen();
  }
  void abgleichen();
  setInterval(() => void abgleichen(), 20000).unref();
  return {};
}
