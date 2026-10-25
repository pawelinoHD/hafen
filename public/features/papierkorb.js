const H = window.Hafen;
const { h, api, icon, toast, dialog, fmtBytes, update } = H;
H.icons.papierkorb = '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>';
let daten = null, fehler = '', laedt = false, beschaeftigt = false, zuletzt = 0;
const auswahl = new Set();
async function laden() {
  if (laedt || beschaeftigt) return;
  laedt = true; zuletzt = Date.now();
  try {
    daten = await api('/api/papierkorb'); fehler = '';
    for (const id of auswahl) if (!daten.eintraege.some((e) => e.id === id)) auswahl.delete(id);
  } catch (e) { fehler = e.message; }
  finally { laedt = false; update(); }
}
async function aktion(pfad, body, fertig) {
  if (beschaeftigt) return;
  beschaeftigt = true; update();
  try { const r = await api(pfad, body); auswahl.clear(); fertig?.(r); }
  catch (e) { toast(e.message, true); }
  finally { beschaeftigt = false; await laden(); H.reloadFiles(); }
}
function loeschen(alles) {
  const ids = [...auswahl];
  dialog(alles ? 'Papierkorb leeren?' : 'Endgültig löschen?',
    alles ? 'Alle Einträge werden endgültig gelöscht. Du kannst sie danach nicht wiederherstellen.' : `${ids.length} ausgewählte Einträge werden endgültig gelöscht. Du kannst sie danach nicht wiederherstellen.`, {
      confirm: alles ? 'Papierkorb leeren' : 'Endgültig löschen', danger: true,
      onConfirm: () => aktion(`/api/papierkorb/${alles ? 'leeren' : 'loeschen'}`, alles ? {} : { ids }, () => toast('Endgültig gelöscht.')),
    });
}
function wiederherstellen() {
  return aktion('/api/papierkorb/wiederherstellen', { ids: [...auswahl] }, (r) => {
    const orte = r.wiederhergestellt.map((e) => e.path);
    toast(orte.length === 1 ? `Wiederhergestellt unter „${orte[0]}“.` : `${orte.length} Einträge an ihren ursprünglichen Orten wiederhergestellt.`);
    if (orte.length > 1) dialog('Dateien wiederhergestellt', 'Hier findest du deine Dateien:', {
      extra: h('div', { class: 'pk-orte' }, orte.map((p) => h('div', {}, p))),
    });
  });
}
function einstellungen() {
  const segment = H.choice([[0, 'Aus'], [7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage']], daten?.tage ?? 30);
  dialog('Papierkorb', 'Wähle, wie lange du gelöschte Dateien behalten möchtest. Bei „Aus“ werden neue Löschungen sofort endgültig ausgeführt. Bereits enthaltene Dateien bleiben höchstens 30 Tage erhalten.', {
    extra: h('div', { class: 'wform' }, H.field('Aufbewahrungsdauer', segment.el), h('p', {}, `Belegung: ${fmtBytes(daten?.gesamtgroesse || 0)}`)),
    confirm: 'Speichern', onConfirm: () => aktion('/api/papierkorb/einstellungen', { tage: segment.get() }, () => toast('Aufbewahrungsdauer gespeichert.')),
  });
}
H.setDeleteHint(() => daten?.tage === 0 ? 'Die Datei oder der Ordner wird endgültig gelöscht.' : `Landet im Papierkorb – du kannst es ${daten?.tage ?? 30} Tage lang wiederherstellen.`);
H.addFilesSideItem({ label: 'Papierkorb', icon: () => icon('papierkorb'), onClick: () => H.go('#/papierkorb') });
H.addSettingsItem(() => ({ tab: 'system', ic: 'papierkorb', title: 'Papierkorb', desc: `${daten?.tage === 0 ? 'Aus' : `${daten?.tage ?? 30} Tage Aufbewahrung`} · ${daten ? fmtBytes(daten.gesamtgroesse) : 'Belegung wird geladen'}`, onclick: einstellungen }));
H.onPoll(() => { if (H.state.status?.loggedIn && Date.now() - zuletzt > 10000) void laden(); });
H.css(`
.pk-kopf,.pk-aktionen{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.pk-kopf .win-title{flex:1;margin:0}.pk-hinweis{color:var(--text-2);font-size:13px;margin-bottom:22px}
.pk-tabelle{overflow:auto;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025)}
.pk-tabelle table{border-collapse:collapse;width:100%;min-width:620px;font-size:13px;text-align:left}
.pk-tabelle th,.pk-tabelle td{padding:13px 14px;border-bottom:1px solid var(--line);max-width:300px;overflow-wrap:anywhere}
.pk-tabelle th{font-weight:500;color:var(--text-3)}.pk-tabelle tr:last-child td{border:0}.pk-tabelle tr.pk-gewaehlt{background:rgba(13,139,148,.15)}
.pk-tabelle input{accent-color:var(--brand-hi);width:16px;height:16px}.pk-tabelle svg{width:18px;height:18px;vertical-align:middle;margin-right:8px;color:var(--brand-hi)}
.pk-aktionen span{color:var(--text-3);font-size:13px}.pk-orte{max-height:240px;overflow:auto;overflow-wrap:anywhere;font-size:13px}.pk-orte div{padding:6px 0}
`);
H.registerWindow('papierkorb', {
  hidden: true, title: 'Papierkorb', onOpen: laden,
  dockSvg: '<svg viewBox="0 0 52 52"><defs><linearGradient id="pk-farbe" x2="0" y2="1"><stop stop-color="#20b9bd"/><stop offset="1" stop-color="#09515f"/></linearGradient></defs><rect width="52" height="52" rx="13" fill="url(#pk-farbe)"/><path d="M15 18h22M22 18v-5h8v5M18 18l2 23h12l2-23M24 24v10M28 24v10" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>',
  render() {
    const eintraege = daten?.eintraege || [];
    return h('div', { class: 'win-body' },
      h('div', { class: 'pk-kopf' }, h('h2', { class: 'win-title' }, 'Papierkorb'),
        h('button', { class: 'btn danger small', disabled: beschaeftigt || !eintraege.length, onclick: () => loeschen(true) }, 'Papierkorb leeren')),
      h('div', { class: 'pk-hinweis' }, `${fmtBytes(daten?.gesamtgroesse || 0)} · ${daten?.tage === 0 ? 'Papierkorb aus · Vorhandene Einträge werden nach 30 Tagen gelöscht' : `Wird nach ${daten?.tage ?? 30} Tagen automatisch geleert`}`),
      h('div', { class: 'pk-aktionen' },
        h('button', { class: 'btn', disabled: beschaeftigt || !auswahl.size, onclick: wiederherstellen }, 'Wiederherstellen'),
        h('button', { class: 'btn danger', disabled: beschaeftigt || !auswahl.size, onclick: () => loeschen(false) }, 'Endgültig löschen'),
        h('span', {}, `${auswahl.size} ausgewählt`),
        h('button', { class: 'btn ghost small', disabled: laedt || beschaeftigt, onclick: laden }, 'Aktualisieren')),
      fehler ? h('div', { class: 'empty', role: 'alert' }, fehler) : !daten ? h('div', { class: 'empty' }, 'Papierkorb wird geladen …') : !eintraege.length ? h('div', { class: 'empty' }, h('b', {}, 'Der Papierkorb ist leer.')) :
        h('div', { class: 'pk-tabelle' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, h('input', { type: 'checkbox', 'aria-label': 'Alle Einträge auswählen', checked: eintraege.every((e) => auswahl.has(e.id)), disabled: beschaeftigt,
            onchange: (ev) => { auswahl.clear(); if (ev.currentTarget.checked) for (const e of daten.eintraege) auswahl.add(e.id); update(); } })),
          ['Name', 'Ursprünglicher Ort', 'Gelöscht', 'Größe'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, eintraege.map((e) => h('tr', { 'data-id': e.id, class: auswahl.has(e.id) ? 'pk-gewaehlt' : '' },
            h('td', {}, h('input', { type: 'checkbox', 'aria-label': `${e.name} auswählen`, checked: auswahl.has(e.id), disabled: beschaeftigt,
              onchange: (ev) => { if (ev.currentTarget.checked) auswahl.add(e.id); else auswahl.delete(e.id); update(); } })),
            h('td', {}, icon(e.ordner ? 'folder' : 'papierkorb'), e.name),
            h('td', {}, e.ursprung.includes('/') ? e.ursprung.slice(0, e.ursprung.lastIndexOf('/')) : 'Speicher-Hauptordner'),
            h('td', { title: H.fmtDate(e.geloescht) }, H.relTime(e.geloescht)), h('td', {}, fmtBytes(e.groesse))))))));
  },
});
