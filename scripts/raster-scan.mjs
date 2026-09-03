/* Raster scan of the render proof: find long straight runs of the FOREST
 * green / RANGE blue outline colors. A genuine artificial chord would show
 * as a very long (>200px) straight color run crossing the interior. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const ROOT = 'D:/Incuxai/Forest new';
const createRequire = (await import('node:module')).createRequire;
const require = createRequire(new URL(`file:///${ROOT.replace(/\\/g, '/')}/web/`));
const sharp = require('sharp');

const FN = 'scripts/gis-audit-render.png';
const img = sharp(FN).raw().toBuffer({ resolveWithObject: true });
const { data, info } = await img;
const { width: w, height: h, channels: ch } = info;
console.log(`image ${w}x${h} ch=${ch}`);

const colors = { forest: [0x1b, 0x43, 0x32], range: [0x0e, 0x4c, 0x92], beat: [0xe6, 0x51, 0x00] };
function px(x, y) { const i = (y * w + x) * ch; return [data[i], data[i + 1], data[i + 2]]; }
function isColor(c, [r, g, b], tol = 4) { return Math.abs(c[0] - r) <= tol && Math.abs(c[1] - g) <= tol && Math.abs(c[2] - b) <= tol; }

/* longest horizontal and vertical run of each color, inside the central band
 * (x 200–800, y 200–500) to catch interior crossing lines */
for (const [name, c] of Object.entries(colors)) {
  let maxH = 0, maxV = 0; let hInfo = null, vInfo = null;
  for (let y = 200; y < 500; y++) {
    let run = 0;
    for (let x = 100; x < 900; x++) {
      if (isColor(c, px(x, y))) { run++; if (run > maxH) { maxH = run; hInfo = [x - run + 1, y]; } }
      else run = 0;
    }
  }
  for (let x = 200; x < 800; x++) {
    let run = 0;
    for (let y = 50; y < 650; y++) {
      if (isColor(c, px(x, y))) { run++; if (run > maxV) { maxV = run; vInfo = [x, y - run + 1]; } }
      else run = 0;
    }
  }
  console.log(`${name}: longest horizontal run=${maxH}px at x=${hInfo?.[0]},y=${hInfo?.[1]} | longest vertical run=${maxV}px at x=${vInfo?.[0]},y=${vInfo?.[1]}`);
}