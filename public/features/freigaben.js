const H = window.Hafen;
const { h, api, toast, dialog, field, choice, icon, fmtBytes, fmtDate } = H;
let liste = null, ladefehler = '', zuletzt = 0, laeuft = false;
const hinweis = 'Funktioniert im Heimnetz – von unterwegs über Tailscale oder einen Proxy wie Nginx Proxy Manager.';
// Unter „localhost“ geöffnet, wäre der Link auf anderen Geräten nutzlos – dann den Netzwerknamen nehmen
const adresse = (token) => `${location.protocol}//${H.connectHosts()[0]}${location.port ? ':' + location.port : ''}/s/${token}`;
H.css(`.fg-liste{display:grid;gap:12px;margin-top:20px}.fg-karte{padding:20px;border:1px solid var(--line);border-radius:20px;background:var(--card)}.fg-kopf{display:flex;align-items:center;gap:10px}.fg-kopf b{overflow-wrap:anywhere}.fg-pfad{overflow-wrap:anywhere;color:var(--text-3);margin:7px 0}.fg-details{color:var(--text-2);font-size:13px;line-height:1.7}.fg-aktionen{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.fg-link{font-family:var(--mono);font-size:15px;width:100%;padding:14px}.fg-hinweis{font-size:13px;color:var(--text-2);line-height:1.6}.fg-form .seg{display:flex;flex-wrap:wrap}.fg-form .seg button{flex:1}.fg-fehler{color:var(--bad);font-size:13px}.fg-oben{display:flex;align-items:center;justify-content:space-between;gap:12px}`);
async function laden() {
  if (laeuft) return;
  laeuft = true; zuletzt = Date.now();
  try { liste = await api('/api/freigaben'); ladefehler = ''; }
  catch (e) { ladefehler = e.message; }
  finally { laeuft = false; H.update(); }
}
async function kopieren(token, eingabe) {
  try { await navigator.clipboard.writeText(adresse(token)); toast('Link kopiert'); }
  catch {
    if (eingabe) { eingabe.focus(); eingabe.select(); toast('Kopiere den markierten Link mit Strg+C oder ⌘C.'); }
    else linkZeigen(token);
  }
}
function linkInhalt(token) {
  const input = h('input', { class: 'input fg-link', readonly: true, value: adresse(token), 'aria-label': 'Freigabe-Link', onclick: (e) => e.target.select() });
  return h('div', { class: 'wform' }, input,
    h('button', { class: 'btn', onclick: () => kopieren(token, input) }, 'Kopieren'),
    h('p', { class: 'fg-hinweis' }, hinweis));
}
function linkZeigen(token) { dialog('Dein Freigabe-Link', '', { extra: linkInhalt(token) }); }
function bearbeiten(pfad, token) {
  const alt = token && liste?.find((l) => l.token === token);
  if (token && !alt) { toast('Die Freigabe wurde nicht gefunden.', true); return; }
  const optionen = token ? [['behalten', 'Unverändert'], ['1', '1 Tag'], ['7', '7 Tage'], ['30', '30 Tage'], ['0', 'Unbegrenzt']] : [['1', '1 Tag'], ['7', '7 Tage'], ['30', '30 Tage'], ['0', 'Unbegrenzt']];
  const tage = choice(optionen, token ? 'behalten' : '7');
  const passwort = h('input', { class: 'input', type: 'password', maxlength: '1024', autocomplete: 'new-password', placeholder: token ? 'Neues Passwort' : 'Optional', 'aria-label': 'Passwort' });
  const modus = token && choice([['behalten', 'Behalten'], ['setzen', 'Neu setzen'], ['entfernen', 'Entfernen']], 'behalten');
  const maximum = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: alt?.maxDownloads ?? '', placeholder: 'Unbegrenzt', 'aria-label': 'Höchstens N Downloads' });
  const meldung = h('div', { class: 'fg-fehler', role: 'status' });
  const inhalt = h('div', { class: 'wform fg-form' },
    field('Gültigkeit', tage.el, token ? 'Eine neue Gültigkeit beginnt ab jetzt.' : null),
    field('Passwort', h('div', { class: 'wform' }, modus && modus.el, passwort)),
    field('Höchstens N Downloads', maximum, 'Leer lassen für unbegrenzt. Bildvorschauen zählen nicht als Download.'), meldung);
  const knopf = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const n = maximum.value.trim() === '' ? null : Number(maximum.value);
    if (n !== null && (!Number.isSafeInteger(n) || n < 1)) { meldung.textContent = 'Gib eine positive ganze Zahl ein.'; return; }
    const body = { maxDownloads: n };
    if (tage.get() !== 'behalten') body.tage = Number(tage.get());
    if (!token || modus.get() === 'setzen') body.passwort = passwort.value;
    if (token && modus.get() === 'entfernen') body.passwort = '';
    knopf.disabled = true; meldung.textContent = '';
    try {
      if (token) {
        await api('/api/freigaben/aendern', { ...body, token });
        inhalt.replaceChildren(h('p', {}, 'Die Freigabe wurde geändert.'), linkInhalt(token));
      } else {
        const neu = await api('/api/freigaben', { ...body, pfad });
        inhalt.replaceChildren(h('p', {}, 'Dein Link ist bereit.'), linkInhalt(neu.token));
      }
      await laden();
    } catch (e) { meldung.textContent = e.message; knopf.disabled = false; }
  } }, token ? 'Änderungen speichern' : 'Link erstellen');
  inhalt.append(knopf);
  dialog(token ? 'Freigabe ändern' : 'Teilen', pfad || 'Speicher', { extra: inhalt });
}
function loeschen(token) {
  const l = liste?.find((x) => x.token === token); if (!l) return;
  dialog('Freigabe löschen?', `Der Link zu „${l.name}“ funktioniert danach nicht mehr. Die Dateien bleiben erhalten.`, {
    confirm: 'Löschen', danger: true, onConfirm: async () => {
      try { await api('/api/freigaben/loeschen', { token }); await laden(); toast('Freigabe gelöscht'); }
      catch (e) { toast(e.message, true); }
    },
  });
}
function render() {
  return h('div', { class: 'win-body' },
    h('div', { class: 'fg-oben' }, h('h1', { class: 'win-title' }, 'Freigaben'), h('button', { class: 'btn ghost small', onclick: laden }, 'Aktualisieren')),
    h('p', { class: 'muted' }, 'Verwalte die Links zu Deinen Dateien und Ordnern.'),
    ladefehler && h('p', { class: 'fg-fehler', role: 'status' }, ladefehler),
    !liste ? h('div', { class: 'empty' }, 'Freigaben werden geladen …') : !liste.length ? h('div', { class: 'empty' }, h('b', {}, 'Noch keine Freigaben'), 'Öffne „Dateien“ und wähle im ⋯-Menü einer Datei oder eines Ordners „Teilen …“.') :
      h('div', { class: 'fg-liste' }, liste.map((l) => h('div', { class: 'fg-karte', 'data-key': l.token },
        h('div', { class: 'fg-kopf' }, h('span', { class: `dot ${l.status === 'aktiv' ? 'running' : 'exited'}`, title: l.status }), h('b', {}, l.name), h('span', { class: 'muted' }, l.status)),
        h('div', { class: 'fg-pfad' }, l.pfad || 'Speicher'),
        h('div', { class: 'fg-details' }, `${l.groesse === 'Ordner' ? 'Ordner' : l.groesse === null ? 'Größe unbekannt' : fmtBytes(l.groesse)} · Ablauf: ${l.ablauf ? fmtDate(l.ablauf) : 'Unbegrenzt'}`),
        h('div', { class: 'fg-details' }, `Downloads: ${l.downloads}${l.maxDownloads ? ` / ${l.maxDownloads}` : ''} · Passwort: ${l.passwort ? 'Ja' : 'Nein'}`),
        h('div', { class: 'fg-aktionen' },
          h('button', { class: 'btn small', onclick: () => kopieren(l.token) }, 'Kopieren'),
          h('button', { class: 'btn ghost small', onclick: () => bearbeiten(liste?.find((x) => x.token === l.token)?.pfad, l.token) }, 'Ändern'),
          h('button', { class: 'btn ghost small danger', onclick: () => loeschen(l.token) }, 'Löschen'))))),
    h('p', { class: 'fg-hinweis' }, hinweis));
}
const oeffnen = () => { H.go('#/freigaben'); laden(); };
H.registerWindow('freigaben', { title: 'Freigaben', hidden: true, render, onOpen: laden });
H.addFileMenuItem((eintrag, relPfad) => ({ label: 'Teilen …', fn: () => bearbeiten(relPfad) }));
H.addFilesSideItem({ label: 'Freigaben', icon: () => icon('globe'), onClick: oeffnen });
H.addSettingsItem(() => ({ tab: 'system', ic: 'globe', title: 'Freigabe-Links', desc: liste ? `${liste.filter((l) => l.status === 'aktiv').length} aktive Links` : 'Freigaben werden geladen …', onclick: oeffnen }));
H.onPoll(() => { if (H.state.status?.loggedIn && Date.now() - zuletzt > 15000) laden(); });
