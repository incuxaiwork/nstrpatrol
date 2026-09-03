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
  await sleep(10000);

  const dump = await page.evaluate(() => {
    const map = window.__gisMap;
    const s = map.getStyle();
    const out = {};
    // Dump the actual feature data in each operational source
    for (const src of ["markers", "sos-alerts", "routes", "live-rangers", "live-paths"]) {
      const so = s.sources[src];
      if (!so) { out[src] = "NO SOURCE"; continue; }
      if (so.type === "geojson") {
        const feats = so.data?.features ?? [];
        out[src] = feats.map(f => ({
          id: f.id ?? f.properties?.id,
          kind: f.properties?.kind,
          label: f.properties?.label,
          coords: f.geometry?.coordinates,
        }));
      } else { out[src] = `type:${so.type}`; }
    }
    // check markers layer visibility + camera
    const cam = map.getCenter();
    const zoom = map.getZoom();
    // queryRenderedFeatures per ops layer
    const layerIds = ["gl-markers-obs", "gl-markers-sos", "gl-markers-ranger", "gl-routes", "gl-live-ranger-dot", "gl-sos-dot"];
    const q = {};
    for (const id of layerIds) { try { q[id] = map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { q[id] = "err:" + e.message; } }
    // project a camera to SVG space to see expected bounds
    return { sources: out, camera: [cam.lng, cam.lat], zoom, queryRendered: q,
      markersVis: s.layers.find(l => l.id === "gl-markers-obs")?.layout?.visibility,
      routesVis: s.layers.find(l => l.id === "gl-routes")?.layout?.visibility,
    };
  });
  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
