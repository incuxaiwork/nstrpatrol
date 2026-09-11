import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { resolve } from "node:path";

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let pos = 8, width = 0, height = 0, ct = 6, bitDepth = 8, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if ((ct !== 6 && ct !== 2) || bitDepth !== 8) throw new Error(`unsupported color ${ct}/${bitDepth}`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3, stride = width * bpp;
  const dec = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? dec[y * stride + x - bpp] : 0;
      const b = y ? dec[(y - 1) * stride + x] : 0;
      const cc = y && x >= bpp ? dec[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += (a + b - cc + ((a > b ? a : b) + ((a > b ? b : a) >> 1)) >> 1);
      dec[y * stride + x] = v & 255;
    }
  }
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * bpp, dst = (y * width + x) * 4;
    for (let k = 0; k < 3; k++) px[dst + k] = dec[src + k];
    px[dst + 3] = ct === 6 ? dec[src + 3] : 255;
  }
  return { width, height, px };
}

const [src, out, x0, y0, w, h] = [process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7]].map((v, i) => i < 2 ? v : Number(v));
const { width, height, px } = decode(readFileSync(resolve(src)));
const x1 = Math.min(x0 + w, width), y1 = Math.min(y0 + h, height);
const cw = x1 - x0, ch = y1 - y0;

const chunks = [];
const writeChunk = (type, data) => {
  const c = Buffer.alloc(12 + data.length);
  c.writeUInt32BE(data.length, 0);
  c.write(type, 4, "ascii");
  data.copy(c, 8);
  c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  chunks.push(c);
};
function crc32(b) { let c, t = new Int32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } let r = -1; for (let i = 0; i < b.length; i++) r = t[(r ^ b[i]) & 255] ^ (r >>> 8); return (r ^ -1) >>> 0; }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(cw, 0); ihdr.writeUInt32BE(ch, 4); ihdr[8] = 8; ihdr[9] = 6;
writeChunk("IHDR", ihdr);
const stride = cw * 4, raw = Buffer.alloc(ch * (stride + 1));
for (let y = 0; y < ch; y++) {
  raw[y * (stride + 1)] = 0;
  for (let x = 0; x < cw; x++) {
    const si = ((y + y0) * width + (x0 + x)) * 4, di = y * (stride + 1) + 1 + x * 4;
    for (let k = 0; k < 4; k++) raw[di + k] = px[si + k];
  }
}
writeChunk("IDAT", deflateSync(raw));
writeChunk("IEND", Buffer.alloc(0));
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
writeFileSync(resolve(out), Buffer.concat([sig, ...chunks]));
console.log(`cropped ${cw}x${ch} -> ${out}`);