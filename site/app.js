// UI for the pattern-block puzzle: picker, play board, touch dragging, celebration.
// Easy mode: every piece's outline is drawn; a piece turns itself when it snaps.
// Picture mode ("Mẫu"): the picture is shown large with its piece list, to copy on the real wooden board.
// Hard mode: same outlines, but the child turns pieces (tap a loose piece, or twist with a second finger
// while dragging) and a piece snaps only when it is turned the right way.
import {
  fitTransform, findSnap, findSnapHard, remaining, isComplete, uprightShape, rotatePts, slotAngle,
  SNAP_RADIUS, TAP_STEP, COLORS, TYPE_ORDER,
} from "./logic.js";

const LIFT = 60;           // dragged piece is drawn this many px above the finger so it stays visible
const PAD = 16;            // board padding, px
const TAP_SLOP = 10;       // a touch that moves less than this (px) is a tap
const KEYS = { easy: "ghep-hinh:done", hard: "ghep-hinh:done-hard", view: null, mode: "ghep-hinh:mode" };
const MODES = ["easy", "hard", "view"];
const NS = "http://www.w3.org/2000/svg";
const $ = s => document.querySelector(s);

let data, all = [], game = null, drag = null, pendingFit = false;
let mode = MODES.includes(load(KEYS.mode, "easy")) ? load(KEYS.mode, "easy") : "easy";

// ---------- storage (per device, may be unavailable) ----------
function load(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function store(key, value) { try { localStorage.setItem(key, value); } catch {} }
function loadDone(m = mode) { if (!KEYS[m]) return new Set(); try { return new Set(JSON.parse(load(KEYS[m], "[]"))); } catch { return new Set(); } }
function saveDone(id, m) { const s = loadDone(m); s.add(id); store(KEYS[m], JSON.stringify([...s])); }

// ---------- svg helpers ----------
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const ptsAttr = (pts, s = 1, ox = 0, oy = 0) => pts.map(([x, y]) => `${(x * s + ox).toFixed(2)},${(y * s + oy).toFixed(2)}`).join(" ");
function miniSvg(d) {
  const svg = el("svg", { viewBox: `-0.1 -0.1 ${d.w + 0.2} ${d.h + 0.2}`, "aria-hidden": "true" });
  for (const p of d.pieces) svg.append(el("polygon", { points: ptsAttr(p.pts), fill: COLORS[p.t], stroke: "#2b1d14", "stroke-width": 0.04 }));
  return svg;
}

// ---------- picker ----------
function renderPicker() {
  const tabs = $("#tabs"), books = $("#books");
  tabs.textContent = ""; books.textContent = "";
  data.books.forEach((b, bi) => {
    const tab = document.createElement("button");
    tab.className = "tab"; tab.textContent = b.title; tab.dataset.book = b.id;
    tab.setAttribute("aria-selected", bi === 0);
    tab.onclick = () => selectBook(b.id);
    tabs.append(tab);
    const sec = document.createElement("section");
    sec.className = "book"; sec.dataset.book = b.id; sec.hidden = bi !== 0;
    for (const g of b.groups) {
      if (g.title) { const h = document.createElement("h3"); h.textContent = g.title; sec.append(h); }
      const grid = document.createElement("div"); grid.className = "grid";
      for (const d of g.designs) {
        const btn = document.createElement("button");
        btn.className = "thumb"; btn.dataset.id = d.id;
        const lab = document.createElement("span"); lab.textContent = d.label;
        btn.append(miniSvg(d), lab);
        btn.onclick = () => startGame(d.id);
        grid.append(btn);
      }
      sec.append(grid);
    }
    books.append(sec);
  });
  showStars();
}
function selectBook(id) {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.book === id));
  document.querySelectorAll(".book").forEach(s => { s.hidden = s.dataset.book !== id; });
}
function setMode(m) {
  mode = m; store(KEYS.mode, m);
  document.querySelectorAll(".mode").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m));
  showStars();
}
function showStars() {
  const done = loadDone();
  document.querySelectorAll(".thumb").forEach(t => t.classList.toggle("done", done.has(t.dataset.id)));
}
function showPicker() {
  cancelDrag(); game = null;
  $("#play").hidden = true; $("#done").hidden = true; $("#picker").hidden = false;
  showStars();
}

// ---------- game ----------
function startGame(id) {
  const d = all.find(x => x.id === id);
  game = { d, mode, filled: d.pieces.map(() => mode === "view"), loose: [], fit: null,
    angles: mode === "hard" ? d.pieces.map(p => slotAngle(p.t, p.pts, p.c)) : null };
  $("#title").textContent = d.label + ({ hard: " · Khó", view: " · Mẫu" }[mode] || "");
  $("#restart").hidden = mode === "view"; $("#view-next").hidden = mode !== "view";
  $("#picker").hidden = true; $("#done").hidden = true; $("#play").hidden = false;
  layout();
}
function layout() {
  if (!game) return;
  // the tray's height decides how much room the picture gets; hold that height for the whole game so the
  // picture does not grow when a piece type runs out (only a real screen change refits it)
  const tray = $("#tray");
  tray.style.minHeight = "";
  renderTray();
  tray.style.minHeight = `${tray.getBoundingClientRect().height}px`;
  fitBoard();
}
function fitBoard() {
  if (!game) return;
  if (drag) { pendingFit = true; return; }        // never rebuild the node under a moving finger
  const wrap = $("#board-wrap").getBoundingClientRect();
  const fit = fitTransform(game.d.w, game.d.h, wrap.width, wrap.height, PAD), f = game.fit;
  if (f && $("#board").childNodes.length && Math.abs(f.scale - fit.scale) < 0.01 && Math.abs(f.ox - fit.ox) < 0.5 && Math.abs(f.oy - fit.oy) < 0.5) return;
  game.fit = fit;                                  // only redraw when the room for the picture really changed
  renderBoard();
}
new ResizeObserver(() => fitBoard()).observe($("#board-wrap"));   // tray rows change -> picture refits

function renderBoard() {
  const { d, filled, fit } = game, svg = $("#board"), hard = game.mode === "hard";
  svg.textContent = "";
  d.pieces.forEach((p, i) => {
    const poly = el("polygon", {
      points: ptsAttr(p.pts, fit.scale, fit.ox, fit.oy), fill: COLORS[p.t],
      "fill-opacity": filled[i] ? 1 : 0.22, class: "slot" + (filled[i] ? " filled" : ""),
    });
    poly.dataset.i = i; poly.dataset.type = p.t;
    if (hard) poly.dataset.angle = game.angles[i];
    if (filled[i] && game.mode !== "view") poly.addEventListener("pointerdown", e => beginDrag(e, p.t, { slot: i }));
    svg.append(poly);
  });
  game.loose.forEach((q, k) => {
    const poly = el("polygon", { points: ptsAttr(rotatePts(uprightShape(q.type), q.angle), fit.scale, fit.ox + q.x * fit.scale, fit.oy + q.y * fit.scale),
      fill: COLORS[q.type], class: "loose" });
    poly.dataset.type = q.type; poly.dataset.angle = q.angle; poly.dataset.k = k;
    poly.addEventListener("pointerdown", e => beginDrag(e, q.type, { loose: k }));
    svg.append(poly);
  });
}
// Pieces still in the tray: empty slots minus pieces already lying loose on the board.
function trayCounts() {
  if (game.mode === "view") return remaining(game.d.pieces, game.d.pieces.map(() => false));   // the whole piece list
  const left = remaining(game.d.pieces, game.filled);
  for (const q of game.loose) if (left[q.type] && --left[q.type] === 0) delete left[q.type];
  return left;
}
function renderTray() {
  const tray = $("#tray"), left = trayCounts();
  tray.textContent = "";
  for (const t of TYPE_ORDER) {
    if (!left[t]) continue;
    const item = document.createElement("div");
    item.className = "tray-item"; item.dataset.type = t;
    const pts = uprightShape(t), r = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 0.15;
    const svg = el("svg", { viewBox: `${-r} ${-r} ${2 * r} ${2 * r}` });
    svg.append(el("polygon", { points: ptsAttr(pts), fill: COLORS[t], stroke: "#2b1d14", "stroke-width": 0.05 }));
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = `×${left[t]}`;
    item.append(svg, badge);
    if (game.mode !== "view") item.addEventListener("pointerdown", e => beginDrag(e, t, { tray: true }));
    tray.append(item);
  }
}

// ---------- dragging ----------
// src: {tray:true} | {slot:i} | {loose:k}. Only the first finger drags; in hard mode a second finger twists.
function beginDrag(e, type, src) {
  if (drag || !game) return;
  e.preventDefault();
  const hard = game.mode === "hard", s = game.fit.scale;
  let shape, angle = 0;
  if (src.slot !== undefined && !hard) {           // easy: a lifted piece keeps its slot's exact shape
    const p = game.d.pieces[src.slot]; shape = p.pts.map(([x, y]) => [x - p.c[0], y - p.c[1]]);
  } else {
    shape = uprightShape(type);
    if (src.slot !== undefined) angle = game.angles[src.slot];
    if (src.loose !== undefined) angle = game.loose[src.loose].angle;
  }
  const r = Math.max(...shape.map(([x, y]) => Math.hypot(x, y))) * s + 4;
  const svg = el("svg", { class: "drag", width: 2 * r, height: 2 * r, viewBox: `${-r} ${-r} ${2 * r} ${2 * r}` });
  const poly = el("polygon", { points: ptsAttr(shape, s), fill: COLORS[type], stroke: "#2b1d14", "stroke-width": 1.6, "stroke-linejoin": "round" });
  svg.append(poly);
  document.body.append(svg);
  try { $("#play").setPointerCapture(e.pointerId); } catch {}   // keep receiving moves even if a node changes
  // never remove the node under the finger (iOS would stop delivering the drag): change it in place
  if (src.slot !== undefined) {
    game.filled[src.slot] = false;
    e.currentTarget.classList.remove("filled"); e.currentTarget.setAttribute("fill-opacity", 0.22);
    renderTray();
  }
  if (src.loose !== undefined) e.currentTarget.style.visibility = "hidden";
  drag = { id: e.pointerId, type, r, svg, poly, src, angle, x0: e.clientX, y0: e.clientY, moved: false };
  setAngle(angle);
  moveTo(e.clientX, e.clientY);
}
function setAngle(a) { drag.angle = a; drag.svg.dataset.angle = Math.round(a); drag.poly.setAttribute("transform", `rotate(${a})`); }
function moveTo(fx, fy) {
  drag.fx = fx; drag.fy = fy; drag.x = fx; drag.y = fy - LIFT;
  if (Math.hypot(fx - drag.x0, fy - drag.y0) > TAP_SLOP) drag.moved = true;
  drag.svg.style.transform = `translate(${drag.x - drag.r}px, ${drag.y - drag.r}px)`;
}
const fingerAngle = (x, y) => Math.atan2(y - drag.fy, x - drag.fx) * 180 / Math.PI;
const snap15 = a => ((Math.round(a / 15) * 15) % 360 + 360) % 360;
function finish(then) {
  const { svg } = drag; drag = null;
  if (pendingFit) { pendingFit = false; fitBoard(); }
  then(svg);
}
function flyTo(x, y, then) {
  finish(svg => {
    svg.classList.add("fly"); svg.style.transform = `translate(${x - parseFloat(svg.getAttribute("width")) / 2}px, ${y - parseFloat(svg.getAttribute("height")) / 2}px)`;
    setTimeout(() => { svg.remove(); then && then(); }, 160);
  });
}
function endDrag(e) {
  if (!drag) return;
  if (drag.twist && e.pointerId === drag.twist.id) { drag.twist = null; setAngle(snap15(drag.angle)); return; }
  if (e.pointerId !== drag.id) return;
  if (drag.twist) { drag.twist = null; setAngle(snap15(drag.angle)); }
  moveTo(e.clientX, e.clientY);
  const g = game, hard = g.mode === "hard", { src } = drag;
  const b = $("#board").getBoundingClientRect(), { scale, ox, oy } = g.fit;
  const pt = [(drag.x - b.left - ox) / scale, (drag.y - b.top - oy) / scale];
  const dropOk = e.type === "pointerup";

  // hard: a loose piece that was only tapped turns in place
  if (hard && src.loose !== undefined && !drag.moved && dropOk) {
    const q = g.loose[src.loose]; q.angle = (q.angle + TAP_STEP) % 360;
    finish(svg => svg.remove()); renderBoard(); return;
  }
  const i = !dropOk ? -1 : hard ? findSnapHard(drag.type, pt, drag.angle, g.d.pieces, g.filled, SNAP_RADIUS, g.angles)
                                : findSnap(drag.type, pt, g.d.pieces, g.filled, SNAP_RADIUS);
  if (i >= 0) {
    const c = g.d.pieces[i].c;
    g.filled[i] = true;                            // commit and redraw now; nothing is rebuilt later
    if (src.loose !== undefined) g.loose.splice(src.loose, 1);
    const complete = isComplete(g.filled);
    if (complete) saveDone(g.d.id, g.mode);
    renderBoard(); renderTray();
    flyTo(b.left + ox + c[0] * scale, b.top + oy + c[1] * scale, () => { if (complete && game === g) celebrate(); });
    return;
  }
  const overTray = e.clientY >= $("#tray").getBoundingClientRect().top;
  if (hard && dropOk && !overTray) {
    // hard: it stays where it fell, like a real piece on the table
    const q = { type: drag.type, angle: snap15(drag.angle),
      x: Math.min(Math.max(pt[0], -ox / scale), (b.width - ox) / scale), y: Math.min(Math.max(pt[1], -oy / scale), (b.height - oy) / scale) };
    if (src.loose !== undefined) g.loose[src.loose] = q; else g.loose.push(q);
    finish(svg => svg.remove()); renderBoard(); renderTray(); return;
  }
  // back to the tray
  if (src.loose !== undefined) g.loose.splice(src.loose, 1);
  renderTray();
  const home = document.querySelector(`.tray-item[data-type="${drag.type}"]`);
  const h = home ? home.getBoundingClientRect() : { left: drag.x, top: window.innerHeight, width: 0, height: 0 };
  flyTo(h.left + h.width / 2, h.top + h.height / 2, () => { if (src.loose !== undefined && game === g) renderBoard(); });
}
function cancelDrag() {
  if (!drag) return;
  if (game && drag.src.slot !== undefined) game.filled[drag.src.slot] = true;
  drag.svg.remove(); drag = null;
  if (game) renderBoard();
  if (pendingFit) { pendingFit = false; fitBoard(); }
}
window.addEventListener("pointerdown", e => {      // second finger: twist the piece (hard mode only)
  if (!drag || e.pointerId === drag.id || drag.twist || !game || game.mode !== "hard") return;
  drag.twist = { id: e.pointerId, a0: fingerAngle(e.clientX, e.clientY), base: drag.angle };
}, true);
window.addEventListener("pointermove", e => {
  if (!drag) return;
  if (e.pointerId === drag.id) moveTo(e.clientX, e.clientY);
  else if (drag.twist && e.pointerId === drag.twist.id) setAngle(drag.twist.base + fingerAngle(e.clientX, e.clientY) - drag.twist.a0);
});
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

// ---------- celebration ----------
function celebrate() {
  if (!game) return;
  const stars = document.querySelector("#done .stars"); stars.textContent = "";
  for (let k = 0; k < 7; k++) {
    const s = document.createElement("i"); s.textContent = "★";
    s.style.left = `${8 + k * 13}%`; s.style.top = `${(k % 2) * 22}px`; s.style.animationDelay = `${k * 0.08}s`;
    stars.append(s);
  }
  $("#done").hidden = false;
}
function nextGame() {
  const i = all.findIndex(x => x.id === game.d.id);
  startGame(all[(i + 1) % all.length].id);
}

// ---------- boot ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
$("#back").onclick = showPicker;
$("#to-list").onclick = showPicker;
$("#next").onclick = nextGame;
$("#view-next").onclick = () => {                 // next picture in the same tab
  const book = data.books.find(b => b.groups.some(g => g.designs.some(d => d.id === game.d.id)));
  const ids = book.groups.flatMap(g => g.designs.map(d => d.id));
  startGame(ids[(ids.indexOf(game.d.id) + 1) % ids.length]);
};
$("#restart").onclick = () => {
  if (!game) return;
  cancelDrag(); game.filled = game.d.pieces.map(() => false); game.loose = []; game.fit = null; layout();
};
document.querySelectorAll(".mode").forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
window.addEventListener("resize", () => { cancelDrag(); layout(); });

setMode(mode);
data = await (await fetch("designs.json")).json();
all = data.books.flatMap(b => b.groups.flatMap(g => g.designs));
renderPicker();
