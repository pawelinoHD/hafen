const H = window.Hafen;
const { h, api, toast, dialog, field, check, fmtBytes, fmtDate, relTime } = H;
const labels = { einstellungen: 'Einstellungen', 'app-daten': 'App-Daten', datenbanken: 'Datenbanken', speicher: 'Speicher' };
let data = null, error = '', pending = false, timer = null, revision = 0, saving = false;
const open = () => location.hash.split('/')[1] === 'backups';
const lastBackup = () => data?.ergebnisse.find(e => e.art === 'Sicherung' && e.erfolg);
H.css(`
.bk-window { max-width: 920px; margin: auto; }
.bk-window .box { margin: 18px 0; }
.bk-status { padding: 24px; border: 1px solid var(--line-2); border-radius: 22px; background: linear-gradient(135deg,rgba(13,139,148,.23),rgba(255,255,255,.025)); }
.bk-status .kv { margin: 14px 0 20px; }
.bk-status dd { overflow-wrap: anywhere; }
.bk-progress { margin-top: 18px; display: grid; gap: 9px; }
.bk-progress .bar { height: 7px; }
.bk-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.bk-list { border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
.bk-entry { display: flex; align-items: center; gap: 16px; padding: 18px; border-bottom: 1px solid var(--line); }
.bk-entry:last-child { border-bottom: 0; }
.bk-entry > div { flex: 1; min-width: 0; }
.bk-entry small { display: block; margin-top: 4px; color: var(--text-2); }
.bk-warning { color: var(--warn); line-height: 1.55; overflow-wrap: anywhere; }
.bk-form { margin-top: 18px; }
.bk-switch { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.bk-switch label { flex: 1; }
.bk-result { margin-top: 14px; font-size: 13px; color: var(--text-2); }
@media(max-width:600px) { .bk-fields { grid-template-columns: 1fr; } .bk-status { padding: 18px; } }
`);

async function refresh() {
  if (pending) return;
  pending = true;
  try { data = await api('/api/backup'); error = ''; }
  catch (e) { error = e.message; }
  finally { pending = false; H.update(); schedule(); }
}
function schedule() {
  clearTimeout(timer); timer = null;
  if (open()) timer = setTimeout(refresh, data?.laufend ? 2000 : 15000);
}
window.addEventListener('hashchange', () => { clearTimeout(timer); if (open() || location.hash.startsWith('#/settings')) void refresh(); });
async function action(route, body, message) {
  try { const result = await api(route, body); toast(result.hinweis || message); await refresh(); }
  catch (e) { toast(e.message, true); await refresh(); }
}
function restore(name) {
  const entry = data?.sicherungen.find(x => x.name === name); if (!entry) return;
  const choices = entry.teile.map(p => [p, check(labels[p], true)]);
  dialog('Sicherung wiederherstellen?', 'Die ausgewählten Daten werden durch diese Sicherung ersetzt. Laufende Apps werden dafür angehalten. Nach der Wiederherstellung der Einstellungen musst du Hafen neu starten.', {
    danger: true, confirm: 'Wiederherstellen',
    extra: h('div', { class: 'wform' }, h('p', { class: 'bk-warning' }, `Sicherung: ${fmtDate(entry.datum)}. Änderungen seit diesem Zeitpunkt gehen verloren. Sichere aktuelle Daten vorher separat.`), choices.map(([, c]) => c.el)),
    onConfirm: () => {
      const teile = choices.filter(([, c]) => c.get()).map(([p]) => p);
      if (!teile.length) return toast('Wähle mindestens einen Teil aus.', true);
      void action('/api/backup/restore', { name, teile, bestaetigt: true }, 'Wiederherstellung gestartet');
    },
  });
}
function remove(name) {
  dialog('Sicherung löschen?', `Die Sicherung „${name}“ wird dauerhaft gelöscht.`, { danger: true, confirm: 'Löschen', onConfirm: () => action('/api/backup/delete', { name }, 'Sicherung gelöscht') });
}
function toggle(label, value, id) {
  let enabled = value;
  const button = h('button', { type: 'button', id, class: `switch${enabled ? ' on' : ''}`, role: 'switch', 'aria-checked': String(enabled), 'aria-label': label,
    onclick: () => { enabled = !enabled; button.classList.toggle('on', enabled); button.setAttribute('aria-checked', String(enabled)); } }, h('i'));
  return { el: h('div', { class: 'bk-switch' }, h('label', { for: id }, label), button), get: () => enabled };
}
function form() {
  const s = data.einstellungen;
  const ziel = h('input', { class: 'input', value: s.ziel, placeholder: '/Volumes/MeineFestplatte/Hafen-Backups', required: true, id: 'bk-ziel' });
  const zeit = h('input', { class: 'input', type: 'time', value: s.zeit, required: true, id: 'bk-zeit' });
  const behalten = h('input', { class: 'input', type: 'number', min: 1, max: 365, value: s.behalten, required: true, id: 'bk-behalten' });
  const aktiv = check('Täglich automatisch sichern', s.aktiv);
  const appDaten = toggle('App-Daten und Datenbanken sichern', s.appDaten, 'bk-appdaten');
  const speicher = toggle('Speicher-Ordner sichern', s.speicher, 'bk-speicher');
  const appsAnhalten = toggle('Apps während der Sicherung kurz anhalten', s.appsAnhalten, 'bk-anhalten');
  const save = h('button', { type: 'submit', class: 'btn' }, 'Einstellungen speichern');
  return h('form', { class: 'wform bk-form', 'data-keep': `bk-form-${revision}-${JSON.stringify(s)}`, onsubmit: async e => {
    e.preventDefault(); if (saving) return;
    saving = true; save.disabled = true;
    try {
      await api('/api/backup', { ziel: ziel.value.trim(), zeit: zeit.value, behalten: Number(behalten.value), aktiv: aktiv.get(), appDaten: appDaten.get(), speicher: speicher.get(), appsAnhalten: appsAnhalten.get() });
      revision++; toast('Backup-Einstellungen gespeichert'); await refresh();
    } catch (err) { toast(err.message, true); }
    finally { saving = false; save.disabled = false; }
  } }, field('Ziel-Ordner', ziel, 'z. B. /Volumes/MeineFestplatte/Hafen-Backups. Verwende einen Ordner außerhalb der Hafen-Daten.'),
  aktiv.el, h('div', { class: 'bk-fields' }, field('Uhrzeit', zeit, 'Ortszeit deines Servers'), field('Sicherungen behalten', behalten, 'Ältere Sicherungen werden automatisch gelöscht.')),
  appDaten.el, speicher.el,
  h('p', { class: 'muted' }, `Der Speicher-Ordner kann sehr groß sein. Aktuell ${data.speicherGroesse.unvollstaendig ? 'mindestens ' : ''}${fmtBytes(data.speicherGroesse.bytes)}; die Größe wird höchstens alle fünf Minuten neu ermittelt.`),
  appsAnhalten.el, h('p', { class: 'muted' }, 'Ohne Anhalten können App-Daten während des Schreibens gesichert werden und unvollständig sein.'), save);
}
function render() {
  if (!data) return h('div', { class: 'win-body bk-window' }, h('h2', { class: 'win-title' }, 'Backups'), h('p', {}, error || 'Backups werden geladen …'), error && h('button', { class: 'btn', onclick: refresh }, 'Erneut versuchen'));
  const last = lastBackup(), result = data.ergebnisse[0], busy = !!data.laufend;
  return h('div', { class: 'win-body bk-window' }, h('h2', { class: 'win-title' }, 'Backups'),
    h('p', { class: 'muted' }, 'Sichere Hafen und deine Daten auf einer externen Festplatte.'),
    h('section', { class: 'bk-status' }, h('h3', {}, busy ? data.laufend.art : 'Deine Sicherungen'),
      h('dl', { class: 'kv' }, h('dt', {}, 'Letzte Sicherung'), h('dd', {}, last ? fmtDate(last.zeit) : 'Noch keine'),
        h('dt', {}, 'Nächste Sicherung'), h('dd', {}, data.naechste ? fmtDate(data.naechste) : 'Zeitplan aus'),
        h('dt', {}, 'Ziel'), h('dd', {}, data.einstellungen.ziel || 'Nicht eingerichtet'),
        h('dt', {}, 'Freier Platz'), h('dd', {}, data.frei === null ? 'Nicht verfügbar' : fmtBytes(data.frei))),
      h('button', { class: 'btn big', disabled: busy || !data.einstellungen.ziel || data.neustart, onclick: () => action('/api/backup/run', {}, 'Sicherung gestartet') }, 'Jetzt sichern'),
      busy && h('div', { class: 'bk-progress', role: 'status', 'aria-live': 'polite' }, data.laufend.schritt,
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Fortschritt', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(data.laufend.anteil * 100) }, h('i', { style: `width:${Math.round(data.laufend.anteil * 100)}%` }))),
      result && h('p', { class: result.erfolg ? 'bk-result' : 'bk-warning' }, `${result.art} ${result.erfolg ? 'abgeschlossen' : 'fehlgeschlagen'} · ${fmtDate(result.zeit)}${result.fehler ? ': ' + result.fehler : ''}`),
      (error || data.zielFehler) && h('p', { class: 'bk-warning' }, error || data.zielFehler),
      data.neustart && h('p', { class: 'bk-warning' }, 'Starte Hafen jetzt neu, damit die wiederhergestellten Einstellungen geladen werden.')),
    h('section', { class: 'box' }, h('h4', {}, 'Backup-Einstellungen'), form()),
    h('section', { class: 'box' }, h('h4', {}, 'Gespeicherte Sicherungen'),
      data.sicherungen.length ? h('div', { class: 'bk-list' }, data.sicherungen.map(entry => h('div', { class: 'bk-entry', 'data-backup': entry.name },
        h('div', {}, h('b', {}, fmtDate(entry.datum)), h('small', {}, `${fmtBytes(entry.groesse)} · ${entry.teile.map(p => labels[p]).join(', ')}`)),
        h('button', { class: 'icon-btn', disabled: busy || data.neustart, 'aria-label': `Aktionen für ${entry.name}`, onclick: e => {
          const name = e.currentTarget.closest('[data-backup]').getAttribute('data-backup');
          const r = e.currentTarget.getBoundingClientRect();
          H.openMenu(r.right, r.bottom, [{ label: 'Wiederherstellen …', fn: () => restore(name) }, { label: 'Löschen', danger: true, fn: () => remove(name) }]);
        } }, '⋯')))) : h('div', { class: 'empty' }, h('b', {}, 'Noch keine Sicherungen'), 'Richte dein Ziel ein und klicke auf „Jetzt sichern“.')));
}
H.registerWindow('backups', { title: 'Backups', hidden: true, render, onOpen: refresh,
  dockSvg: '<svg viewBox="0 0 52 52"><defs><linearGradient id="bk-dock" x2="1" y2="1"><stop stop-color="#13a8b2"/><stop offset="1" stop-color="#164b8e"/></linearGradient></defs><rect width="52" height="52" rx="13" fill="url(#bk-dock)"/><g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 23a15 15 0 1 1 2 13M12 14v9h9M26 17v10l7 4"/></g></svg>',
});
H.addSettingsItem(() => ({ tab: 'system', ic: 'clock', title: 'Backups', desc: 'Hafen und deine Daten sichern und wiederherstellen',
  right: h('span', { class: 'muted' }, lastBackup() ? `Letzte: ${relTime(lastBackup().zeit)}` : data?.einstellungen.ziel ? 'Noch keine Sicherung' : 'Nicht eingerichtet'), onclick: () => H.go('#/backups') }));
let initialLoaded = false;
H.onPoll(() => { if (!initialLoaded && H.state.status?.loggedIn) { initialLoaded = true; void refresh(); } });
