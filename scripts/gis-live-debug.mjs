/* Dump live-app page state over CDP (diagnostic). */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.argv[2] ?? "http://localhost:3000/gis";
const PORT = 9334;
const outDir = resolve("scripts/.liveshots");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + resolve(outDir, ".chrome-profile2"),
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
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params = {}) => send(method, params, sessionId);
  await s("Page.enable"); await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const log = [];
  s("Runtime.enable").then(() => s("Log.enable"));
  await s("Page.navigate", { url: APP });
  for (let i = 0; i < 60; i++) {
    const r = await s("Runtime.evaluate", { expression: `({
      canvas: !!document.querySelector('.maplibregl-canvas'),
      canvases: document.querySelectorAll('.maplibregl-canvas').length,
      boxes: document.querySelectorAll('input[type=checkbox]').length,
      txt: (document.body.innerText||'').slice(0,900)
    })`, returnByValue: true });
    const v = r.result?.value;
    if (v?.canvas && v.boxes > 5) { console.log("READY", JSON.stringify(v).slice(0,400)); break; }
    if (i % 10 === 0) console.log("wait", i, JSON.stringify(v).slice(0,200));
    await sleep(1000);
  }
  // now wait for data to hydrate (operational view header)
  for (let i = 0; i < 60; i++) {
    const r = await s("Runtime.evaluate", { expression: `(() => {
      const t = document.body.innerText || '';
      return { hasHeader: t.includes('operational view'), statusChip: (t.match(/Loading spatial layers|Spatial layers failed[^\\n]*/)||[])[0]||null,
               errs: [].slice.call(document.querySelectorAll('p')).map(p=>p.textContent).filter(x=>/fail|unavailable|error/i.test(x)).slice(0,4) };
    })()`, returnByValue: true });
    const v = r.result?.value;
    console.log("data-wait", i, JSON.stringify(v).slice(0,300));
    if (v.hasHeader || v.statusChip === null && v.errs.length) { if (v.hasHeader) break; }
    await sleep(2000);
  }
  const img = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(outDir, "debug.png"), Buffer.from(img.data, "base64"));
  console.log("saved debug.png");
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}