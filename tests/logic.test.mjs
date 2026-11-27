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
