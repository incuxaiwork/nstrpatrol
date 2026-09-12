/* Probe blocks + compartments specifically: dump every MAP LAYERS checkbox
 * label + live checked state, toggle Blocks only, shot & census comps/blocks. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = resolve("scripts/.liveshots");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = await (await fetch("http://localhost:3001/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }) })).json();
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--remote-debugging-port=9337", "--user-data-dir=" + resolve(outDir, ".chrome-profile4"), "--window-size=1440,900", "about:blank"], { stdio: "ignore", windowsHide: true });
async function getJson(u) { for (let i = 0; i < 40; i++) { try { return await (await fetch(u)).json(); } catch { await sleep(250); } } throw new Error("unreachable"); }
const ver = await getJson("http://127.0.0.1:9337/json/version");
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
  const ev = async (expr) => { const r = await s("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
  await sleep(1500);
  await ev(`localStorage.setItem('nstr.auth.accessToken', ${JSON.stringify(login.accessToken)}); localStorage.setItem('nstr.auth.refreshToken', ${JSON.stringify(login.refreshToken)}); true`);
  await s("Page.navigate", { url: "http://localhost:3000/gis" });
  for (let i = 0; i < 180; i++) {
    const st = await ev(`({ canvas: !!document.querySelector('.maplibregl-canvas'), boxes: document.querySelectorAll('input[type=checkbox]').length })`);
    if (st.canvas && st.boxes >= 10) { await sleep(9000); break; }
    await sleep(1000);
  }
  const labels = await ev(`[].slice.call(document.querySelectorAll('input[type=checkbox]')).map(inp => { const lab = inp.closest('label'); const on = inp.checked ? 'ON' : 'off'; return (lab ? lab.textContent.replace(/\\s+/g,' ').trim().slice(0,46) : '(no lab)') + ' [' + on + ']'; })`);
  console.log("CHECKBOXES:\n" + labels.join("\n"));
  const shot = async (name) => { const img = await s("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(outDir, name), Buffer.from(img.data, "base64")); console.log("   saved", name); };
  const toggleBy = async (part) => ev(`(() => { const l = [].find.call(document.querySelectorAll('label'), l => (l.textContent||'').trim().startsWith(${JSON.stringify(part)})); if (!l) return 'missing'; const i = l.querySelector('input[type=checkbox]'); if (i.checked) return 'already-on'; i.click(); return 'toggled-on'; })()`);
  const clearAll = () => ev(`[].forEach.call(document.querySelectorAll('input[type=checkbox]'), b => { if (b.checked) b.click(); });`);
  const zoom = async (dir, n) => { for (let k = 0; k < n; k++) { await ev(`(() => { const b = document.querySelector('[aria-label="${dir === "in" ? "Zoom in" : "Zoom out"}"]'); if (b) b.click(); return !!b; })()`); await sleep(700); } };

  await shot("b0-default.png");
  await clearAll();
  console.log("toggle Blocks:", await toggleBy("Blocks"));
  await sleep(2000);
  await shot("b1-blocks-only.png");
  await zoom("in", 4);
  await sleep(1500);
  await shot("b2-blocks-zoomed.png");
  await zoom("out", 4); await sleep(1200);
  await clearAll();
  console.log("toggle Compartments:", await toggleBy("Compartment Boundaries"));
  await sleep(1500);
  await shot("b3-comp-only.png");
  await zoom("in", 4); await sleep(1500);
  await shot("b4-comp-zoomed.png");
  console.log("final boxes:", JSON.stringify(await ev(`[].slice.call(document.querySelectorAll('input[type=checkbox]')).map(i=>i.checked)`)));
} finally { try { await send("Browser.close"); } catch {} try { chrome.kill(); } catch {} }