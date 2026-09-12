/* Live-app GIS proof (with auth) — drives the REAL Next dev app (localhost:3000)
 * over CDP: injects a real admin session, toggles the actual MAP LAYERS checkboxes
 * and captures screenshots for raster analysis. Read-only against the app.      */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000/gis";
const AUTH = "http://localhost:3001/api/auth/login";
const PORT = 9335;
const outDir = resolve(process.argv[2] ?? "scripts/.liveshots");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await (async () => {
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }),
  });
  if (!res.ok) throw new Error("auth failed " + res.status);
  return res.json();
})();
console.log("authenticated, accessToken len", login.accessToken.length);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  "--mute-audio", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + resolve(outDir, ".chrome-profile"),
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
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

try {
  const { targetId } = await send("Target.createTarget", { url: "http://localhost:3000" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params = {}) => send(method, params, sessionId);
  await s("Page.enable"); await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const evalJs = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  // set session on the app origin, then hard-navigate to /gis with tokens present
  await sleep(1500);
  const ls = await evalJs(`(() => { try { localStorage.setItem('nstr.auth.accessToken', ${JSON.stringify(login.accessToken)}); localStorage.setItem('nstr.auth.refreshToken', ${JSON.stringify(login.refreshToken)}); return 'ok'; } catch(e){ return 'ls err '+e; } })()`);
  console.log("localStorage inject:", ls);
  await s("Page.navigate", { url: APP });

  const shot = async (name) => {
    const img = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(outDir, name), Buffer.from(img.data, "base64"));
    console.log("   saved", name);
  };

  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    const st = await evalJs(`({ canvas: !!document.querySelector('.maplibregl-canvas'), boxes: document.querySelectorAll('input[type=checkbox]').length })`);
    if (st.canvas && st.boxes >= 10) { ready = true; await sleep(7000); }
    if (i % 30 === 0) console.log("waiting…", JSON.stringify(st));
    await sleep(1000);
  }
  if (!ready) throw new Error("gis page not ready");
  console.log("GIS page ready —", JSON.stringify(await evalJs(`({ hdr: (document.body.innerText.match(/NSTR Forest[^\\n]*/)||[])[0] || null, spatial: (document.body.innerText.match(/Loading spatial layers[^\\n]*|Spatial layers failed[^\\n]*/)||[])[0] || null })`)));

  const setCheckbox = async (labelPart, value = true) =>
    evalJs(`(() => {
      const labels = [].filter.call(document.querySelectorAll('label'), l => (l.textContent||'').trim().startsWith(${JSON.stringify(labelPart)}));
      const lab = labels.find(l => l.querySelector('input[type=checkbox]')) || labels[0];
      if (!lab) return 'missing';
      const inp = lab.querySelector('input[type=checkbox]');
      if (!inp) return 'no-input';
      if (inp.checked !== ${value}) inp.click();
      return 'ok';
    })()`);
  const clearAll = () => evalJs(`[].forEach.call(document.querySelectorAll('input[type=checkbox]'), b => { if (b.checked) b.click(); });`);
  const zoomBy = async (dir, n = 1) => {
    for (let i = 0; i < n; i++) {
      await evalJs(`(() => { const b = document.querySelector('[aria-label="${dir === "in" ? "Zoom in" : "Zoom out"}"]'); if (b) b.click(); return !!b; })()`);
      await sleep(600);
    }
  };

  console.log("shot 0: default (all OFF)");
  await shot("0-default.png");

  console.log("Compartment Boundaries ON only");
  await clearAll();
  console.log("  set comp:", await setCheckbox("Compartment Boundaries"));
  await sleep(1500);
  await shot("1-comp-only.png");

  console.log("zoom in x4 then shot");
  await zoomBy("in", 4);
  await shot("2-comp-zoomed-in.png");

  console.log("back to fit then full stack");
  await zoomBy("out", 4);
  await setCheckbox("Forest Boundary"); await setCheckbox("Range Boundaries"); await setCheckbox("Beat Boundaries"); await setCheckbox("Blocks"); await setCheckbox("Compartment Boundaries");
  await sleep(2500);
  await shot("3-full-stack.png");

  console.log("Forest only");
  await clearAll();
  await setCheckbox("Forest Boundary");
  await sleep(1500);
  await shot("4-forest-only.png");

  console.log("Forest + Range");
  await setCheckbox("Range Boundaries");
  await sleep(1500);
  await shot("5-forest-range.png");

  console.log("Forest + Range + Beat");
  await setCheckbox("Beat Boundaries");
  await sleep(1500);
  await shot("6-forest-range-beat.png");

  console.log("zoom IN x2 (nearer view) shot: 6b");
  await zoomBy("in", 2);
  await shot("6b-forest-range-beat-zoomed.png");

  console.log("DONE");
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}