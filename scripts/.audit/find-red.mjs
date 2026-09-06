import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000/gis";
const PORT = 9343;
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--mute-audio",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.cwd() + "\\.scripts\\.liveshots3\\.chrome-probe",
  "--window-size=1440,900", "http://localhost:3000/login",
], { stdio: "ignore", windowsHide: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(u) { for (let i = 0; i < 40; i++) { try { return await (await fetch(u)).json(); } catch { await sleep(250); } } throw new Error("unreachable"); }
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
  await s("Runtime.enable");
  const login = (await (await fetch("http://localhost:3001/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }) })).json());
  const evalJs = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  await sleep(1200);
  await evalJs(`localStorage.setItem("nstr.auth.accessToken", ${JSON.stringify(login.accessToken)}); localStorage.setItem("nstr.auth.refreshToken", ${JSON.stringify(login.refreshToken)}); "ok"`);
  await s("Page.navigate", { url: APP });
  for (let i = 0; i < 240; i++) { const st = await evalJs(`!!document.querySelector('.maplibregl-canvas')`); if (st) break; await sleep(600); }
  await sleep(5000);
  const reds = await evalJs(`[].map.call(document.querySelectorAll('*'), el => {
    const cs = getComputedStyle(el);
    const colors = [cs.color, cs.backgroundColor, cs.borderColor, cs.fill, cs.stroke].filter(c => c && /orderColors?/.test(c));
    return null;
  }).filter(Boolean)`);
  // simpler: elements whose comput color is exactly rgb(179, 38, 30)
  const found = await evalJs(`(() => {
    const hits = [];
    const T = [179, 38, 30];
    const near = (c) => { const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)/.exec(c || ""); if (!m) return false; return Math.abs(+m[1]-T[0])<=3 && Math.abs(+m[2]-T[1])<=3 && Math.abs(+m[3]-T[2])<=3; };
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (near(cs.color)) hits.push({ t: 'color', rect: el.getBoundingClientRect(), cls: (el.className||'').toString().slice(0,80) });
      if (near(cs.backgroundColor)) hits.push({ t: 'bg', rect: el.getBoundingClientRect(), cls: (el.className||'').toString().slice(0,80) });
      if (near(cs.borderColor)) hits.push({ t: 'border', rect: el.getBoundingClientRect(), cls: (el.className||'').toString().slice(0,80) });
    }
    return hits.filter(h => h.rect.width > 0 && h.rect.height > 0).slice(0, 12).map(h => ({ t: h.t, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.width), h: Math.round(h.rect.height), cls: h.cls }));
  })()`);
  console.log(JSON.stringify(found, null, 1));
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}