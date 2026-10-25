const H = window.Hafen;
const { h, api, toast, dialog } = H;
let info = null;

H.css(`
.ak-zeile { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.ak-zeile:last-of-type { border-bottom: 0; }
.ak-zeile span { color: var(--text-2); }
.ak-knopf { width: 100%; margin-top: 14px; }
.ak-balken { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; margin-top: 14px; }
.ak-balken i { display: block; height: 100%; width: 0; background: var(--brand); transition: width .2s; }
.ak-status { margin-top: 10px; font-size: 13px; color: var(--text-2); min-height: 1.4em; }
.ak-zurueck { margin-top: 10px; width: 100%; }
`);

const laden = async () => { try { info = await api('/api/aktualisieren'); } catch {} H.update(); };

// Upload mit Fortschritt (fetch kennt keinen Upload-Fortschritt)
function hochladen(datei, aelter, fortschritt) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/aktualisieren' + (aelter ? '?aelter=1' : ''));
    x.setRequestHeader('Content-Type', 'application/zip');
    x.upload.onprogress = (e) => e.lengthComputable && fortschritt(e.loaded / e.total);
    x.onload = () => {
      let r = {}; try { r = JSON.parse(x.responseText); } catch {}
      x.status === 200 ? resolve(r) : reject(new Error(r.error || `Fehler ${x.status}`));
    };
    x.onerror = () => reject(new Error('Die Verbindung zu Hafen ist abgebrochen.'));
    x.send(datei);
  });
}

// Nach dem Neustart warten, bis Hafen mit der neuen Fassung antwortet, dann die Seite neu laden
async function aufNeustartWarten(alt, status) {
  const bis = Date.now() + 120000;
  await new Promise((r) => setTimeout(r, 1500));
  while (Date.now() < bis) {
    try {
      const s = await fetch('/api/status', { cache: 'no-store' }).then((r) => r.json());
      if (s.version && s.version !== alt) { status(`Hafen ${s.version} läuft. Seite wird neu geladen …`); setTimeout(() => location.reload(), 800); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  status('Hafen meldet sich nicht zurück. Warte noch etwas und lade die Seite dann neu. Hilft das nicht, im Terminal: tail -f ~/hafen-daten/hafen.log');
}

function oeffnen() {
  void laden();
  const balken = h('i'), status = h('p', { class: 'ak-status' });
  const setStatus = (t) => { status.textContent = t; };
  const eingabe = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: () => eingabe.files[0] && starten(eingabe.files[0]) });
  const knopf = h('button', { class: 'btn ak-knopf', onclick: () => eingabe.click() }, 'hafen.zip auswählen …');
  const zurueck = h('button', { class: 'btn ghost ak-zurueck', style: 'display:none', onclick: () => zurueckholen() });
  const version = h('b', {}, info?.version || '…'), vorige = h('b', {}, '–');

  async function starten(datei, aelter = false) {
    knopf.disabled = true; zurueck.disabled = true;
    setStatus('Wird hochgeladen …'); balken.style.width = '0';
    try {
      const r = await hochladen(datei, aelter, (a) => { balken.style.width = `${Math.round(a * 100)}%`; if (a >= 1) setStatus('Wird geprüft …'); });
      if (r.frage === 'aelter') {
        knopf.disabled = false; zurueck.disabled = false; setStatus('');
        return dialog('Ältere Fassung einspielen?', `Die Datei enthält Hafen ${r.neue}, installiert ist ${r.aktuell}. Trotzdem einspielen?`,
          { confirm: 'Einspielen', danger: true, onConfirm: () => starten(datei, true) });
      }
      if (r.demo) { setStatus(`Geprüft: Hafen ${r.neue}. Im Demo-Modus wird nichts ersetzt.`); knopf.disabled = false; zurueck.disabled = false; return; }
      balken.style.width = '100%';
      setStatus(`Hafen ${r.neue} ist eingespielt und startet neu …`);
      await aufNeustartWarten(r.aktuell, setStatus);
    } catch (e) {
      setStatus(''); toast(e.message, true); knopf.disabled = false; zurueck.disabled = false;
    } finally { eingabe.value = ''; }
  }

  function zurueckholen() {
    dialog('Vorige Fassung zurückholen?', `Hafen wechselt zurück auf ${info.vorige} und startet neu. Deine Apps und Daten bleiben, wie sie sind.`, {
      confirm: 'Zurückholen', danger: true, onConfirm: async () => {
        knopf.disabled = true; zurueck.disabled = true;
        try {
          const r = await api('/api/aktualisieren/zurueck', {});
          if (r.demo) { setStatus('Im Demo-Modus wird nichts ersetzt.'); knopf.disabled = false; zurueck.disabled = false; return; }
          setStatus(`Hafen ${r.neue} wird wiederhergestellt …`);
          await aufNeustartWarten(info.version, setStatus);
        } catch (e) { toast(e.message, true); knopf.disabled = false; zurueck.disabled = false; }
      },
    });
  }

  const zeigen = () => {
    version.textContent = info?.version || '…';
    vorige.textContent = info?.vorige || '–';
    zurueck.style.display = info?.vorige ? '' : 'none';
    zurueck.textContent = `Zurück zu ${info?.vorige}`;
  };
  zeigen();
  api('/api/aktualisieren').then((r) => { info = r; zeigen(); }).catch(() => {});

  dialog('Hafen aktualisieren', 'Lade die neue hafen.zip hoch. Hafen prüft sie, sichert die laufende Fassung und startet neu. Deine Apps und Daten bleiben erhalten.', {
    extra: h('div', {},
      h('div', { class: 'ak-zeile' }, h('span', {}, 'Installiert'), version),
      h('div', { class: 'ak-zeile' }, h('span', {}, 'Gesicherte vorige Fassung'), vorige),
      eingabe, knopf, h('div', { class: 'ak-balken' }, balken), status, zurueck),
  });
}

H.addSettingsItem(() => ({ tab: 'system', ic: 'refresh', title: 'Hafen aktualisieren',
  desc: info ? `Installiert: ${info.version}` : 'Neue Fassung per hafen.zip einspielen', onclick: oeffnen }));
H.onPoll(() => { if (!info && H.state.status?.loggedIn) void laden(); });
