/* Style audit driver — loads the harness (real maplibre-gl 6.3.0 + real layer
 * bundle data) and dumps the ACTUAL style objects: sources, every admin layer's
 * paint/layout/minzoom/filter, z-order, fitted zoom and zoom gates.           */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HARNESS = "http://127.0.0.1:9399/harness";
const PORT = 9336;
const outDir = resolve(process.argv[2] ?? "scripts/.audit/harness-shots");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const { targetId } = await send("Target.createTarget", { url: HARNESS });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params = {}) => send(method, params, sessionId);
  await s("Page.enable"); await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const pageLogs = [];
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.sessionId === sessionId && (m.method === "Runtime.exceptionThrown" || m.method === "Runtime.consoleAPICalled" || m.method === "Log.entryAdded")) pageLogs.push(m); });

  const evalJs = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  let audit = null;
  for (let i = 0; i < 120 && !audit; i++) {
    const t = await evalJs(`document.title`);
    if (t && t.startsWith("AUDIT_READY")) break;
    if (t && t.startsWith("AUDIT_ERROR")) throw new Error("harness audit error");
    if (i % 20 === 0) console.log("waiting for harness…", t);
    await sleep(700);
  }
  const title = await evalJs(`document.title`);
  if (!title.startsWith("AUDIT_READY")) {
    console.log("PAGE LOGS:\n" + JSON.stringify(pageLogs.map((m) => ({ t: m.method, r: m.params?.exceptionDetails?.exception?.description ?? m.params?.entry?.text ?? (m.params?.args || []).map((a) => a.value ?? a.description).join(" ") })), null, 1).slice(0, 4000));
    throw new Error("harness never ready: " + title + " | body: " + (await evalJs(`document.body.innerText.slice(0,200)`)));
  }
  audit = await evalJs(`window.__AUDIT__`);
  writeFileSync(resolve(outDir, "../style-audit.json"), JSON.stringify(audit, null, 1));

  const compact = {
    fittedZoom: audit.zoom,
    zOrder: audit.layers.map((l) => l.id),
    sources: audit.sources,
    labelCounts: audit.labelCounts,
    zoomGates: audit.zoomGates,
    thresholds: audit.thresholds,
  };
  console.log(JSON.stringify(compact, null, 1));
  console.log("---");
  for (const l of audit.layers) {
    if (/^gl-(compartments|blocks|beats|ranges|boundary|grids|agrid)/.test(l.id)) {
      const p = l.paint || {};
      console.log(`${l.id} [${l.type} src=${l.source} minz=${l.minzoom} vis=${l.visibility}] filter=${l.filter ? "yes" : "none"} | paint=` +
        `${p["line-color"] ?? p["fill-color"] ?? ""} w=${p["line-width"] ?? ""} op=${p["line-opacity"] ?? ""} dash=${JSON.stringify(p["line-dasharray"] ?? null)} | layout-cap=${l.layout["line-cap"] ?? "-"} join=${l.layout["line-join"] ?? "-"}`);
    }
  }
  const img = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(outDir, "harness-fit.png"), Buffer.from(img.data, "base64"));
  console.log("saved harness-fit.png");
} finally {
  try { await send("Browser.close"); } catch {}
  try { chrome.kill(); } catch {}
}