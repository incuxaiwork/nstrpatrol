import puppeteer from "puppeteer";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = "http://localhost:3000";
const API = "http://localhost:3001";

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const login = await page.evaluate(async (api) => {
    const r = await fetch(`${api}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }) });
    return await r.json();
  }, API);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate((tok, rf, usr) => {
    localStorage.setItem("nstr.auth.accessToken", tok);
    localStorage.setItem("nstr.auth.refreshToken", rf);
    localStorage.setItem("nstr.auth.user", JSON.stringify(usr));
  }, login.accessToken, login.refreshToken, login.user);
  await page.goto(`${BASE}/gis`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(() => !!window.__gisMap, { timeout: 25000 });
  await sleep(8000);

  console.log("=== Clicking 'Patrol Routes' checkbox via panel UI ===");
  // Find the label whose text is 'Patrol Routes' and click its checkbox
  const clicked = await page.evaluate(() => {
    const labels = document.querySelectorAll("label");
    for (const lbl of labels) {
      const txt = lbl.textContent?.trim().toLowerCase() || "";
      if (txt === "patrol routes" || txt.startsWith("patrol routes")) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) { cb.click(); return "clicked Patrol Routes checkbox"; }
      }
    }
    // fallback: any checkbox whose next text is patrol routes
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of cbs) {
      const parent = cb.closest("label");
      if (parent && parent.textContent?.toLowerCase().includes("patrol routes")) { cb.click(); return "clicked via closest label"; }
    }
    return "NOT FOUND";
  });
  console.log("Patrol Routes:", clicked);

  // Also click Ranger Positions
  const clicked2 = await page.evaluate(() => {
    const labels = document.querySelectorAll("label");
    for (const lbl of labels) {
      const txt = lbl.textContent?.trim().toLowerCase() || "";
      if (txt === "ranger positions" || txt.startsWith("ranger positions")) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) { cb.click(); return "clicked Ranger Positions"; }
      }
    }
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of cbs) { const p = cb.closest("label"); if (p && p.textContent?.toLowerCase().includes("ranger positions")) { cb.click(); return "clicked via closest label"; } }
    return "NOT FOUND";
  });
  console.log("Ranger Positions:", clicked2);

  // Wait for the deferred routes fetch + tiles
  console.log("Waiting 10s for routes fetch...");
  await sleep(10000);

  const dump = await page.evaluate(() => {
    const map = window.__gisMap;
    const s = map.getStyle();
    const out = {};
    for (const src of ["markers", "sos-alerts", "routes", "live-rangers", "live-paths"]) {
      const so = s.sources[src];
      if (!so) { out[src] = "NO SOURCE"; continue; }
      if (so.type === "geojson") {
        const feats = so.data?.features ?? [];
        const kinds = {};
        for (const f of feats) { const k = f.properties?.kind ?? "?"; kinds[k] = (kinds[k] || 0) + 1; }
        out[src] = { total: feats.length, byKind: kinds, sample: feats[0] ? { label: feats[0].properties?.label, coords: feats[0].geometry?.coordinates } : null };
      } else out[src] = `type:${so.type}`;
    }
    const cam = map.getCenter();
    let chipTxt = null;
    for (const p of document.querySelectorAll("p")) {
      const t = (p.textContent || "").trim();
      if (/\d+\s+patrol trace|\bGPS\b|active patrol|Live tracking|SOS\b|trace/i.test(t) && t.length < 140) { chipTxt = t; break; }
    }
    return {
      chipTxt,
      sources: out,
      camera: [cam.lng, cam.lat], zoom: map.getZoom(),
      routesVis: s.layers.find(l => l.id === "gl-routes")?.layout?.visibility,
      markersVis: s.layers.find(l => l.id === "gl-markers-obs")?.layout?.visibility,
      queryRendered: {
        routes: map.queryRenderedFeatures({ layers: ["gl-routes"] }).length,
        markers_obs: map.queryRenderedFeatures({ layers: ["gl-markers-obs"] }).length,
      },
    };
  });
  console.log(JSON.stringify(dump, null, 2));
  await page.screenshot({ path: "D:\\Incuxai\\Forest new\\web\\routes-after-fix.png" });
  await browser.close();
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
