/* Scan live-app screenshots for the GIS outline colors (color-pixel counts). */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const ROOT = 'D:/Incuxai/Forest new';
const require = (await import('node:module')).createRequire(new URL(`file:///${ROOT.replace(/\\/g, '/')}/web/`));
const sharp = require('sharp');

const dir = resolve(ROOT, process.argv[2] ?? 'scripts/.liveshots');
const colors = {
  forest: [0x1b, 0x43, 0x32], range: [0x0e, 0x4c, 0x92], beat: [0xe6, 0x51, 0x00],
  block: [0x5b, 0x2c, 0x6f], comp: [0xb3, 0x26, 0x1e], bg: [0xe8, 0xea, 0xed],
};
for (const fn of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const { data, info } = await sharp(resolve(dir, fn)).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const px = (x, y) => { const i = (y * w + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const is = (c, [r, g, b], t = 7) => Math.abs(c[0] - r) <= t && Math.abs(c[1] - g) <= t && Math.abs(c[2] - b) <= t;
  const counts = {};
  for (const name of Object.keys(colors)) counts[name] = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    for (const [name, c] of Object.entries(colors)) if (is(c, px(x, y))) counts[name]++;
  }
  // longest horizontal run of the compartment red INSIDE the map canvas (x 260-1240)
  let maxCompRun = 0, zr = 0;
  for (let y = 180; y < 820; y++) { let run = 0; for (let x = 60; x < 1100; x++) { if (is(colors.comp, px(x, y))) { if (++run > maxCompRun) maxCompRun = run; } else run = 0; } }
  console.log(fn, JSON.stringify(counts), 'compMaxRunPx=' + maxCompRun, `${w}x${h}`);
}