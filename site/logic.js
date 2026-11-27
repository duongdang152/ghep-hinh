// Pure game logic for the pattern-block puzzle (no DOM). Units: one piece edge.
export const SNAP_RADIUS = 0.7;
export const TYPE_ORDER = ["hex", "trap", "rhomb", "thin", "tri", "sq", "bluetri", "quarter"];
export const COLORS = {
  hex: "#D9473F", trap: "#F2C94C", rhomb: "#5FBFB8", thin: "#7CB342",
  tri: "#E98A4F", sq: "#6E3B5E", bluetri: "#3F6FB0", quarter: "#E87BA0",
};

// Uniform scale that fits a design into a box (minus pad on every side), centred.
export function fitTransform(designW, designH, boxW, boxH, pad) {
  const scale = Math.min((boxW - 2 * pad) / designW, (boxH - 2 * pad) / designH);
  return { scale, ox: (boxW - designW * scale) / 2, oy: (boxH - designH * scale) / 2 };
}

// Index of the nearest empty slot of this type within radius of point, else -1 (ties: lowest index).
export function findSnap(type, point, pieces, filled, radius) {
  let best = -1, bestD = Infinity;
  pieces.forEach((p, i) => {
    if (p.t !== type || filled[i]) return;
    const d = Math.hypot(p.c[0] - point[0], p.c[1] - point[1]);
    if (d <= radius && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

// Count of unfilled slots per type (only types with something left).
export function remaining(pieces, filled) {
  const out = {};
  pieces.forEach((p, i) => { if (!filled[i]) out[p.t] = (out[p.t] || 0) + 1; });
  return out;
}

export const isComplete = filled => filled.every(Boolean);

// A piece standing upright on a flat edge, centred on its centroid (tray and drag preview).
const H = Math.sqrt(3) / 2, C30 = Math.cos(Math.PI / 6);
const CANON = {
  hex: [[0, 0], [1, 0], [1.5, -H], [1, -2 * H], [0, -2 * H], [-0.5, -H]],
  trap: [[0, 0], [2, 0], [1.5, -H], [0.5, -H]],
  rhomb: [[0, 0], [1, 0], [1.5, -H], [0.5, -H]],
  thin: [[0, 0], [1, 0], [1 + C30, -0.5], [C30, -0.5]],
  tri: [[0, 0], [1, 0], [0.5, -H]],
  sq: [[0, 0], [1, 0], [1, -1], [0, -1]],
  bluetri: [[0, 0], [1, 0], [0, -1]],
  quarter: [[0, 0], [1, 0], ...Array.from({ length: 23 }, (_, k) => { const a = (k + 1) * Math.PI / 48; return [Math.cos(a), -Math.sin(a)]; }), [0, -1]],
};
export function uprightShape(type) {
  const p = CANON[type];
  let a = 0, cx = 0, cy = 0;
  p.forEach(([x1, y1], i) => { const [x2, y2] = p[(i + 1) % p.length], k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k; });
  a /= 2; cx /= 6 * a; cy /= 6 * a;
  return p.map(([x, y]) => [x - cx, y - cy]);
}

// ---------- hard mode: pieces must be turned the right way ----------
export const ANGLE_TOL = 16;     // degrees either side of the slot's angle that still snap
export const TAP_STEP = 30;      // one tap on a loose piece turns it this much
// rotation after which each piece looks the same again (all eight shapes are mirror-symmetric)
const SYM = { hex: 60, trap: 360, rhomb: 180, thin: 180, tri: 120, sq: 90, bluetri: 360, quarter: 360 };

// Rotate points clockwise on screen (y points down) by deg degrees about the origin.
export function rotatePts(pts, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// The angle (0-359, whole degrees) that turns the upright piece onto this slot.
export function slotAngle(type, pts, c) {
  const up = uprightShape(type), local = pts.map(([x, y]) => [x - c[0], y - c[1]]);
  let best = 0, bestErr = Infinity;
  for (let a = 0; a < SYM[type]; a++) {
    const r = rotatePts(up, a);
    let err = 0;
    for (const [x, y] of local) {
      let m = Infinity;
      for (const [u, v] of r) { const d = (u - x) ** 2 + (v - y) ** 2; if (d < m) m = d; }
      if (m > err) err = m;
      if (err >= bestErr) break;
    }
    if (err < bestErr) { bestErr = err; best = a; }
  }
  return best;
}

// Does a piece turned to angle a sit like one turned to b, within tol degrees?
export function angleOk(type, a, b, tol) {
  const sym = SYM[type], d = (((a - b) % sym) + sym) % sym;
  return Math.min(d, sym - d) <= tol;
}

// Like findSnap, but the piece must also be turned to fit (slotAngles[i] from slotAngle).
export function findSnapHard(type, point, angle, pieces, filled, radius, slotAngles) {
  let best = -1, bestD = Infinity;
  pieces.forEach((p, i) => {
    if (p.t !== type || filled[i] || !angleOk(type, angle, slotAngles[i], ANGLE_TOL)) return;
    const d = Math.hypot(p.c[0] - point[0], p.c[1] - point[1]);
    if (d <= radius && d < bestD) { best = i; bestD = d; }
  });
  return best;
}
