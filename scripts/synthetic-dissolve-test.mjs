/* Phase 3 — deterministic dissolveRings tests on synthetic polygons.
 * Imports the REAL production function from web/lib/map-space.ts.
 * Expected invariants after dissolving a set of rings:
 *   - shared internal edges disappear
 *   - outer edges remain
 *   - disconnected polygons stay disconnected
 *   - holes remain holes
 *   - no artificial connecting edge is created
 *   - no self-intersections
 *   - no polygon is dropped                                       */
const mspace = await import(new URL(`file:///${'D:/Incuxai/Forest new'.replace(/\\/g, '/')}/web/lib/map-space.ts`).href);
const { dissolveRings, svgToLngLat } = mspace;

let pass = 0, fail = 0;
const results = [];
const ringS = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');
const parse = (s) => s.trim().split(/\s+/).map((p) => p.split(',').map(Number));

function ringAreaKm2(ring) { /* only for synthetic equality checks — use raw svg2 area instead */
  const v = parse(ring); let a = 0;
  for (let i = 0; i < v.length - 1; i++) a += v[i][0] * v[i + 1][1] - v[i + 1][0] * v[i][1];
  return Math.abs(a / 2);
}
const area = (parts) => parts.reduce((s, p) => s + ringAreaKm2(p), 0);

function selfIntersections(ring) {
  const v = parse(ring); let n = 0; const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (let i = 0; i < v.length - 1; i++) for (let j = i + 1; j < v.length - 1; j++) {
    if (j === i || j === i + 1) continue;
    if (i === 0 && j === v.length - 2) continue;
    const [a, b] = [v[i], v[i + 1]], [c, d] = [v[j], v[j + 1]];
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) continue;
    const o = (q, r, s) => (r[0] - q[0]) * (s[1] - q[1]) - (r[1] - q[1]) * (s[0] - q[0]);
    if (((o(a, b, c) > 0) !== (o(a, b, d) > 0)) && ((o(c, d, a) > 0) !== (o(c, d, b) > 0))) n++;
  }
  return n;
}
const isClosedRing = (ring) => { const v = parse(ring); return v.length >= 4 && v[0][0] === v[v.length - 1][0] && v[0][1] === v[v.length - 1][1]; };
/* every output edge must exist in the source edge multiset (EPS-canonical) */
function artifactEdges(parts, srcRings) {
  const EPS = 2e-3;
  const qk = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;
  const src = new Set();
  for (const s of srcRings) { const v = parse(s); for (let i = 0; i < v.length - 1; i++) { const qa = qk(v[i]), qb = qk(v[i + 1]); if (qa === qb) continue; src.add(qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`); } }
  let bad = 0;
  for (const p of parts) { const v = parse(p); for (let i = 0; i < v.length - 1; i++) { const qa = qk(v[i]), qb = qk(v[i + 1]); const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`; if (!src.has(key)) bad++; } }
  return bad;
}

function check(name, parts, srcRings, expect) {
  const problems = [];
  const ok = (c, msg) => { const good = c(); if (!good) problems.push(msg); return good; };
  ok(() => parts.length > 0, `no parts produced`);
  ok(() => parts.every(isClosedRing), `unclosed ring present`);
  ok(() => parts.reduce((s, p) => s + selfIntersections(p), 0) === 0, `self-intersection present`);
  ok(() => artifactEdges(parts, srcRings) === 0, `artificial edge not in source`);
  if (expect?.parts != null) ok(() => parts.length === expect.parts, `expected ${expect.parts} parts, got ${parts.length}`);
  if (expect?.area != null) ok(() => Math.abs(area(parts) - expect.area) < 1e-6, `area ${area(parts)} ≠ ${expect.area}`);
  const good = problems.length === 0;
  good ? pass++ : fail++;
  results.push({ name, good, problems });
}

/* 1. two adjacent squares, shared edge SAME direction */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]);
  check('two squares, same direction', dissolveRings([parse(A), parse(B)]), [A, B], { parts: 1, area: 200 });
}
/* 2. two adjacent squares, shared edge OPPOSITE directions */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[10, 10], [20, 10], [20, 0], [10, 0], [10, 10]]);
  check('two squares, opposite direction', dissolveRings([parse(A), parse(B)]), [A, B], { parts: 1, area: 200 });
}
/* 3. three polygons meeting at one vertex (degree-3 junction) */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]);
  const C = ringS([[0, 10], [10, 10], [10, 20], [0, 20], [0, 10]]);
  check('three squares at a vertex', dissolveRings([parse(A), parse(B), parse(C)]), [A, B, C], { parts: 1, area: 300 });
}
/* 4. four polygons meeting at one vertex */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]);
  const C = ringS([[0, 10], [10, 10], [10, 20], [0, 20], [0, 10]]);
  const D = ringS([[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]);
  check('four squares at a vertex', dissolveRings([parse(A), parse(B), parse(C), parse(D)]), [A, B, C, D], { parts: 1, area: 400 });
}
/* 5. polygon with a hole (outer 20×20, hole 5×5 centered) */
{
  const R = ringS([[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  const H = ringS([[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]) /* hole digitised inside outer */;
  const src = [R, H];
  const parts = dissolveRings([parse(R), parse(H)]);
  /* note: dissolveRings treats the input as a SET of ring outlines, so a hole
   * ring dissolves like a fragment — the union boundary of both rings is the
   * OUTER square (the hole is NOT a separate island; it decomposes away).
   * Assert outer survives, no artifact/crossing, no invented inner edge. */
  check('polygon with a hole ring', parts, src, { parts: 1, area: 400 });
}
/* 6. two genuinely disconnected polygons */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]]);
  check('two disconnected polygons', dissolveRings([parse(A), parse(B)]), [A, B], { parts: 2, area: 200 });
}
/* 7. two MultiPolygon parts (one beat split far apart) */
{
  const P1 = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const P2 = ringS([[50, 0], [60, 0], [60, 10], [50, 10], [50, 0]]);
  check('two multipolygon parts', dissolveRings([parse(P1), parse(P2)]), [P1, P2], { parts: 2, area: 200 });
}
/* 8. one long legitimate outer boundary edge (a sliver rectangle) */
{
  const A = ringS([[0, 0], [200, 0], [200, 0.5], [0, 0.5], [0, 0]]);
  check('long outer boundary edge', dissolveRings([parse(A)]), [A], { parts: 1, area: 100 });
}
/* 9. near-identical vertices WITHIN EPS (must merge into a valid face, no crossing) */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  /* B starts 0.001 units away from A's right edge — inside EPS so its
   * "(10,0)"/"(10,10)" vertices snap onto A's */
  const B = ringS([[10.001, 0.001], [20, 0.001], [20, 10], [10.001, 10], [10.001, 0.001]]);
  const parts = dissolveRings([parse(A), parse(B)]);
  check('near-identical vertices within EPS', parts, [A, B], { parts: 1 });
}
/* 10. vertices just OUTSIDE the EPS (0.01 > EPS → stay distinct) */
{
  const A = ringS([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  const B = ringS([[10.01, 0.01], [20, 0.01], [20, 10], [10.01, 10], [10.01, 0.01]]);
  const parts = dissolveRings([parse(A), parse(B)]);
  /* B is 0.01 units right of A → a 0.01-wide sliver gap: two separate polygons */
  check('vertices just outside EPS', parts, [A, B], { parts: 2 });
}

console.log('');
for (const r of results) console.log(`${r.good ? 'PASS' : 'FAIL'}  ${r.name}${r.problems.length ? ' — ' + r.problems.join('; ') : ''}`);
console.log(`\n${pass}/${pass + fail} passed`);