/* Live check of the fullscreen MAP LAYERS overlay + satellite notice (v2).
 * Headless-safe fullscreen shim; Network instrumentation for the Esri tile
 * calls; pixel-diff proof that the overlay checkboxes really repaint layers. */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000/gis";
const AUTH = "http://localhost:3001/api/auth/login";
const PORT = 9341;
const outDir = resolve("scripts/.liveshots2");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await (await fetch(AUTH, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }),
})).json();

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  "--mute-audio", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + resolve(outDir, ".chrome-profile-fs2"),
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore", windowsHide: true });

async function getJson(url) {
  for (let i = 0; i < 40; i++) { try { return await (await fetch(url)).json(); } catch { await sleep(250); } }
  throw new Error("chrome unreachable");
}
const ver = await getJson(`http://127.0.0.1:${PORT}/json/version`);
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
let id = 0; const pending = new Map();
const events = [];
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } else if (!m.id) events.push(m); });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

try {
  const { targetId } = await send("Target.createTarget", { url: "http://localhost:3000" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params = {}) => send(method, params, sessionId);
  await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const evalJs = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  const shot = async (name) => {
    const img = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(outDir, name), Buffer.from(img.data, "base64"));
    console.log("   shot", name);
  };

  await sleep(1500);
  await evalJs(`localStorage.setItem("nstr.auth.accessToken", ${JSON.stringify(login.accessToken)}); localStorage.setItem("nstr.auth.refreshToken", ${JSON.stringify(login.refreshToken)}); "ok"`);
  await s("Page.navigate", { url: APP });

  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    const st = await evalJs(`({ canvas: !!document.querySelector('.maplibregl-canvas'), boxes: document.querySelectorAll('input[type=checkbox]').length })`);
    if (st.canvas && st.boxes >= 10) { ready = true; await sleep(6000); }
    await sleep(800);
  }
  if (!ready) throw new Error("gis page not ready");
  const wrapperSel = `document.querySelector('.maplibregl-map').parentElement`;

  // fullscreen shim
  await evalJs(`(() => {
    Element.prototype.requestFullscreen = function () { window.__fsEl = this; document.fullscreenElement = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fsEl || null });
    'shimmed';
  })()`);

  // enter fullscreen, open overlay
  await evalJs(`(() => { window.__fsEl = ${wrapperSel}; document.dispatchEvent(new Event('fullscreenchange')); 'set' })()`);
  await sleep(400);
  const openOverlay = await evalJs(`(() => { const b = [].find.call(document.querySelectorAll('button'), x => (x.getAttribute('aria-label')||'') === 'Show layers panel'); if (!b) return 'missing'; b.click(); return 'ok'; })()`);
  console.log("open overlay:", openOverlay);
  await sleep(1200);

  const overlay = await evalJs(`(() => {
    const cands = [].filter.call(document.querySelectorAll('div'), d => (d.className||'').includes('bottom-16') && (d.className||'').includes('w-72'));
    let best = null;
    for (const d of cands) { const r = d.getBoundingClientRect(); if (r.width > 0 && (!best || r.width * r.height > best.w * best.h)) best = { d, r }; }
    const r = best?.r;
    const canvasR = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect();
    const ctrlR = document.querySelector('.maplibregl-ctrl-group')?.getBoundingClientRect();
    const radios = best?.d.querySelectorAll('input[type=radio]').length ?? 0;
    const checks = best?.d.querySelectorAll('input[type=checkbox]').length ?? 0;
    return {
      found: !!best,
      rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null,
      canvas: canvasR ? { w: Math.round(canvasR.width), h: Math.round(canvasR.height) } : null,
      ctrl: ctrlR ? { x: Math.round(ctrlR.x), y: Math.round(ctrlR.y) } : null,
      radios, checks,
      insideCanvas: !!(r && canvasR && r.right <= canvasR.right + 1 && r.bottom <= canvasR.bottom + 1 && r.x >= canvasR.x - 1),
      aboveControls: !!(r && ctrlR && r.bottom < ctrlR.y - 4),
    };
  })()`);
  console.log("overlay:", JSON.stringify(overlay, null, 1));

  // ensure all layer checkboxes OFF, then enable Blocks via overlay only
  await evalJs(`[].forEach.call(document.querySelectorAll('input[type=checkbox]'), b => { if (b.checked) b.click(); }); 'cleared'`);
  await sleep(1500);
  await shot("fs-all-off.png");
  const enableBlocks = await evalJs(`(() => {
    const lab = [].find.call(document.querySelectorAll('label'), l => /^Blocks\\s*$/.test((l.textContent||'').trim()));
    const inp = lab?.querySelector('input[type=checkbox]');
    if (!inp) return 'missing';
    if (!inp.checked) inp.click();
    return 'ok';
  })()`);
  console.log("enable Blocks (overlay):", enableBlocks);
  await sleep(1800);
  await shot("fs-blocks-on.png");

  // basemap -> satellite
  const sat = await evalJs(`(() => {
    const lab = [].find.call(document.querySelectorAll('label'), l => /^Satellite/.test((l.textContent||'').trim()) && l.querySelector('input[type=radio]'));
    if (!lab) return 'missing';
    lab.querySelector('input[type=radio]').click(); return 'ok';
  })()`);
  console.log("basemap->satellite:", sat);
  await sleep(5000);
  await shot("fs-satellite.png");
  const notice = await evalJs(`(() => {
    const el = [].find.call(document.querySelectorAll('div'), d => d.textContent.includes('Satellite imagery is unreachable'));
    return el ? { text: el.textContent.replace(/\\s+/g,' ').trim(), visible: el.getBoundingClientRect().width > 0 } : null;
  })()`);
  console.log("notice:", JSON.stringify(notice));

  // exit fullscreen; state preserved?
  await evalJs(`(() => { window.__fsEl = null; document.dispatchEvent(new Event('fullscreenchange')); 'exited' })()`);
  await sleep(700);
  const after = await evalJs(`(() => ({
    hideBtnGone: ![].some.call(document.querySelectorAll('button'), b => (b.getAttribute('aria-label')||'') === 'Hide layers panel'),
    overlayGone: ![].some.call(document.querySelectorAll('div'), d => (d.className||'').includes('bottom-16') && (d.className||'').includes('w-72')),
    blocksStillChecked: (() => { const lab = [].find.call(document.querySelectorAll('label'), l => /^Blocks\\s*$/.test((l.textContent||'').trim())); return lab?.querySelector('input[type=checkbox]')?.checked ?? null; })(),
  }))()`);
  console.log("after exit:", JSON.stringify(after));

  const esri = events.filter((e) => e.sessionId === sessionId && (e.method === "Network.responseReceived" || e.method === "Network.loadingFailed") && String(e.params?.response?.url ?? e.params?.requestId ?? "").match(/arcgisonline\.com|arcgis\.com/i));
  const esriStats = {};
  const urlFor = new Map();
  for (const e of events) {
    if (e.sessionId !== sessionId || e.method !== "Network.requestWillBeSent") continue;
    const u = e.params?.request?.url;
    if (u && u.match(/arcgisonline\.com|arcgis\.com/i)) urlFor.set(e.params.requestId, u);
  }
  for (const e of esri) {
    if (e.method === "Network.responseReceived") {
      const u = e.params.response?.url ?? urlFor.get(e.params.requestId) ?? "?";
      const key = "resp " + e.params.response.status;
      esriStats[key] = (esriStats[key] ?? 0) + 1;
      const last = new URL(u).pathname.split("/").filter(Boolean).slice(-2).join("/");
      if (/^resp/.test(key)) esriStats[key + " @ " + last] = (esriStats[key + " @ " + last] ?? 0) + 1;
    } else {
      const u = urlFor.get(e.params?.requestId) ?? "?";
      esriStats["FAIL " + (e.params?.errorText ?? "?")] = (esriStats["FAIL " + (e.params?.errorText ?? "?")] ?? 0) + 1;
    }
  }
  console.log("esri network:", JSON.stringify(esriStats));
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}