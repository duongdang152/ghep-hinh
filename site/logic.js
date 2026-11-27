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
