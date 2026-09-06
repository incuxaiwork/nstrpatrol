import puppeteer from "puppeteer";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = "http://localhost:3000";
const API = "http://localhost:3001";

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("console", m => { if (m.type() === "error") console.log("BROWSER-ERR:", m.text().substring(0, 200)); });

  const login = await page.evaluate(async (api) => {
    const r = await fetch(`${api}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nstrpatrol.gov.in", password: "Admin123!" }) });
    return await r.json();
  }, API);
  console.log("login ok:", !!login.accessToken);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate((tok, rf, usr) => {
    localStorage.setItem("nstr.auth.accessToken", tok);
    localStorage.setItem("nstr.auth.refreshToken", rf);
    localStorage.setItem("nstr.auth.user", JSON.stringify(usr));
  }, login.accessToken, login.refreshToken, login.user);
  await page.goto(`${BASE}/gis`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(() => !!window.__gisMap, { timeout: 25000 });

  // Turn on ALL overlay layers
  await page.evaluate(() => {
    const map = window.__gisMap;
    const ids = ["gl-markers-obs", "gl-markers-ranger", "gl-markers-ranger-label", "gl-markers-sos", "gl-markers-sos-label", "gl-routes", "gl-live-ranger-halo", "gl-live-ranger-dot", "gl-live-ranger-label", "gl-live-path", "gl-live-path-case", "gl-sos-dot", "gl-sos-ring", "gl-sos-label"];
    for (const id of ids) { try { map.setLayoutProperty(id, "visibility", "visible"); } catch {} }
    // Also check the layer state panel: toggle all checkboxes ON
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of cbs) { if (!cb.checked) cb.click(); }
  });
  await sleep(8000);

  const info = await page.evaluate(() => {
    const map = window.__gisMap;
    const style = map.getStyle();
    const layerNames = style.layers.map(l => l.id);
    const probe = (id, src) => {
      const layer = style.layers.find(l => l.id === id);
      if (!layer) return "MISSING";
      const s = style.sources[layer.source];
      const nFeat = s && s.type === "geojson" && s.data ? (s.data.features?.length ?? 0) : 0;
      const vis = layer.layout?.visibility ?? "visible";
      let rendered = 0;
      try { rendered = map.queryRenderedFeatures({ layers: [id] }).length; } catch { rendered = -1; }
      return { vis, nFeat, rendered, type: layer.type };
    };
    return {
      markers_obs: probe("gl-markers-obs"),
      markers_sos: probe("gl-markers-sos"),
      markers_ranger: probe("gl-markers-ranger"),
      routes: probe("gl-routes"),
      live_ranger_dot: probe("gl-live-ranger-dot"),
      sos_dot: probe("gl-sos-dot"),
      sources: Object.keys(style.sources),
      visOpsLayers: layerNames.filter(id => style.layers.find(l => l.id === id)?.layout?.visibility === "visible" && id.startsWith("gl-")),
    };
  });
  console.log("MARKERS OBS:", JSON.stringify(info.markers_obs));
  console.log("MARKERS SOS:", JSON.stringify(info.markers_sos));
  console.log("MARKERS RANGER:", JSON.stringify(info.markers_ranger));
  console.log("ROUTES:", JSON.stringify(info.routes));
  console.log("LIVE RANGER DOT:", JSON.stringify(info.live_ranger_dot));
  console.log("SOS DOT:", JSON.stringify(info.sos_dot));
  console.log("SOURCES:", info.sources.join(", "));
  console.log("VISIBLE GL LAYERS:", info.visOpsLayers.join(", "));
  await page.screenshot({ path: "D:\\Incuxai\\Forest new\\web\\ops-diagnostic.png" });
  await browser.close();
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
