/* Diff two same-viewport screenshots; report how many pixels changed (>tol) and where. */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";

function decode(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  const ctype = buf[25];
  if (ctype !== 6 && ctype !== 2) throw new Error("ctype " + ctype);
  let off = 8, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let pos = 0; let prev = Buffer.alloc(stride);
  const paeth = (a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for (let y=0;y<h;y++){const f=raw[pos++];const line=raw.subarray(pos,pos+stride);pos+=stride;const cur=Buffer.from(line);
    for(let i=0;i<stride;i++){const a=i>=bpp?cur[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;
      if(f===1)cur[i]=(cur[i]+a)&0xff;else if(f===2)cur[i]=(cur[i]+b)&0xff;else if(f===3)cur[i]=(cur[i]+((a+b)>>1))&0xff;else if(f===4)cur[i]=(cur[i]+paeth(a,b,c))&0xff;}
    for(let x=0;x<w;x++){const s=x*bpp;out[(y*w+x)*4]=cur[s];out[(y*w+x)*4+1]=cur[s+1];out[(y*w+x)*4+2]=cur[s+2];out[(y*w+x)*4+3]=bpp===4?cur[s+3]:255;}
    prev=cur;}
  return { data: out, w, h };
}

const [a, b] = process.argv.slice(2).map(f => decode(readFileSync(resolve(f))));
if (a.w !== b.w || a.h !== b.h) throw new Error("size mismatch");
const tol = 14;
let changed = 0, xmin = 1e9, ymin = 1e9, xmax = -1, ymax = -1;
const hist = {};
for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
  const i = (y * a.w + x) * 4;
  const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]);
  if (d > tol) {
    const k = Math.round((a.data[i]+b.data[i])/2/16)*16 + "," + Math.round((a.data[i+1]+b.data[i+1])/2/16)*16 + "," + Math.round((a.data[i+2]+b.data[i+2])/2/16)*16;
    hist[k] = (hist[k] || 0) + 1;
    changed++; xmin = Math.min(xmin,x); ymin = Math.min(ymin,y); xmax = Math.max(xmax,x); ymax = Math.max(ymax,y);
  }
}
console.log(`changed px: ${changed}  bbox x[${xmin}..${xmax}] y[${ymin}..${ymax}]`);
console.log("dominant change colors (avg16):");
Object.entries(hist).sort((p,q)=>q[1]-p[1]).slice(0,10).forEach(([k,v]) => console.log(`  ${k}  x${v}`));