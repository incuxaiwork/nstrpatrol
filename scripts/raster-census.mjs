/* Raster census of map screenshots using the REAL layer colors from map.tsx.
 * Reports total matching pixels + longest runs per layer color, per image. */
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";

const DIR = resolve(process.argv[2] ?? "scripts/.liveshots");

// Real paint colors from web/components/map.tsx
const COLORS = {
  comp: { hex: "#B3261E", label: "compartment line (thin red)" },
  beat: { hex: "#E65100", label: "beat outline (orange)" },
  block: { hex: "#5B2C6F", label: "block outline (purple)" },
  range: { hex: "#0E4C92", label: "range outline (blue)" },
  forest: { hex: "#1B4332", label: "forest boundary (green)" },
  compLabel: { hex: "#6A3AB2", label: "comp label (violet)" },
};

function pngInfo(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  // IHDR at offset 8: width @16, height @20
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return { w, h };
}
function decode(buf) {
  // minimal PNG decoder via zlib inflate; handles color type 2/6, no interlacing
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const ctype = buf[25], bitDepth = buf[24];
  if (ctype !== 6 && ctype !== 2) throw new Error("unsupported color type " + ctype);
  // find IDAT chunks
  let off = 8, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IHDR" || type === "IDAT" || type === "PLTE" || type === "tRNS" || type === "IEND") {
      // collect IDAT payload
    }
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ctype === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let pos = 0; let prev = Buffer.alloc(stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = Buffer.from(line);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) cur[i] = (cur[i] + a) & 0xff;
      else if (filter === 2) cur[i] = (cur[i] + b) & 0xff;
      else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) cur[i] = (cur[i] + paeth(a, b, c)) & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp;
      out[(y * w + x) * 4] = cur[s];
      out[(y * w + x) * 4 + 1] = cur[s + 1];
      out[(y * w + x) * 4 + 2] = cur[s + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { data: out, w, h };
}
function near(c, t, tol) { return Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol; }
function analyze(path, targets) {
  const buf = readFileSync(path);
  const { data, w, h } = decode(buf);
  const counts = Object.fromEntries(Object.keys(targets).map(k => [k, 0]));
  const runs = Object.fromEntries(Object.keys(targets).map(k => [k, null]));
  const tol = 12;
  for (let y = 0; y < h; y++) {
    const curRuns = Object.fromEntries(Object.keys(targets).map(k => [k, 0]));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = [data[i], data[i + 1], data[i + 2]];
      for (const k in targets) {
        if (near(px, targets[k], tol)) { counts[k]++; curRuns[k]++; runs[k] = Math.max(runs[k] || 0, curRuns[k]); }
        else curRuns[k] = 0;
      }
    }
  }
  return { counts, runs };
}

const files = readdirSync(DIR).filter(f => f.endsWith(".png")).sort();
const targets = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, v.hex.match(/[\da-f]{2}/gi).map(x => parseInt(x, 16))]));
console.log("targets:", JSON.stringify(Object.fromEntries(Object.entries(targets).map(([k, t]) => [k, t.join(",")]))));
for (const f of files) {
  const a = analyze(resolve(DIR, f), targets);
  const line = ["  " + f.padEnd(30)].concat(Object.keys(a.counts).map(k => `${k}=${String(a.counts[k]).padStart(6)} (run ${a.runs[k] ?? 0})`)).join("  ");
  console.log(line);
}