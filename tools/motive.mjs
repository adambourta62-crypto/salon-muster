// Erzeugt die Linien-Motive (Pfad-Daten) für die Gestaltungswelt „Linienführung“.
// Aufruf (im Projektordner): node tools/motive.mjs  → trägt die Pfade direkt in index.html ein
// Alle Pfade bestehen ausschließlich aus absoluten M- und C-Befehlen, damit das
// Seiten-Skript Start-/Endpunkt und Tangenten ohne Parser-Bibliothek lesen kann.

import { readFileSync, writeFileSync } from "node:fs";

const r1 = (n) => Math.round(n * 10) / 10;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const rad = (d) => (d * Math.PI) / 180;

// Catmull-Rom → kubische Bézier-Segmente (glatte Kurve durch alle Punkte)
function spline(pts, tension = 1) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = add(p1, mul(sub(p2, p0), tension / 6));
    const c2 = sub(p2, mul(sub(p3, p1), tension / 6));
    segs.push([p1, c1, c2, p2]);
  }
  return segs;
}
const line = (a, b) => [[a, add(a, mul(sub(b, a), 1 / 3)), add(a, mul(sub(b, a), 2 / 3)), b]];

function ellipse(cx, cy, rx, ry, a0, a1, step = 14, rot = 0, shrink = 0) {
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  const cr = Math.cos(rad(rot)), sr = Math.sin(rad(rot));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = rad(a0 + (a1 - a0) * t);
    const k = 1 - shrink * t;
    const x = rx * k * Math.cos(a), y = ry * k * Math.sin(a);
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

function toPath(segs) {
  let d = `M${r1(segs[0][0][0])} ${r1(segs[0][0][1])}`;
  for (const [, c1, c2, p] of segs) {
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p[0])} ${r1(p[1])}`;
  }
  return d;
}
const mapSegs = (segs, f) => segs.map((s) => s.map(f));
const rotateAbout = (c, deg) => (p) => {
  const a = rad(deg), v = sub(p, c);
  return [c[0] + v[0] * Math.cos(a) - v[1] * Math.sin(a), c[1] + v[0] * Math.sin(a) + v[1] * Math.cos(a)];
};

/* ------------------------------------------------------------------ */
/* 1  Haarsträhne (Hero) – fünf Strähnen in einem Zug, eine Locke,      */
/*    die längste Strähne wird zur Linie, die durch die Seite führt.   */
/* ------------------------------------------------------------------ */
function hair() {
  // Anschnitt wie im Modeheft: Die Strähnen kommen von oben ins Bild (ihre Umkehr
  // liegt oberhalb der Zeichenfläche), fließen in einer S-Welle nach unten und enden
  // in gestaffelten Spitzen und einer Locke. Die äußerste Strähne läuft weiter –
  // sie ist die Linie, die sich durch die ganze Seite zieht.
  const W = 520, H = 900;
  const spine = (t) => [318 + 104 * Math.sin(Math.PI * 1.35 * t + 0.25) - 104 * t * t, -70 + 860 * t];
  const tan = (t) => norm(sub(spine(t + 0.001), spine(t - 0.001)));
  const nrm = (t) => { const d = tan(t); return [-d[1], d[0]]; };
  const w = (t) => 96 - 30 * t;
  const S = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
  const off = (t, j) => S[j] * w(t) + 9 * Math.sin(5.2 * t + j * 2.1) * (0.3 + t);
  // zwei Strähnen laufen am Ende zu einer Spitze zusammen
  const pairEnd = (t, j, k, tEnd, span = 0.16) => {
    const f = Math.min(1, Math.max(0, (t - (tEnd - span)) / span));
    const e = f * f * (3 - 2 * f);
    const mid = (off(t, j) + off(t, k)) / 2;
    return off(t, j) * (1 - e) + mid * e;
  };
  const P = (t, o) => add(spine(t), mul(nrm(t), o));
  const run = (t0, t1, fn, n = 30) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * (i / n); pts.push(P(t, fn(t))); }
    return pts;
  };
  const tips = { a: 0.7, b: 0.86, c: 0.79 };
  let pts = [];
  // Strähne 0 ↓ – Spitze mit 1
  pts.push(...run(0.02, tips.a, (t) => pairEnd(t, 0, 1, tips.a)));
  pts.push(add(P(tips.a, pairEnd(tips.a, 0, 1, tips.a)), mul(tan(tips.a), 16)));
  pts.push(...run(tips.a, 0.02, (t) => pairEnd(t, 1, 0, tips.a)));
  // Umkehr oberhalb der Fläche, Strähne 2 ↓ – endet in einer Locke mit 3
  pts.push(P(-0.03, (off(0, 1) + off(0, 2)) / 2));
  pts.push(...run(0.02, tips.b, (t) => pairEnd(t, 2, 3, tips.b, 0.22)));
  // Locke: die Strähne dreht sich spiralig ein und läuft über sich selbst zurück
  const p = P(tips.b, pairEnd(tips.b, 2, 3, tips.b, 0.22)), d = tan(tips.b), nn = nrm(tips.b);
  const R0 = 34;
  const c = add(add(p, mul(d, 10)), mul(nn, R0));
  const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / Math.PI;
  const curl = [];
  for (let i = 1; i <= 30; i++) {
    const k = i / 30, a = rad(a0 - 380 * k), r = R0 * (1 - 0.42 * k);
    curl.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  pts.push(...curl);
  pts.push(...run(tips.b - 0.05, 0.02, (t) => pairEnd(t, 3, 2, tips.b, 0.22)));
  pts.push(P(-0.03, (off(0, 3) + off(0, 4)) / 2));
  // Strähne 4 ↓ – Spitze mit 5
  pts.push(...run(0.02, tips.c, (t) => pairEnd(t, 4, 5, tips.c)));
  pts.push(add(P(tips.c, pairEnd(tips.c, 4, 5, tips.c)), mul(tan(tips.c), 18)));
  pts.push(...run(tips.c, 0.02, (t) => pairEnd(t, 5, 4, tips.c)));
  pts.push(P(-0.03, (off(0, 5) + off(0, 6)) / 2));
  // Strähne 6 ↓ – die längste, läuft aus dem Bild weiter
  pts.push(...run(0.02, 0.9, (t) => off(t, 6)));
  const end = pts[pts.length - 1], de = tan(0.9);
  const e1 = add(end, mul(de, 46));
  pts.push(e1, [e1[0] - 8, e1[1] + 52], [e1[0] - 10, H - 30], [e1[0] - 10, H]);
  // Startpunkt knapp oberhalb der Fläche, damit die Linie „von oben“ kommt
  pts.unshift(P(-0.05, off(0, 0)));
  // gespiegelt: die Strähne fließt von oben links nach unten rechts zur Randlinie
  pts = pts.map(([x, y]) => [W - x, y]);
  return { viewBox: `0 0 ${W} ${H}`, d: toPath(spline(pts, 1)) };
}

/* ------------------------------------------------------------------ */
/* 2  Schere – Klingen zeigen nach links zur Überschrift               */
/* ------------------------------------------------------------------ */
function scissors() {
  const W = 360, H = 250;
  const P = [168, 104];
  const T1 = [14, 70], T2 = [16, 138];
  let segs = [];
  // Einstieg von rechts oben, in den oberen Ring
  const ringA = ellipse(284, 62, 38, 28, -40, -40 - 560, 16, -10, 0.14);
  segs.push(...spline([[W - 6, 0], [318, 22], ...ringA.slice(0, 1)], 1));
  segs.push(...spline(ringA, 1));
  const aEnd = ringA[ringA.length - 1];
  // Griff 1 zur Achse
  segs.push(...spline([aEnd, [224, 86], [196, 96], P], 1));
  // Klinge 1 (zur unteren Spitze): Schneide gerade, Rücken gewölbt
  segs.push(...line(P, T2));
  segs.push(...spline([T2, [60, 150], [118, 136], P], 1));
  // Klinge 2 (zur oberen Spitze)
  segs.push(...line(P, T1));
  segs.push(...spline([T1, [58, 56], [118, 70], P], 1));
  // Achsschraube
  const screw = ellipse(P[0], P[1], 7, 7, 180, 180 + 360, 30);
  segs.push(...spline([P, ...screw.slice(1)], 1));
  // Griff 2 zum unteren Ring
  const ringB = ellipse(290, 150, 33, 25, 200, 200 + 560, 16, 12, 0.14);
  segs.push(...spline([P, [202, 116], [236, 128], ringB[0]], 1));
  segs.push(...spline(ringB, 1));
  const bEnd = ringB[ringB.length - 1];
  segs.push(...spline([bEnd, [326, 196], [336, 226], [340, H]], 1));
  segs = mapSegs(segs, rotateAbout([180, 120], -6));
  return { viewBox: `0 0 ${W} ${H}`, d: toPath(segs) };
}

/* ------------------------------------------------------------------ */
/* 3  Stielkamm – die Linie wird zum Stiel, dann Rücken und Zinken     */
/* ------------------------------------------------------------------ */
function comb() {
  const W = 380, H = 130;
  let segs = [];
  const top = 30, bot = 48, left = 26, right = 210, tooth = 44;
  const mid = top + 7;
  // Stiel: kommt von rechts, setzt am Kammrücken an
  segs.push(...spline([[W, mid - 16], [W - 30, mid - 4], [W - 80, mid], [right + 40, mid], [right, mid]], 1));
  segs.push(...line([right, mid], [right, top]));
  segs.push(...line([right, top], [left, top]));
  // abgerundetes Ende links
  segs.push(...spline(ellipse(left, (top + bot) / 2, (bot - top) / 2, (bot - top) / 2, 270, 90, 20), 1));
  // Zinken von links nach rechts
  let x = left + 6;
  segs.push(...line([left, bot], [x, bot]));
  const step = 9;
  let i = 0;
  while (x + 3 < right - 2) {
    const L = tooth - (i < 3 ? (3 - i) * 6 : 0) - (x > right - 30 ? 8 : 0);
    segs.push(...line([x, bot], [x, bot + L]));
    segs.push(...spline(ellipse(x + 1.6, bot + L, 1.6, 2.2, 180, 0, 45), 1));
    segs.push(...line([x + 3.2, bot + L], [x + 3.2, bot]));
    const nx = x + step;
    if (nx + 3 < right - 2) segs.push(...line([x + 3.2, bot], [nx, bot]));
    x = nx;
    i++;
  }
  const last = segs[segs.length - 1][3];
  // Kammende schließen, dann senkrecht nach unten aus dem Motiv
  segs.push(...line(last, [right, bot]));
  segs.push(...spline([[right, bot], [right + 6, bot + 30], [right + 8, H - 20], [right + 8, H]], 1));
  segs = mapSegs(segs, rotateAbout([200, 60], -3));
  return { viewBox: `0 0 ${W} ${H}`, d: toPath(segs) };
}

/* ------------------------------------------------------------------ */
/* 4  Spiegel – Bogenrahmen, doppelt gezogen, hängt an der Linie       */
/* ------------------------------------------------------------------ */
function mirror() {
  const W = 300, H = 404;
  const cx = 150, apexY = 4;
  const frame = (inset, r) => {
    const R = 146 - inset, cy = apexY + 146;
    const xL = cx - R, xR = cx + R, yB = H - 4 - inset;
    const pts = [];
    pts.push(...ellipse(cx, cy, R, R, 270, 360, 10));
    const corner = (x0, y0, a0, a1) => ellipse(x0, y0, r, r, a0, a1, 30);
    const segs = [];
    segs.push(...spline(pts, 1));
    segs.push(...line([xR, cy], [xR, yB - r]));
    segs.push(...spline(corner(xR - r, yB - r, 0, 90), 1));
    segs.push(...line([xR - r, yB], [xL + r, yB]));
    segs.push(...spline(corner(xL + r, yB - r, 90, 180), 1));
    segs.push(...line([xL, yB - r], [xL, cy]));
    segs.push(...spline(ellipse(cx, cy, R, R, 180, 270, 10), 1));
    return segs;
  };
  let segs = [];
  segs.push(...frame(0, 22));
  segs.push(...line([cx, apexY], [cx, apexY + 14]));
  segs.push(...frame(14, 12));
  segs.push(...line([cx, apexY + 14], [cx, apexY]));
  return { viewBox: `0 0 ${W} ${H}`, d: toPath(segs) };
}

/* ------------------------------------------------------------------ */
/* 5  Stecknadel – hier endet die Linie                                */
/* ------------------------------------------------------------------ */
function pin() {
  const W = 120, H = 170;
  const c = [60, 58], R = 46;
  let segs = [];
  segs.push(...line([60, 0], [60, c[1] - R]));
  // rechte Seite bis zur Spitze
  segs.push(...spline([...ellipse(c[0], c[1], R, R, 270, 395, 10), [84, 118], [68, 150], [60, 166]], 1));
  segs.push(...spline([[60, 166], [52, 150], [36, 118], ...ellipse(c[0], c[1], R, R, 145, 270, 10)], 1));
  // nach innen zur Mitte, kleiner Kreis, Punkt
  const inner = ellipse(c[0], c[1], 16, 16, 270, 270 + 360 * 2.6, 18, 0, 0.9);
  segs.push(...spline([[60, c[1] - R], [60, c[1] - 30], ...inner], 1));
  return { viewBox: `0 0 ${W} ${H}`, d: toPath(segs) };
}

const out = { hair: hair(), scissors: scissors(), comb: comb(), mirror: mirror(), pin: pin() };
for (const [k, v] of Object.entries(out)) console.log(k, v.viewBox, v.d.length, "Zeichen");

// Pfade direkt in index.html eintragen (zwischen d="…" des jeweiligen Motivs)
const htmlUrl = new URL("../index.html", import.meta.url);
let html = readFileSync(htmlUrl, "utf8");
for (const [k, v] of Object.entries(out)) {
  const re = new RegExp(`(<path class="motif__path" data-motif="${k}" d=")[^"]*(")`);
  if (!re.test(html)) { console.warn("Motiv nicht gefunden:", k); continue; }
  html = html.replace(re, `$1${v.d}$2`);
}
writeFileSync(htmlUrl, html);
console.log("index.html aktualisiert");
