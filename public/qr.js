// Kleiner QR-Erzeuger (Byte-Modus, Korrekturstufe M, Version 1–10) – Hafen kommt ohne Pakete aus
const GESAMT = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOECKE = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 128 ? 0x11d : 0); }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mal = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(grad) {
  let g = [1];
  for (let i = 0; i < grad; i++) {
    const n = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { n[j] ^= c; n[j + 1] ^= mal(c, EXP[i]); });
    g = n;
  }
  return g;
}
function fehlerkorrektur(daten, grad) {
  const g = generator(grad), rest = [...daten, ...new Array(grad).fill(0)];
  for (let i = 0; i < daten.length; i++) {
    const f = rest[i];
    if (f) g.forEach((c, j) => { rest[i + j] ^= mal(c, f); });
  }
  return rest.slice(daten.length);
}

function nutzdaten(bytes, v) {
  const bits = [];
  const schreibe = (wert, n) => { for (let i = n - 1; i >= 0; i--) bits.push((wert >> i) & 1); };
  const kap = (GESAMT[v] - ECC[v] * BLOECKE[v]) * 8;
  schreibe(4, 4); schreibe(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => schreibe(b, 8));
  schreibe(0, Math.min(4, kap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let f = 0xec; bits.length < kap; f ^= 0xec ^ 0x11) schreibe(f, 8);
  const woerter = [];
  for (let i = 0; i < bits.length; i += 8) woerter.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return woerter;
}

function verschachteln(woerter, v) {
  const n = BLOECKE[v], kurz = Math.floor((GESAMT[v] - ECC[v] * n) / n), lang = (GESAMT[v] - ECC[v] * n) % n;
  const daten = [], ecc = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const laenge = kurz + (i >= n - lang ? 1 : 0), block = woerter.slice(pos, pos + laenge);
    pos += laenge; daten.push(block); ecc.push(fehlerkorrektur(block, ECC[v]));
  }
  const raus = [];
  for (let i = 0; i <= kurz; i++) daten.forEach((b) => { if (i < b.length) raus.push(b[i]); });
  for (let i = 0; i < ECC[v]; i++) ecc.forEach((b) => raus.push(b[i]));
  return raus;
}

const MASKE = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

function ausrichtung(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, abstand = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, liste = [6];
  for (let p = v * 4 + 10; liste.length < n; p -= abstand) liste.splice(1, 0, p);
  return liste;
}

function basis(v) {
  const g = v * 4 + 17;
  const m = Array.from({ length: g }, () => new Array(g).fill(false)), fest = Array.from({ length: g }, () => new Array(g).fill(false));
  const setze = (x, y, w) => { m[y][x] = w; fest[y][x] = true; };
  for (let i = 0; i < g; i++) { setze(6, i, i % 2 === 0); setze(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && y >= 0 && x < g && y < g) setze(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(g - 4, 3); finder(3, g - 4);
  const pos = ausrichtung(v);
  pos.forEach((y, i) => pos.forEach((x, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setze(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  return { m, fest, setze, g };
}

function format({ setze, g }, maske) {
  // Korrekturstufe M hat die Kennung 00
  let rest = maske;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >> 9) * 0x537);
  const bits = ((maske << 10) | rest) ^ 0x5412;
  const b = (i) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setze(8, i, b(i));
  setze(8, 7, b(6)); setze(8, 8, b(7)); setze(7, 8, b(8));
  for (let i = 9; i < 15; i++) setze(14 - i, 8, b(i));
  for (let i = 0; i < 8; i++) setze(g - 1 - i, 8, b(i));
  for (let i = 8; i < 15; i++) setze(8, g - 15 + i, b(i));
  setze(8, g - 8, true);
}

function versionsfeld({ setze, g }, v) {
  if (v < 7) return;
  let rest = v;
  for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >> 11) * 0x1f25);
  const bits = (v << 12) | rest;
  for (let i = 0; i < 18; i++) {
    const w = ((bits >> i) & 1) === 1, a = g - 11 + (i % 3), b = Math.floor(i / 3);
    setze(a, b, w); setze(b, a, w);
  }
}

function fuellen({ m, fest, g }, code) {
  let i = 0;
  for (let rechts = g - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let vert = 0; vert < g; vert++) for (let j = 0; j < 2; j++) {
      const x = rechts - j, hoch = ((rechts + 1) & 2) === 0, y = hoch ? g - 1 - vert : vert;
      if (!fest[y][x] && i < code.length * 8) { m[y][x] = ((code[i >> 3] >> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
}

function strafe(m) {
  const g = m.length;
  let s = 0, dunkel = 0;
  const reihe = (lese) => {
    let lauf = 0, letzte = null, muster = 0;
    for (let i = 0; i < g; i++) {
      const w = lese(i);
      if (w) dunkel++;
      if (w === letzte) { if (++lauf === 5) s += 3; else if (lauf > 5) s++; } else { letzte = w; lauf = 1; }
      muster = ((muster << 1) & 0x7ff) | (w ? 1 : 0);
      if (i >= 10 && (muster === 0x5d || muster === 0x5d0)) s += 40;
    }
  };
  for (let y = 0; y < g; y++) reihe((x) => m[y][x]);
  dunkel = 0;
  for (let x = 0; x < g; x++) reihe((y) => m[y][x]);
  for (let y = 0; y < g - 1; y++) for (let x = 0; x < g - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) s += 3;
  return s + Math.floor(Math.abs(dunkel * 20 / (g * g) - 10)) * 10;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  while (v <= 10 && bytes.length + (v < 10 ? 2 : 3) > GESAMT[v] - ECC[v] * BLOECKE[v]) v++;
  if (v > 10) throw new Error('Text ist zu lang für den QR-Code.');
  const code = verschachteln(nutzdaten(bytes, v), v);
  let beste = null, wert = Infinity;
  for (let maske = 0; maske < 8; maske++) {
    const b = basis(v);
    format(b, maske); versionsfeld(b, v); fuellen(b, code);
    for (let y = 0; y < b.g; y++) for (let x = 0; x < b.g; x++) if (!b.fest[y][x] && MASKE[maske](x, y)) b.m[y][x] = !b.m[y][x];
    const s = strafe(b.m);
    if (s < wert) { wert = s; beste = b.m; }
  }
  return beste;
}

export function qrSvg(text) {
  const m = qrMatrix(text), n = m.length, rand = 4;
  let pfad = '';
  m.forEach((zeile, y) => zeile.forEach((w, x) => { if (w) pfad += `M${x + rand} ${y + rand}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + rand * 2} ${n + rand * 2}" shape-rendering="crispEdges" role="img" aria-label="QR-Code"><rect width="100%" height="100%" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
}
