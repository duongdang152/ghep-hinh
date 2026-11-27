// End-to-end checks in a real browser (installed Google Chrome) with touch enabled.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const DATA = JSON.parse(readFileSync(path.join(SITE, "designs.json")));
const ALL = DATA.books.flatMap(b => b.groups.flatMap(g => g.designs));
const N = ALL.length;
const BOOK_OF = id => DATA.books.find(b => b.groups.some(g => g.designs.some(d => d.id === id))).id;
async function openId(page, id) {
  const book = BOOK_OF(id);
  await page.click(`.tab[data-book="${book}"]`);
  await page.click(`.book[data-book="${book}"] .thumb[data-id="${id}"]`);
}
// layout sample: the easy tab, plus the widest, tallest and most-pieces pictures
const by = f => [...ALL].sort((a, b) => f(b) - f(a))[0].id;
const SAMPLE = [...new Set([...DATA.books[0].groups.flatMap(g => g.designs.map(d => d.id)),
  by(d => d.w / d.h), by(d => d.h / d.w), by(d => d.pieces.length), by(d => new Set(d.pieces.map(p => p.t)).size)])];
const LIFT = 60;                    // the app draws the dragged piece this many px above the finger
const ID = "p14_phep_thuat-1";      // Chim cánh cụt: hex 3, rhomb 2, thin 4

let server, BASE = process.env.BASE_URL;
if (!BASE) {
  const port = 8800 + Math.floor(Math.random() * 100);
  server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: SITE, stdio: "ignore" });
  BASE = `http://127.0.0.1:${port}/`;
  await new Promise(r => setTimeout(r, 700));
}
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
async function t(name, fn, viewport = { width: 1024, height: 768 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(4000);
  try { await fn(page, ctx); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); }
  finally { await ctx.close(); }
}

// ---- helpers: synthetic pointer events, like a finger ----
async function pointer(page, type, x, y, id = 1, target = null) {
  await page.evaluate(([type, x, y, id, target]) => {
    const el = target ? document.querySelector(target) : (document.elementFromPoint(x, y) || window);
    const ev = new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, pointerType: "touch", isPrimary: id === 1, bubbles: true, cancelable: true });
    (type === "pointerdown" ? el : window).dispatchEvent(ev);
  }, [type, x, y, id, target]);
}
async function center(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function drag(page, fromSel, to, id = 1) {
  const [x, y] = await center(page, fromSel);
  await pointer(page, "pointerdown", x, y, id);
  await pointer(page, "pointermove", (x + to[0]) / 2, (y + to[1]) / 2, id);
  await pointer(page, "pointermove", to[0], to[1], id);
  await pointer(page, "pointerup", to[0], to[1], id);
  await page.waitForTimeout(350);
}
const slotSel = (page, type) => page.$$eval(".slot:not(.filled)", (els, type) => els.filter(e => e.dataset.type === type).map(e => e.dataset.i), type);
async function dropOnSlot(page, type, i) {
  const [sx, sy] = await center(page, `.slot[data-i="${i}"]`);
  await drag(page, `.tray-item[data-type="${type}"]`, [sx, sy + LIFT]);
}
const open = async page => { await page.goto(BASE); await page.click(`.thumb[data-id="${ID}"]`); await page.waitForSelector("#play:not([hidden]) .slot"); };
const badge = (page, type) => page.$eval(`.tray-item[data-type="${type}"] .badge`, e => e.textContent).catch(() => null);
const filledCount = page => page.$$eval(".slot.filled", e => e.length);

// ---- tests ----
await t("picker lists every picture", async page => {
  await page.goto(BASE); await page.waitForSelector(".thumb");
  assert.equal(await page.$$eval(".thumb", e => e.length), N);
});
await t("tray badge counts match pieces", async page => {
  await open(page);
  assert.equal(await badge(page, "hex"), "×3"); assert.equal(await badge(page, "rhomb"), "×2"); assert.equal(await badge(page, "thin"), "×4");
});
await t("drop on matching slot fills it and decrements badge", async page => {
  await open(page);
  const [i] = await slotSel(page, "thin");
  await dropOnSlot(page, "thin", i);
  assert.equal(await page.$eval(`.slot[data-i="${i}"]`, e => e.classList.contains("filled")), true);
  assert.equal(await badge(page, "thin"), "×3");
});
await t("drop on empty space returns piece and fills nothing", async page => {
  await open(page);
  await drag(page, `.tray-item[data-type="hex"]`, [10, 200]);
  assert.equal(await filledCount(page), 0); assert.equal(await badge(page, "hex"), "×3");
  assert.equal(await page.$$eval(".drag", e => e.length), 0);
});
await t("wrong type near a slot does not fill", async page => {
  await open(page);
  const [i] = await slotSel(page, "hex");
  const [sx, sy] = await center(page, `.slot[data-i="${i}"]`);
  await drag(page, `.tray-item[data-type="thin"]`, [sx, sy + LIFT]);
  assert.equal(await filledCount(page), 0);
});
await t("filling all slots shows #done and the thumb gets ★", async page => {
  await open(page);
  for (let k = 0; k < 30; k++) {
    const left = await page.$$eval(".slot:not(.filled)", els => els.map(e => [e.dataset.type, e.dataset.i]));
    if (!left.length) break;
    await dropOnSlot(page, left[0][0], left[0][1]);
  }
  await page.waitForSelector("#done:not([hidden])", { timeout: 2000 });
  await page.click("#to-list");
  assert.equal(await page.$eval(`.thumb[data-id="${ID}"]`, e => e.classList.contains("done")), true);
});
await t("second simultaneous pointer is ignored", async page => {
  await open(page);
  const [i] = await slotSel(page, "hex");
  const [sx, sy] = await center(page, `.slot[data-i="${i}"]`);
  const [hx, hy] = await center(page, `.tray-item[data-type="hex"]`);
  const [tx, ty] = await center(page, `.tray-item[data-type="thin"]`);
  await pointer(page, "pointerdown", hx, hy, 1);
  await pointer(page, "pointerdown", tx, ty, 2);
  assert.equal(await page.$$eval(".drag", e => e.length), 1);
  await pointer(page, "pointermove", sx, sy + LIFT, 2);
  await pointer(page, "pointerup", sx, sy + LIFT, 2);
  await pointer(page, "pointermove", sx, sy + LIFT, 1);
  await pointer(page, "pointerup", sx, sy + LIFT, 1);
  await page.waitForTimeout(350);
  assert.equal(await filledCount(page), 1);
  assert.equal(await page.$eval(`.slot[data-i="${i}"]`, e => e.dataset.type), "hex");
});
await t("resize to phone keeps filled slots filled", async page => {
  await open(page);
  const [i] = await slotSel(page, "rhomb");
  await dropOnSlot(page, "rhomb", i);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(await page.$eval(`.slot[data-i="${i}"]`, e => e.classList.contains("filled")), true);
  const b = await page.locator("#board").boundingBox();
  assert.ok(b.width <= 390, "board fits the phone width");
});
await t("a placed piece can be dragged back out", async page => {
  await open(page);
  const [i] = await slotSel(page, "thin");
  await dropOnSlot(page, "thin", i);
  await drag(page, `.slot[data-i="${i}"]`, [10, 200]);
  assert.equal(await filledCount(page), 0); assert.equal(await badge(page, "thin"), "×4");
});
await t("touched node survives the drag (iOS stuck-drag)", async page => {
  await open(page);
  const [i] = await slotSel(page, "thin");
  await dropOnSlot(page, "thin", i);
  // lift the placed piece: the node under the finger must stay in the page during the drag
  const [x, y] = await center(page, `.slot[data-i="${i}"]`);
  await page.evaluate(([x, y]) => { window.__touched = document.elementFromPoint(x, y); }, [x, y]);
  await pointer(page, "pointerdown", x, y, 1);
  assert.equal(await page.evaluate(() => window.__touched.isConnected), true, "slot node kept");
  await pointer(page, "pointerup", 10, 200, 1);
  // grab a tray item immediately after a drop: it must stay in the page too
  const [j] = await slotSel(page, "thin");
  const [sx, sy] = await center(page, `.slot[data-i="${j}"]`);
  await drag(page, `.tray-item[data-type="thin"]`, [sx, sy + LIFT]);
  const [hx, hy] = await center(page, `.tray-item[data-type="hex"]`);
  await page.evaluate(([x, y]) => { window.__tray = document.elementFromPoint(x, y).closest(".tray-item"); }, [hx, hy]);
  await pointer(page, "pointerdown", hx, hy, 1);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__tray.isConnected), true, "tray node kept");
  await pointer(page, "pointerup", 10, 200, 1);
});
await t("tray fits a phone without sideways scrolling", async page => {
  await page.goto(BASE); await page.click('.thumb[data-id="p04_con_vat_2-8"]'); await page.waitForSelector(".tray-item");
  const right = await page.$$eval(".tray-item", els => Math.max(...els.map(e => e.getBoundingClientRect().right)));
  assert.ok(right <= 390, `last tray item ends at ${right}`);
  const sizes = await page.$$eval(".tray-item", els => els.map(e => e.getBoundingClientRect().width));
  assert.ok(Math.min(...sizes) >= 44, "items stay finger-sized");
}, { width: 390, height: 844 });
await t("pinch-zoom blocked on play and done screens", async page => {
  await open(page);
  const ta = await page.evaluate(() => ["#play", "#done", "#picker"].map(s => getComputedStyle(document.querySelector(s)).touchAction));
  assert.deepEqual(ta, ["none", "none", "pan-y"]);
});
await t("rotate mid-drag puts a lifted piece back in its slot", async page => {
  await open(page);
  const [i] = await slotSel(page, "thin");
  await dropOnSlot(page, "thin", i);
  const [x, y] = await center(page, `.slot[data-i="${i}"]`);
  await pointer(page, "pointerdown", x, y, 1);
  await page.setViewportSize({ width: 768, height: 1024 }); await page.waitForTimeout(300);
  assert.equal(await page.$eval(`.slot[data-i="${i}"]`, e => e.classList.contains("filled")), true);
  assert.equal(await page.$$eval(".drag", e => e.length), 0);
});
await t("tapping back right after the last piece keeps the star, no error", async page => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await open(page);
  for (let k = 0; k < 30; k++) {
    const left = await page.$$eval(".slot:not(.filled)", els => els.map(e => [e.dataset.type, e.dataset.i]));
    if (left.length <= 1) break;
    await dropOnSlot(page, left[0][0], left[0][1]);
  }
  const [[type, i]] = await page.$$eval(".slot:not(.filled)", els => els.map(e => [e.dataset.type, e.dataset.i]));
  const [sx, sy] = await center(page, `.slot[data-i="${i}"]`);
  const [tx, ty] = await center(page, `.tray-item[data-type="${type}"]`);
  await pointer(page, "pointerdown", tx, ty, 1);
  await pointer(page, "pointermove", sx, sy + LIFT, 1);
  await pointer(page, "pointerup", sx, sy + LIFT, 1);
  await page.click("#back");
  await page.waitForTimeout(400);
  assert.deepEqual(errors, []);
  assert.equal(await page.$eval(`.thumb[data-id="${ID}"]`, e => e.classList.contains("done")), true);
});
for (const [w, h] of [[1024, 1366], [768, 1024], [390, 844], [844, 390]]) {
  await t(`picture is not hidden under the tray at ${w}x${h}`, async page => {
    for (const id of SAMPLE) {
      await page.goto(BASE); await openId(page, id); await page.waitForSelector(".tray-item");
      await page.waitForTimeout(100);
      const trayTop = (await page.locator("#tray").boundingBox()).y;
      const headerBottom = await page.$eval("#play .bar", e => e.getBoundingClientRect().bottom);
      const [top, bottom] = await page.$$eval(".slot", els => { const r = els.map(e => e.getBoundingClientRect()); return [Math.min(...r.map(b => b.top)), Math.max(...r.map(b => b.bottom))]; });
      assert.ok(bottom <= trayTop + 0.5, `${id}: picture ends at ${bottom}, tray starts at ${trayTop}`);
      assert.ok(top >= headerBottom - 0.5, `${id}: picture starts at ${top}, header ends at ${headerBottom}`);
    }
  }, { width: w, height: h });
}
await t("restart empties the board", async page => {
  await open(page);
  const [i] = await slotSel(page, "thin");
  await dropOnSlot(page, "thin", i);
  await page.click("#restart"); await page.waitForTimeout(200);
  assert.equal(await filledCount(page), 0); assert.equal(await badge(page, "thin"), "×4");
});
if (process.env.E2E_OFFLINE !== "0") await t("works offline after first load", async (page, ctx) => {
  await page.goto(BASE);
  const ok = await page.evaluate(() => Promise.race([
    navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false,
    new Promise(r => setTimeout(() => r(false), 3000))]));
  assert.ok(ok, "service worker active");
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".thumb", { timeout: 4000 });
  assert.equal(await page.$$eval(".thumb", e => e.length), N);
});

await browser.close(); if (server) server.kill();
for (const r of results) console.log(r.join("  "));
const fails = results.filter(r => r[0] === "FAIL").length;
console.log(`${results.length - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
