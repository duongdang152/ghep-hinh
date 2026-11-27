// UI for the pattern-block puzzle: picker, play board, touch dragging, celebration.
import { fitTransform, findSnap, remaining, isComplete, SNAP_RADIUS, COLORS, TYPE_ORDER } from "./logic.js";

const LIFT = 60;           // dragged piece is drawn this many px above the finger so it stays visible
const PAD = 16;            // board padding, px
const DONE_KEY = "ghep-hinh:done";
const NS = "http://www.w3.org/2000/svg";
const $ = s => document.querySelector(s);

let data, all = [], game = null, drag = null;

// ---------- storage (per device, may be unavailable) ----------
function loadDone() { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]")); } catch { return new Set(); } }
function saveDone(id) { const s = loadDone(); s.add(id); try { localStorage.setItem(DONE_KEY, JSON.stringify([...s])); } catch {} }

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
  const done = loadDone(), tabs = $("#tabs"), books = $("#books");
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
      const h = document.createElement("h3"); h.textContent = g.title; sec.append(h);
      const grid = document.createElement("div"); grid.className = "grid";
      for (const d of g.designs) {
        const btn = document.createElement("button");
        btn.className = "thumb" + (done.has(d.id) ? " done" : ""); btn.dataset.id = d.id;
        const lab = document.createElement("span"); lab.textContent = d.label;
        btn.append(miniSvg(d), lab);
        btn.onclick = () => startGame(d.id);
        grid.append(btn);
      }
      sec.append(grid);
    }
    books.append(sec);
  });
}
function selectBook(id) {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.book === id));
  document.querySelectorAll(".book").forEach(s => { s.hidden = s.dataset.book !== id; });
}
function showPicker() {
  cancelDrag(); game = null;
  $("#play").hidden = true; $("#done").hidden = true; $("#picker").hidden = false;
  const done = loadDone();
  document.querySelectorAll(".thumb").forEach(t => t.classList.toggle("done", done.has(t.dataset.id)));
}

// ---------- game ----------
function startGame(id) {
  const d = all.find(x => x.id === id);
  game = { d, filled: d.pieces.map(() => false), fit: null };
  $("#title").textContent = d.label;
  $("#picker").hidden = true; $("#done").hidden = true; $("#play").hidden = false;
  layout();
}
function layout() {
  if (!game) return;
  const wrap = $("#board-wrap").getBoundingClientRect();
  game.fit = fitTransform(game.d.w, game.d.h, wrap.width, wrap.height, PAD);
  renderBoard(); renderTray();
}
function renderBoard() {
  const { d, filled, fit } = game, svg = $("#board");
  svg.textContent = "";
  d.pieces.forEach((p, i) => {
    const poly = el("polygon", {
      points: ptsAttr(p.pts, fit.scale, fit.ox, fit.oy), fill: COLORS[p.t],
      "fill-opacity": filled[i] ? 1 : 0.22, class: "slot" + (filled[i] ? " filled" : ""),
    });
    poly.dataset.i = i; poly.dataset.type = p.t;
    if (filled[i]) poly.addEventListener("pointerdown", e => beginDrag(e, p.t, i));
    svg.append(poly);
  });
}
// Shape shown for a type in the tray / while dragging: the first slot of that type, centred on its centroid.
function shapeOf(type, prefer = -1) {
  const p = prefer >= 0 ? game.d.pieces[prefer] : game.d.pieces.find((q, i) => q.t === type && !game.filled[i]) || game.d.pieces.find(q => q.t === type);
  return p.pts.map(([x, y]) => [x - p.c[0], y - p.c[1]]);
}
function renderTray() {
  const tray = $("#tray"), left = remaining(game.d.pieces, game.filled);
  tray.textContent = "";
  for (const t of TYPE_ORDER) {
    if (!left[t]) continue;
    const item = document.createElement("div");
    item.className = "tray-item"; item.dataset.type = t;
    const pts = shapeOf(t), r = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 0.15;
    const svg = el("svg", { viewBox: `${-r} ${-r} ${2 * r} ${2 * r}` });
    svg.append(el("polygon", { points: ptsAttr(pts), fill: COLORS[t], stroke: "#2b1d14", "stroke-width": 0.05 }));
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = `×${left[t]}`;
    item.append(svg, badge);
    item.addEventListener("pointerdown", e => beginDrag(e, t, -1));
    tray.append(item);
  }
}

// ---------- dragging (one finger at a time) ----------
function beginDrag(e, type, fromSlot) {
  if (drag || !game) return;                       // a second finger is ignored while one piece is moving
  e.preventDefault();
  const pts = shapeOf(type, fromSlot), s = game.fit.scale;
  const r = Math.max(...pts.map(([x, y]) => Math.hypot(x, y))) * s + 4;
  const svg = el("svg", { class: "drag", width: 2 * r, height: 2 * r, viewBox: `${-r} ${-r} ${2 * r} ${2 * r}` });
  svg.append(el("polygon", { points: ptsAttr(pts, s), fill: COLORS[type], stroke: "#2b1d14", "stroke-width": 1.6, "stroke-linejoin": "round" }));
  document.body.append(svg);
  if (fromSlot >= 0) { game.filled[fromSlot] = false; renderBoard(); renderTray(); }
  drag = { id: e.pointerId, type, r, svg };
  moveTo(e.clientX, e.clientY - LIFT);
}
function moveTo(x, y) { drag.x = x; drag.y = y; drag.svg.style.transform = `translate(${x - drag.r}px, ${y - drag.r}px)`; }
function flyTo(x, y, then) {
  const { svg } = drag; drag = null;
  svg.classList.add("fly"); svg.style.transform = `translate(${x - parseFloat(svg.getAttribute("width")) / 2}px, ${y - parseFloat(svg.getAttribute("height")) / 2}px)`;
  setTimeout(() => { svg.remove(); then && then(); }, 160);
}
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  moveTo(e.clientX, e.clientY - LIFT);
  const b = $("#board").getBoundingClientRect(), { scale, ox, oy } = game.fit;
  const pt = [(drag.x - b.left - ox) / scale, (drag.y - b.top - oy) / scale];
  const i = e.type === "pointerup" ? findSnap(drag.type, pt, game.d.pieces, game.filled, SNAP_RADIUS) : -1;
  if (i >= 0) {
    const c = game.d.pieces[i].c;
    game.filled[i] = true;                         // commit now so a fast next drag sees the right state
    flyTo(b.left + ox + c[0] * scale, b.top + oy + c[1] * scale, () => {
      renderBoard(); renderTray();
      if (isComplete(game.filled)) celebrate();
    });
  } else {
    const home = document.querySelector(`.tray-item[data-type="${drag.type}"]`);
    const h = home ? home.getBoundingClientRect() : { left: drag.x, top: window.innerHeight, width: 0, height: 0 };
    flyTo(h.left + h.width / 2, h.top + h.height / 2, () => { renderTray(); });
  }
}
function cancelDrag() { if (drag) { drag.svg.remove(); drag = null; } }
window.addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) moveTo(e.clientX, e.clientY - LIFT); });
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

// ---------- celebration ----------
function celebrate() {
  saveDone(game.d.id);
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
$("#restart").onclick = () => { if (game) { cancelDrag(); game.filled = game.d.pieces.map(() => false); layout(); } };
window.addEventListener("resize", () => { cancelDrag(); layout(); });

data = await (await fetch("designs.json")).json();
all = data.books.flatMap(b => b.groups.flatMap(g => g.designs));
renderPicker();
