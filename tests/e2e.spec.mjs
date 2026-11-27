// End-to-end checks in a real browser (installed Google Chrome) with touch enabled.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const LIFT = 60;                    // the app draws the dragged piece this many px above the finger
const ID = "p03_con_vat_1-1";       // Con thỏ: hex 2, trap 1, rhomb 2, tri 3, thin 3

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
await t("picker lists 234 thumbs", async page => {
  await page.goto(BASE); await page.waitForSelector(".thumb");
  assert.equal(await page.$$eval(".thumb", e => e.length), 234);
});
await t("tray badge counts match pieces", async page => {
  await open(page);
  assert.equal(await badge(page, "hex"), "×2"); assert.equal(await badge(page, "tri"), "×3"); assert.equal(await badge(page, "thin"), "×3");
});
await t("drop on matching slot fills it and decrements badge", async page => {
  await open(page);
  const [i] = await slotSel(page, "tri");
  await dropOnSlot(page, "tri", i);
  assert.equal(await page.$eval(`.slot[data-i="${i}"]`, e => e.classList.contains("filled")), true);
  assert.equal(await badge(page, "tri"), "×2");
});
await t("drop on empty space returns piece and fills nothing", async page => {
  await open(page);
  await drag(page, `.tray-item[data-type="hex"]`, [10, 200]);
  assert.equal(await filledCount(page), 0); assert.equal(await badge(page, "hex"), "×2");
  assert.equal(await page.$$eval(".drag", e => e.length), 0);
});
await t("wrong type near a slot does not fill", async page => {
  await open(page);
  const [i] = await slotSel(page, "hex");
  const [sx, sy] = await center(page, `.slot[data-i="${i}"]`);
  await drag(page, `.tray-item[data-type="tri"]`, [sx, sy + LIFT]);
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
  const [tx, ty] = await center(page, `.tray-item[data-type="tri"]`);
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
  const [i] = await slotSel(page, "tri");
  await dropOnSlot(page, "tri", i);
  await drag(page, `.slot[data-i="${i}"]`, [10, 200]);
  assert.equal(await filledCount(page), 0); assert.equal(await badge(page, "tri"), "×3");
});
if (process.env.E2E_OFFLINE !== "0") await t("works offline after first load", async (page, ctx) => {
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".thumb", { timeout: 4000 });
  assert.equal(await page.$$eval(".thumb", e => e.length), 234);
});

await browser.close(); if (server) server.kill();
for (const r of results) console.log(r.join("  "));
const fails = results.filter(r => r[0] === "FAIL").length;
console.log(`${results.length - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
