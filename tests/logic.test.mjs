import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fitTransform, findSnap, remaining, isComplete, uprightShape, SNAP_RADIUS, COLORS, TYPE_ORDER } from "../site/logic.js";

const sq = (t, cx, cy) => ({ t, pts: [], c: [cx, cy] });

test("fitTransform centres and scales", () => {
  assert.deepEqual(fitTransform(4, 2, 400, 400, 20), { scale: 90, ox: 20, oy: 110 });
});

test("findSnap: wrong type, out of radius, nearest, filled, tie", () => {
  const pieces = [sq("hex", 0, 0), sq("tri", 1, 0), sq("hex", 2, 0), sq("hex", 1, 0)];
  const none = [false, false, false, false];
  assert.equal(findSnap("sq", [0, 0], pieces, none, 0.7), -1);
  assert.equal(findSnap("hex", [0, 1], pieces, none, 0.7), -1);
  assert.equal(findSnap("hex", [1.6, 0], pieces, none, 0.7), 2);
  assert.equal(findSnap("hex", [1.6, 0], pieces, [false, false, true, false], 0.7), 3);
  assert.equal(findSnap("hex", [0.5, 0], pieces, none, 0.7), 0);        // tie 0 vs 3 -> lowest index
});

test("remaining and isComplete", () => {
  const pieces = [sq("hex", 0, 0), sq("hex", 1, 1), sq("tri", 2, 2)];
  assert.deepEqual(remaining(pieces, [true, false, true]), { hex: 1 });
  assert.equal(isComplete([true, true]), true);
  assert.equal(isComplete([true, false]), false);
});

test("constants", () => {
  assert.equal(SNAP_RADIUS, 0.7);
  assert.equal(COLORS.hex, "#D9473F"); assert.equal(COLORS.quarter, "#E87BA0");
  assert.deepEqual(TYPE_ORDER, ["hex", "trap", "rhomb", "thin", "tri", "sq", "bluetri", "quarter"]);
});

test("real designs: every piece snaps onto a slot of its type", () => {
  // the shipped site may be a small prototype; check odd-angle designs from the full set
  const out = join(mkdtempSync(join(tmpdir(), "gh-")), "all.json");
  execFileSync("python3", ["-c", `import sys; sys.path.insert(0, "${new URL("..", import.meta.url).pathname}"); import export_designs; export_designs.export("${out}")`]);
  const data = JSON.parse(readFileSync(out));
  const all = data.books.flatMap(b => b.groups.flatMap(g => g.designs));
  for (const id of ["p03_con_vat_1-1", "n09_may_bay_b-4", "p12_hoa_van_2-0"]) {
    const d = all.find(x => x.id === id);
    assert.ok(d, id);
    const filled = d.pieces.map(() => false);
    for (const p of d.pieces) {
      const i = findSnap(p.t, p.c, d.pieces, filled, SNAP_RADIUS);
      assert.notEqual(i, -1, `${id} ${p.t}`);
      assert.equal(d.pieces[i].t, p.t);
      filled[i] = true;
    }
    assert.equal(isComplete(filled), true, id);
  }
});

test("uprightShape: every type is centred, flat-bottomed and the real size", () => {
  const area = p => Math.abs(p.reduce((a, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return a + x * v - u * y; }, 0)) / 2;
  const want = { hex: 3 * Math.sqrt(3) / 2, trap: 3 * Math.sqrt(3) / 4, rhomb: Math.sqrt(3) / 2, thin: 0.5,
    tri: Math.sqrt(3) / 4, sq: 1, bluetri: 0.5, quarter: Math.PI / 4 };
  for (const t of TYPE_ORDER) {
    const p = uprightShape(t);
    assert.ok(Math.abs(area(p) - want[t]) < 0.01, `${t} area ${area(p)}`);
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length;
    assert.ok(Math.abs(Math.min(...p.map(q => q[0])) + Math.max(...p.map(q => q[0]))) < 1.2, `${t} roughly centred`);
    const maxY = Math.max(...p.map(q => q[1]));
    assert.ok(p.filter(q => Math.abs(q[1] - maxY) < 1e-9).length >= 2, `${t} rests on a flat bottom edge`);
  }
});

// ---------- hard mode ----------
import { rotatePts, slotAngle, angleOk, findSnapHard, ANGLE_TOL, TAP_STEP } from "../site/logic.js";

test("rotatePts turns clockwise on screen", () => {
  const [p] = rotatePts([[1, 0]], 90);
  assert.ok(Math.abs(p[0]) < 1e-9 && Math.abs(p[1] - 1) < 1e-9);
});

test("slotAngle recovers how a slot is turned", () => {
  for (const [t, a] of [["tri", 0], ["rhomb", 30], ["thin", 75], ["sq", 45], ["trap", 210], ["quarter", 135], ["bluetri", 300]]) {
    const pts = rotatePts(uprightShape(t), a).map(([x, y]) => [x + 3, y + 2]);
    const got = slotAngle(t, pts, [3, 2]);
    assert.ok(angleOk(t, got, a, 1.5), `${t}: wanted ${a}, got ${got}`);
  }
});

test("angleOk respects each piece's symmetry", () => {
  assert.equal(angleOk("hex", 0, 60, ANGLE_TOL), true);        // hexagon looks the same every 60°
  assert.equal(angleOk("sq", 10, 90, ANGLE_TOL), true);
  assert.equal(angleOk("rhomb", 0, 180, ANGLE_TOL), true);
  assert.equal(angleOk("rhomb", 0, 90, ANGLE_TOL), false);
  assert.equal(angleOk("trap", 0, 180, ANGLE_TOL), false);     // trapezoid upside down does not fit
  assert.equal(angleOk("tri", 350, 0, ANGLE_TOL), true);       // wraps around 360
  assert.equal(ANGLE_TOL, 16); assert.equal(TAP_STEP, 30);
});

test("findSnapHard needs the right type, place and angle", () => {
  const pieces = [{ t: "rhomb", c: [0, 0] }, { t: "rhomb", c: [1, 0] }];
  const angles = [0, 60];
  const none = [false, false];
  assert.equal(findSnapHard("rhomb", [0.1, 0], 0, pieces, none, 0.7, angles), 0);
  assert.equal(findSnapHard("rhomb", [0.1, 0], 60, pieces, none, 0.7, angles), -1);   // right place, wrong angle
  assert.equal(findSnapHard("rhomb", [0.6, 0], 60, pieces, none, 0.7, angles), 1);    // nearest slot whose angle fits
  assert.equal(findSnapHard("rhomb", [0.1, 0], 0, pieces, [true, false], 0.7, angles), -1);
});

test("every slot of real designs gets an angle that fits itself", () => {
  const out = join(mkdtempSync(join(tmpdir(), "gh-")), "all.json");
  execFileSync("python3", ["-c", `import sys; sys.path.insert(0, "${new URL("..", import.meta.url).pathname}"); import export_designs; export_designs.export("${out}")`]);
  const all = JSON.parse(readFileSync(out)).books.flatMap(b => b.groups.flatMap(g => g.designs));
  let worst = 0, where = "";
  for (const d of all) for (const p of d.pieces) {
    const a = slotAngle(p.t, p.pts, p.c);
    const err = shapeError(rotatePts(uprightShape(p.t), a).map(([x, y]) => [x + p.c[0], y + p.c[1]]), p.pts);
    if (err > worst) { worst = err; where = `${d.id} ${p.t}`; }
  }
  assert.ok(worst < 0.05, `worst vertex mismatch ${worst.toFixed(3)} at ${where}`);
});
function shapeError(a, b) {
  return Math.max(...b.map(([x, y]) => Math.min(...a.map(([u, v]) => Math.hypot(u - x, v - y)))));
}
