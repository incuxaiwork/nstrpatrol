import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = resolve("scripts/.liveshots");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = await (await fetch("http://localhost:3001/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }) })).json();
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--remote-debugging-port=9336", "--user-data-dir=" + resolve(outDir, ".chrome-profile3"), "--window-size=1440,900", "about:blank"], { stdio: "ignore", windowsHide: true });
async function getJson(u) { for (let i = 0; i < 40; i++) { try { return await (await fetch(u)).json(); } catch { await sleep(250); } } throw new Error("unreachable"); }
const ver = await getJson("http://127.0.0.1:9336/json/version");
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
  const ev = async (expr) => (await s("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  await ev(`localStorage.setItem('nstr.auth.accessToken', ${JSON.stringify(login.accessToken)}); localStorage.setItem('nstr.auth.refreshToken', ${JSON.stringify(login.refreshToken)}); true`);
  await s("Page.navigate", { url: "http://localhost:3000/gis" });
  for (let i = 0; i < 180; i++) {
    const st = await ev(`({ canvas: !!document.querySelector('.maplibregl-canvas'), boxes: document.querySelectorAll('input[type=checkbox]').length })`);
    if (st.canvas && st.boxes >= 10) { await sleep(8000); break; }
    await sleep(1000);
  }
  const b = await ev(`(() => { const c = document.querySelector('input[type=checkbox]'); return {
    bodyText: document.body.innerText.slice(0, 4000),
    checkboxLabels: [].slice.call(document.querySelectorAll('input[type=checkbox]')).map(inp => {
      const lab = inp.closest('label');
      return (lab ? lab.textContent.trim() : '(no label)').slice(0, 40);
    }),
  }; })()`);
  console.log(JSON.stringify(b, null, 2));
} finally { try { await send("Browser.close"); } catch {} try { chrome.kill(); } catch {} }