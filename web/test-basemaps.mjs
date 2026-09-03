import puppeteer from "puppeteer";

const BASE = "http://localhost:3000";
const API = "http://localhost:3001";
const TIMEOUT = 45_000;
const NAV_TIMEOUT = 30_000;

const results = {};
let esriRequests = [];
let apiTilesRequests = [];
let allExternalHosts = new Set();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page.setDefaultTimeout(TIMEOUT);

  const networkLog = [];
  page.on("request", (req) => {
    const url = req.url();
    networkLog.push(url);
    try {
      const h = new URL(url).hostname;
      if (h !== "localhost" && h !== "127.0.0.1") allExternalHosts.add(h);
      if (h.includes("arcgisonline") || h.includes("arcgis.com")) esriRequests.push(url);
      if (h === "localhost" && url.includes("/api/tiles")) apiTilesRequests.push(url);
    } catch {}
  });

  // === 1. LOGIN ===
  console.log("=== 1. Login via API ===");
  const loginRes = await page.evaluate(async (api) => {
    const r = await fetch(`${api}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }),
    });
    if (!r.ok) return { error: `${r.status}: ${await r.text()}` };
    return await r.json();
  }, API);

  if (loginRes.error) { console.log("LOGIN FAILED:", loginRes.error); await browser.close(); process.exit(1); }
  console.log("Login OK, user:", loginRes.user?.email, "role:", loginRes.user?.role);

  // === 2. SET AUTH & NAVIGATE ===
  console.log("\n=== 2. Set auth tokens, navigate to /gis ===");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await sleep(1000);

  // Set the exact localStorage keys the API client uses
  await page.evaluate((res) => {
    localStorage.setItem("nstr.auth.accessToken", res.accessToken);
    localStorage.setItem("nstr.auth.refreshToken", res.refreshToken);
    localStorage.setItem("nstr.auth.user", JSON.stringify(res.user));
  }, loginRes);

  const ls = await page.evaluate(() => ({
    keys: Object.keys(localStorage).filter(k => k.startsWith("nstr.")),
    token: localStorage.getItem("nstr.auth.accessToken")?.substring(0, 30),
  }));
  console.log("localStorage nstr keys:", ls.keys, "token:", ls.token + "...");

  // Navigate to GIS
  await page.goto(`${BASE}/gis`, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT });
  await sleep(2000);
  console.log("URL:", page.url());

  if (page.url().includes("/login")) {
    console.log("ERROR: Redirected back to login despite auth tokens");
    // Debug
    const d = await page.evaluate(() => ({ body: document.body?.innerText?.substring(0, 300) }));
    console.log("Page:", d.body);
    await browser.close();
    process.exit(1);
  }

  // === 3. WAIT FOR WEBGL ===
  console.log("\n=== 3. Wait for WebGL canvas ===");
  try {
    await page.waitForFunction(() => !!document.querySelector("canvas") && !!window.__gisMap, { timeout: 25_000 });
    console.log("Canvas found");
  } catch (e) {
    const d = await page.evaluate(() => ({
      url: location.href,
      canvases: document.querySelectorAll("canvas").length,
      mapDiv: !!document.querySelector("[role=img]"),
      body: document.body?.innerText?.substring(0, 500),
    }));
    console.log("Canvas NOT found. Debug:", JSON.stringify(d, null, 2));
    await browser.close();
    process.exit(1);
  }

  console.log("Waiting 12s for tiles + GIS data...");
  await sleep(12000);

  // === 4. VERIFY ATLAS (DEFAULT) ===
  console.log("\n=== 4. Verify Atlas mode ===");
  const inspect = async () => {
    return await page.evaluate(() => {
      const map = window.__gisMap;
      if (!map) return { error: "No __gisMap" };
      const s = map.getStyle();
      const layers = s.layers.map(l => l.id);
      const gis = layers.filter(id => id.startsWith("gl-"));
      const c = map.getCenter();
      const z = map.getZoom();
      const vb = s.layers.filter(l => l.id.startsWith("gl-basemap-") && l.layout?.visibility !== "none").map(l => l.id);
      const has = (n) => layers.includes(n);
      const vis = (n) => { const l = s.layers.find(x => x.id === n); return !!l && l.layout?.visibility !== "none"; };
      let fc = 0; try { fc = map.queryRenderedFeatures().length; } catch { fc = -1; }
      const dupes = {};
      for (const n of layers) dupes[n] = (dupes[n] || 0) + 1;
      return {
        src: Object.keys(s.sources), total: layers.length, gis: gis.length, gisList: gis,
        center: [c.lng, c.lat], zoom: z, visibleBasemap: vb,
        boundaryLine: has("gl-boundary-line") && vis("gl-boundary-line"),
        boundaryFill: has("gl-boundary-fill"),
        rangesFill: has("gl-ranges-fill"), rangesOutline: has("gl-ranges-outline"), rangesLabel: has("gl-ranges-label"),
        beatsFill: has("gl-beats-fill"), beatsOutline: has("gl-beats-outline"), beatsLabel: has("gl-beats-label"),
        compartmentsFill: has("gl-compartments-fill"), compartmentsLine: has("gl-compartments-line"), compartmentsLabel: has("gl-compartments-label"),
        agridFill: has("gl-agrid-fill"), agridLine: has("gl-agrid-line"), agridLabel: has("gl-agrid-label"),
        agridSelFill: has("gl-agrid-sel-fill"), agridSelLine: has("gl-agrid-sel-line"),
        boundaryOrigin: s.layers.find(l => l.id === "gl-boundary-line")?.source ?? null,
        featCount: fc,
        dupes: Object.entries(dupes).filter(([, c]) => c > 1),
      };
    });
  };

  let initial = await inspect();
  if (initial.error) { console.log("ERROR:", initial.error); await browser.close(); process.exit(1); }

  console.log("Sources:", initial.src.join(", "));
  console.log("Total layers:", initial.total, "| GIS layers:", initial.gis);
  console.log("GIS layer IDs:", initial.gisList.join(", "));
  console.log("Visible basemap:", initial.visibleBasemap);
  console.log("Center:", initial.center, "zoom:", initial.zoom.toFixed(2));
  console.log("queryRenderedFeatures:", initial.featCount);
  console.log("Boundary line:", initial.boundaryLine, "| fill:", initial.boundaryFill, "| source:", initial.boundaryOrigin);
  console.log("Ranges:", initial.rangesFill, initial.rangesOutline, initial.rangesLabel);
  console.log("Beats:", initial.beatsFill, initial.beatsOutline, initial.beatsLabel);
  console.log("Compartments:", initial.compartmentsFill, initial.compartmentsLine, initial.compartmentsLabel);
  console.log("Grid:", initial.agridFill, initial.agridLine, initial.agridLabel, "| sel:", initial.agridSelFill, initial.agridSelLine);
  if (initial.dupes.length > 0) console.log("!!! DUPLICATES:", initial.dupes);
  else console.log("No duplicates.");

  results.atlas = { ok: true, ...initial };

  await page.screenshot({ path: "D:\\Incuxai\\Forest new\\web\\basemap-atlas.png" });

  // === 5-7. TEST EACH RASTER BASEMAP ===
  const modes = ["street", "terrain", "satellite"];
  for (const mode of modes) {
    console.log(`\n${"=".repeat(50)}\n=== ${mode.toUpperCase()} ===`);
    const netBefore = networkLog.length;

    // Click the radio via the UI
    const clicked = await page.evaluate((key) => {
      const radios = document.querySelectorAll('input[type="radio"]');
      for (const r of radios) { if (r.value === key) { r.click(); return `radio[${r.name}]=${key}`; } }
      const all = document.querySelectorAll("label, span, p, div");
      for (const el of all) {
        const t = el.textContent?.toLowerCase().trim();
        if (t === key) { el.click(); return `text:${el.tagName}:"${el.textContent?.trim()}"`; }
      }
      return null;
    }, mode);
    console.log("Click:", clicked ?? "FAILED");

    console.log("Waiting 6s for tiles...");
    await sleep(6000);

    const st = await inspect();
    if (st.error) { console.log("ERROR:", st.error); results[mode] = { ok: false }; continue; }

    console.log("Sources:", st.src.join(", "));
    console.log("Total layers:", st.total, "| GIS:", st.gis);
    console.log("Visible basemap:", st.visibleBasemap);
    console.log("Center:", st.center, "zoom:", st.zoom.toFixed(2));
    console.log("queryRenderedFeatures:", st.featCount);
    console.log("Boundary:", st.boundaryLine, "| Ranges:", st.rangesFill, "| Beats:", st.beatsFill);
    console.log("Compartments:", st.compartmentsFill, "| Grid:", st.agridFill, "/", st.agridLine);
    if (st.dupes.length > 0) console.log("!!! DUPLICATES:", st.dupes);
    else console.log("No duplicates.");

    // Camera drift
    const dlng = Math.abs(st.center[0] - initial.center[0]);
    const dlat = Math.abs(st.center[1] - initial.center[1]);
    const dz = Math.abs(st.zoom - initial.zoom);
    console.log(`Camera drift from Atlas: Δlng=${dlng.toFixed(4)} Δlat=${dlat.toFixed(4)} Δzoom=${dz.toFixed(2)}`);

    // Providers
    const reqs = networkLog.slice(netBefore);
    const hosts = new Set();
    for (const u of reqs) { try { const h = new URL(u).hostname; if (h !== "localhost") hosts.add(h); } catch {} }
    console.log("Providers contacted:", [...hosts].join(", "));

    results[mode] = { ok: true, ...st, hosts: [...hosts] };
    await page.screenshot({ path: `D:\\Incuxai\\Forest new\\web\\basemap-${mode}.png` });
  }

  // === 8. CYCLE TEST ===
  console.log(`\n${"=".repeat(50)}\n=== CYCLE TEST (8 switches) ===`);
  const cycle = ["atlas", "street", "terrain", "satellite", "atlas", "satellite", "street", "terrain"];
  let prevTotal = initial.total;
  let cyclePass = true;

  for (let i = 0; i < cycle.length; i++) {
    const mode = cycle[i];
    await page.evaluate((key) => {
      const radios = document.querySelectorAll('input[type="radio"]');
      for (const r of radios) { if (r.value === key) { r.click(); return; } }
      const all = document.querySelectorAll("label, span, p, div");
      for (const el of all) { if (el.textContent?.toLowerCase().trim() === key) { el.click(); return; } }
    }, mode);
    await sleep(4000);

    const cs = await page.evaluate(() => {
      const map = window.__gisMap;
      if (!map) return null;
      const s = map.getStyle();
      const layers = s.layers.map(l => l.id);
      const dupes = {};
      for (const n of layers) dupes[n] = (dupes[n] || 0) + 1;
      return {
        total: layers.length, gis: layers.filter(id => id.startsWith("gl-")).length,
        dups: Object.entries(dupes).filter(([, c]) => c > 1),
        vb: s.layers.filter(l => l.id.startsWith("gl-basemap-") && l.layout?.visibility !== "none").map(l => l.id),
      };
    });
    if (cs) {
      const growth = cs.total - prevTotal;
      const flag = growth > 0 ? ` ⚠️+${growth}` : growth < 0 ? ` (${growth})` : "";
      console.log(`  [${i+1}] ${mode.padEnd(10)} total=${cs.total} gis=${cs.gis} vb=${cs.vb}${flag}`);
      if (cs.dups.length > 0) { console.log("       DUPLICATES:", cs.dups.map(([n,c]) => `${n}×${c}`).join(", ")); cyclePass = false; }
      prevTotal = cs.total;
    }
  }
  await page.screenshot({ path: "D:\\Incuxai\\Forest new\\web\\basemap-cycle-final.png" });

  // === FINAL REPORT ===
  console.log(`\n${"=".repeat(60)}\n=== FINAL REPORT ===\n${"=".repeat(60)}`);
  console.log("Esri requests:", esriRequests.length, esriRequests.length === 0 ? "✓" : "✗");
  console.log("/api/tiles requests:", apiTilesRequests.length, apiTilesRequests.length === 0 ? "✓" : "✗");
  console.log("External hosts contacted:", [...allExternalHosts].join(", "));
  console.log("Cycle test clean:", cyclePass ? "✓" : "✗ DUPLICATES FOUND");

  for (const m of ["atlas", "street", "terrain", "satellite"]) {
    const r = results[m];
    console.log(`\n${m.toUpperCase()}: ${r.ok ? "PASS" : "FAIL"}`);
    if (r.ok) {
      console.log(`  Providers: ${r.hosts?.join(", ") || "OpenFreeMap (style)"}`);
      console.log(`  GIS overlays: ${r.gis} | Boundary: ${r.boundaryLine} | Ranges: ${r.rangesFill} | Beats: ${r.beatsFill}`);
      console.log(`  Compartments: ${r.compartmentsFill} | Grid: ${r.agridFill}/${r.agridLine} | queryFeatures: ${r.featCount}`);
    }
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
