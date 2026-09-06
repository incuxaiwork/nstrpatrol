import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000/gis";
const AUTH = "http://localhost:3001/api/auth/login";
const PORT = 9357;
const outDir = resolve("scripts/.liveshots4");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await (await fetch(AUTH, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }),
})).json();

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--mute-audio",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + resolve(outDir, ".chrome-profile"),
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore", windowsHide: true });

async function getJson(url) { for (let i = 0; i < 40; i++) { try { return await (await fetch(url)).json(); } catch { await sleep(250); } } throw new Error("unreachable"); }
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
  const evalJs = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
  const shot = async (n) => { const img = await s("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(outDir, n), Buffer.from(img.data, "base64")); console.log("  shot", n); };

  await sleep(1500);
  await evalJs(`localStorage.setItem("nstr.auth.accessToken", ${JSON.stringify(login.accessToken)}); localStorage.setItem("nstr.auth.refreshToken", ${JSON.stringify(login.refreshToken)}); "ok"`);
  await s("Page.navigate", { url: APP });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { const st = await evalJs(`({ canvas: !!document.querySelector('.maplibregl-canvas'), boxes: document.querySelectorAll('input[type=checkbox]').length })`); if (st.canvas && st.boxes >= 10) { ready = true; await sleep(5000); } await sleep(800); }
  if (!ready) throw new Error("page not ready");

  const zoom = () => evalJs(`(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? 'canvas' : 'no-canvas'; })()`);
  const checked = () => evalJs(`[].filter.call(document.querySelectorAll('label'), l => l.querySelector('input[type=checkbox]')).map(l => l.textContent.trim().slice(0, 40)).filter((_, i, a) => document.querySelectorAll('input[type=checkbox]')[i]?.checked)`);

  console.log("zoom canvas:", await zoom());
  console.log("initially checked:", JSON.stringify(await checked()));
  await evalJs(`[].forEach.call(document.querySelectorAll('input[type=checkbox]'), b => { if (b.checked) b.click(); }); 'cleared'`);
  await sleep(2000);
  console.log("after clear:", JSON.stringify(await checked()));
  await shot("b-off.png");

  const clickBox = async (label, want) => evalJs(`(() => {
    const lab = [].find.call(document.querySelectorAll('label'), l => l.textContent.trim().startsWith(${JSON.stringify(label)}) && l.querySelector('input[type=checkbox]'));
    if (!lab) return 'missing:' + ${JSON.stringify(label)};
    const inp = lab.querySelector('input[type=checkbox]');
    if (inp.checked !== ${want}) inp.click();
    return inp.checked;
  })()`);

  console.log("blocks ON:", await clickBox("Blocks", true));
  await sleep(1600);
  await shot("b-on.png");
  console.log("blocks OFF:", await clickBox("Blocks", false));
  await sleep(1600);
  await shot("b-off2.png");
  console.log("DONE");
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}