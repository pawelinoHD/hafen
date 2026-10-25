const Hafen = window.Hafen;
const { h, api, toast, dialog, field, check, go } = Hafen;

Hafen.css(`
.ea-form { gap: 16px; }
.ea-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ea-form .f { min-width: 0; }
.ea-form textarea { width: 100%; resize: vertical; line-height: 1.55; padding: 12px; height: auto; min-height: 88px; }
.ea-form textarea.ea-code { min-height: 140px; }
.ea-form textarea.ea-code[rows="16"] { min-height: 300px; }
.ea-code { font-family: var(--mono); font-size: 12px; tab-size: 2; white-space: pre; }
.ea-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ea-chips button { font-family: var(--mono); font-size: 11px; }
.ea-preview { width: 42px; height: 42px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand-hi); font-weight: 700; overflow: hidden; }
.ea-preview img { width: 100%; height: 100%; object-fit: contain; }
.ea-icon { display: flex; align-items: center; gap: 10px; }
.ea-icon input { min-width: 0; flex: 1; }
.ea-notice { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--warn); font-size: 13px; }
.ea-notice:empty { display: none; }
.ea-run { padding: 16px; border: 1px solid var(--line-2); border-radius: 18px; background: var(--brand-soft); }
.ea-run[hidden] { display: none; }
.ea-dialog { max-height: 90vh; overflow-y: auto; width: min(820px, 100%); }
.ea-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
@media (max-width: 600px) { .ea-grid { grid-template-columns: 1fr; } }
`);

const vorlage = 'services:\n  app:\n    image: nginx:alpine\n    restart: unless-stopped\n    ports:\n      - "${APP_PORT}:80"\n    environment:\n      TZ: ${TZ}\n';

async function bearbeiten(app) {
  try {
    const data = app ? await api('/api/eigene-apps?id=' + encodeURIComponent(app.id)) : null;
    editor(data);
  } catch (e) { toast(e.message, true); }
}

function editor(data) {
  const meta = data?.app || {};
  const input = (value = '', attrs = {}) => h('input', { class: 'input', value, ...attrs });
  const name = input(meta.name, { maxlength: 100, required: true });
  const tagline = input(meta.tagline, { maxlength: 240 });
  const categories = [...new Set(['Eigene Apps', ...Hafen.state.apps.map((a) => a.category).filter(Boolean), meta.category].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const category = h('select', { class: 'input' }, categories.map((c) => h('option', { value: c, selected: c === (meta.category || 'Eigene Apps') }, c)));
  const port = input(meta.port || 8080, { type: 'number', min: 1024, max: 65535, step: 1, required: true });
  const extraPorts = input((meta.extraPorts || []).join(', '), { placeholder: 'Zum Beispiel 8443, 9000' });
  const icon = input(meta.icon, { type: 'url', placeholder: 'https://…' });
  const website = input(meta.website, { type: 'url', placeholder: 'https://…' });
  const description = h('textarea', { class: 'input', rows: 3, maxlength: 16000 }, meta.description || '');
  const compose = h('textarea', { class: 'input ea-code', rows: 16, spellcheck: 'false', 'aria-label': 'Compose-Datei' }, data?.compose || vorlage);
  const run = h('textarea', { class: 'input ea-code', rows: 5, spellcheck: 'false', placeholder: 'docker run -d -p 8080:80 nginx:alpine', 'aria-label': 'docker run-Befehl' });
  const notice = h('div', { class: 'ea-notice', role: 'status', 'aria-live': 'polite' });
  const error = h('div', { class: 'ea-notice', role: 'alert' });
  const preview = h('span', { class: 'ea-preview', 'aria-label': 'Icon-Vorschau' });
  const previewUpdate = () => {
    preview.textContent = (name.value.trim() || 'EA').slice(0, 2).toUpperCase();
    try {
      const u = new URL(icon.value);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return;
      preview.replaceChildren(h('img', { src: u.href, alt: 'App-Symbol', referrerpolicy: 'no-referrer', onerror: () => { preview.textContent = (name.value.trim() || 'EA').slice(0, 2).toUpperCase(); } }));
    } catch { /* Ohne gültige URL bleiben die Anfangsbuchstaben sichtbar. */ }
  };
  icon.addEventListener('change', previewUpdate); name.addEventListener('input', previewUpdate); previewUpdate();
  let web = meta.web !== false;
  const webSwitch = h('button', { type: 'button', class: 'switch' + (web ? ' on' : ''), role: 'switch', 'aria-checked': String(web), 'aria-label': 'Hat eine Weboberfläche', onclick: () => {
    web = !web; webSwitch.classList.toggle('on', web); webSwitch.setAttribute('aria-checked', String(web));
  } }, h('i'));
  const privileged = check('Privilegierten Zugriff erlauben (voller Zugriff auf den Docker-Host)', false);
  function insert(text) {
    compose.setRangeText(text, compose.selectionStart, compose.selectionEnd, 'end');
    compose.focus(); compose.dispatchEvent(new Event('input', { bubbles: true }));
  }
  compose.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insert('  '); } });
  const convert = h('button', { type: 'button', class: 'btn', onclick: async () => {
    convert.disabled = true; error.textContent = '';
    try {
      const result = await api('/api/eigene-apps/aus-docker-run', { befehl: run.value });
      compose.value = result.compose; port.value = result.port; name.value = result.name;
      notice.textContent = result.warnungen.join('\n'); previewUpdate(); compose.focus();
    } catch (e) { error.textContent = e.message; }
    finally { convert.disabled = false; }
  } }, 'Umwandeln');
  const runPanel = h('div', { class: 'ea-run wform', hidden: true }, field('docker run einfügen', run, 'Der Befehl wird nur umgewandelt und nicht ausgeführt.'), convert);
  const segment = h('div', { class: 'seg', role: 'group', 'aria-label': 'Vorlage wählen' });
  for (const [index, label] of ['Compose-Datei', 'docker run einfügen'].entries()) segment.append(h('button', { type: 'button', class: index === 0 ? 'on' : '', 'aria-pressed': String(index === 0), onclick: (e) => {
    for (const b of segment.children) { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }
    runPanel.hidden = index !== 1;
  } }, label));
  const chips = h('div', { class: 'ea-chips', 'aria-label': 'Verfügbare Variablen' }, ['APP_PORT', 'APP_DATA_DIR', 'HAFEN_STORAGE', 'TZ', 'PUID', 'PGID', 'APP_PASSWORD', 'APP_SECRET'].map((v) => {
    const variable = '${' + v + '}';
    return h('button', { type: 'button', class: 'btn ghost small', onmousedown: (e) => e.preventDefault(), onclick: () => insert(variable) }, variable);
  }));
  const form = h('form', { class: 'wform ea-form' }, segment, runPanel,
    h('div', { class: 'ea-grid' }, field('Name', name), field('Kurzbeschreibung', tagline), field('Kategorie', category), field('Port', port),
      field('Icon-URL (optional)', h('div', { class: 'ea-icon' }, icon, preview)), field('Webseite (optional)', website)),
    h('div', { class: 'ea-toggle' }, h('span', {}, 'Hat eine Weboberfläche'), webSwitch),
    field('Beschreibung', description), field('Compose-Datei', compose, 'Nutze eingerücktes YAML. Tab fügt zwei Leerzeichen ein. Host-Pfade müssen unter ${APP_DATA_DIR} oder ${HAFEN_STORAGE} liegen.'),
    chips, field('Zusätzliche Ports (optional)', extraPorts, 'Kommagetrennt. Veröffentlichte Compose-Ports werden automatisch ergänzt.'), privileged.el, notice, error);
  const wrap = dialog(data ? 'Eigene App bearbeiten' : 'Eigene App hinzufügen', 'Füge Deine App zum Store hinzu. Anschließend kannst Du sie wie andere Apps installieren.', { wide: true, extra: form });
  wrap.querySelector('.dialog').classList.add('ea-dialog');
  const save = h('button', { type: 'button', class: 'btn', onclick: () => form.requestSubmit() }, 'Speichern');
  wrap.querySelector('.acts').append(save);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (save.disabled) return;
    save.disabled = true; error.textContent = '';
    try {
      const extras = extraPorts.value.trim() ? extraPorts.value.split(',').map((v) => /^\s*\d+\s*$/.test(v) ? Number(v) : NaN) : [];
      if (extras.some((v) => !Number.isInteger(v))) throw new Error('Trenne zusätzliche Ports mit Kommas und nutze nur ganze Zahlen.');
      const result = await api('/api/eigene-apps', { ...(data ? { id: data.id } : {}), name: name.value, tagline: tagline.value, kategorie: category.value,
        port: Number(port.value), extraPorts: extras, icon: icon.value, webseite: website.value, beschreibung: description.value, web, compose: compose.value, erlaubePrivilegiert: privileged.get() });
      await Hafen.poll(); wrap.remove(); toast(result.hinweis || 'Eigene App gespeichert'); go('#/store/' + encodeURIComponent(result.id));
      if (result.warnungen?.length) dialog('Prüfe Deine Compose-Datei', result.warnungen.join('\n'), {});
    } catch (e) { error.textContent = e.message; }
    finally { save.disabled = false; }
  });
}

Hafen.addStoreAction({ label: 'Eigene App', icon: () => Hafen.icon('plus'), onClick: () => bearbeiten() });
Hafen.addAppMenuItem((app) => app.custom ? { label: 'Bearbeiten …', fn: () => bearbeiten(app) } : null);
Hafen.addAppMenuItem((app) => app.custom && !app.installed ? { label: 'Aus dem Store entfernen', danger: true, fn: () => {
  dialog('Eigene App entfernen?', `Möchtest Du „${app.name}“ aus Deinem Store entfernen? Die App-Vorlage wird gelöscht.`, { confirm: 'Entfernen', danger: true, onConfirm: async () => {
    try { await api('/api/eigene-apps/loeschen', { id: app.id }); await Hafen.poll(); toast('Eigene App aus dem Store entfernt'); go('#/store'); }
    catch (e) { toast(e.message, true); }
  } });
} } : null);
