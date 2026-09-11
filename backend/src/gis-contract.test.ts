import request from 'supertest';
import { createApp } from '../src/app';
import { canonicalBlock, blockKind } from '../src/gis/block-registry';

jest.mock('../src/lib/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({ sub: 'me', role: 'ADMIN' })),
  signAccessToken: jest.fn(() => 'signed-token'),
  generateRefreshToken: jest.fn(() => ({ token: 'rt', hash: 'rh' })),
  hashRefreshToken: jest.fn(() => 'rh'),
  generateVerificationDigest: jest.fn(() => 'digest'),
}));

jest.mock('../src/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    range: { findUnique: jest.fn(), findMany: jest.fn() },
    beat: { findUnique: jest.fn(), findMany: jest.fn() },
    mapAsset: { findMany: jest.fn(), findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../src/db/prisma') as {
  prisma: { $queryRaw: jest.Mock };
};

const app = createApp();

/** DB beat row shape the /api/gis serializers read. */
function beatRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'beat-1',
    name: 'TUMMURUKOTA',
    rangeName: 'V.P.SOUTH',
    section: 'V.P.SOUTH',
    division: 'DD MARKAPUR',
    circle: 'PT Circle',
    district: 'PALNADU',
    areaHa: 1023,
    compCount: 3,
    userCount: 0,
    ...over,
  };
}

function compRow(over: Partial<Record<string, unknown>> = {}) {
  return { id: 'comp-1', compNo: '88', beatId: 'beat-1', areaHa: 793.86, ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/gis/compartments (non-PostGIS asset fallback)', () => {
  it('preserves the mobile mark_comp.json property set when PostGIS is unavailable', async () => {
    // PostGIS path unavailable → fallback serializes the bundled asset
    // geometry, joined to DB Compartment/Beat primary keys.
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('postgis unavailable'))
      .mockResolvedValueOnce([beatRow()])
      .mockResolvedValueOnce([compRow()]);

    const res = await request(app).get('/api/gis/compartments');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');

    const comp = res.body.features.find((f: { properties?: Record<string, unknown> }) =>
      f.properties?.COMP_NO === '88'
    );
    expect(comp).toBeDefined();
    expect(comp.properties).toEqual({
      OBJECTID_1: 'comp-1',
      COMP_NO: '88',
      BEAT: 'TUMMURUKOTA',
      // Facing attribute survives the fallback: the DB column is empty on this
      // deployment, so the marker's own BLOCK value (canonicalized) is served.
      BLOCK: 'TUMURUKOTA BLOCK-4',
      SECTION: 'V.P.SOUTH',
      RANGE: 'V.P.SOUTH',
      DIVISION: 'DD MARKAPUR',
      CIRCLE: 'PT Circle',
      DISTRICT: 'PALNADU',
      AREA_HA: 793.86,
    });
  });
});

describe('GET /api/gis/beats (non-PostGIS asset fallback)', () => {
  it('keeps feature id = Beat primary key and the mobile property shape', async () => {
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('postgis unavailable'))
      .mockResolvedValueOnce([beatRow()]);

    const res = await request(app).get('/api/gis/beats');
    expect(res.status).toBe(200);
    const beat = res.body.features.find((f: { properties?: Record<string, unknown> }) =>
      f.properties?.Beat === 'TUMMURUKOTA'
    );
    expect(beat).toBeDefined();
    expect(beat.id).toBe('beat-1');
    expect(beat.properties).toEqual({
      OBJECTID_1: 'beat-1',
      Beat: 'TUMMURUKOTA',
      Section: 'V.P.SOUTH',
      Range: 'V.P.SOUTH',
      Division: 'DD MARKAPUR',
      Circle: 'PT Circle',
      District: 'PALNADU',
      Area_ha: 1023,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Facing logic — canonical block naming (see src/gis/block-registry.ts)
 * ------------------------------------------------------------------ */

/**
 * The complete raw BLOCK → canonical block mapping for the shipped survey
 * (mobile/app/src/main/assets/mark_comp.json, 448 compartments). This table
 * PINNED HERE is the auditable Facing decision set: it fixes the spelling
 * variants of the Eastern-Nagaram series and preserves native block names.
 * `xN` annotations are the raw-occurrence counts in the survey.
 */
const FACING_TABLE: [string, string][] = [
  ['CUMBUM', 'CUMBUM'], // x71
  ['MARKAPUR', 'MARKAPUR'], // x170
  ['Markapur', 'MARKAPUR'], // x1
  ['GANAPAVARAM', 'GANAPAVARAM'], // x13
  ['Y.PALEM', 'Y.PALEM'], // x8
  ['KANDLAGUNTA', 'KANDLAGUNTA'], // x5
  ['PASUVEMULA', 'PASUVEMULA'], // x4
  ['GANGALAGUNTA', 'GANGALAGUNTA'], // x3
  ['MUTUKURU', 'MUTUKURU'], // x3
  ['KONDLAGUNTA', 'KONDLAGUNTA'], // x2
  ['Pasuvemula RF', 'PASUVEMULA RF'], // x2
  ['PALUVAYE', 'PALUVAYE'], // x1
  ['TUMURUKOTA', 'TUMURUKOTA'], // x1
  ['TUMURUKOTA BLOCK-4', 'TUMURUKOTA BLOCK-4'], // x1
  ['G.V.Palli-1_RF', 'G.V.PALLI-1 RF'], // x1
  ['G.V.Palli-2_RF', 'G.V.PALLI-2 RF'], // x1
  // Eastern-Nagaram series — every recognized spelling of one numeral
  // collapses into its single organized block:
  ['E.N. BLOCK  VI', 'E.N. BLOCK VI'], // x3
  ['E.N.BLOCK VI', 'E.N. BLOCK VI'], // x3
  ['E.N. BLOCK VI', 'E.N. BLOCK VI'], // x1
  ['E.N.B VI', 'E.N. BLOCK VI'], // x1
  ['E.N.BLOCK VI B', 'E.N. BLOCK VI B'], // x1
  ['ENB-VI - ( D )', 'E.N. BLOCK VI D'], // x1
  ['ENB-VI - ( E )', 'E.N. BLOCK VI E'], // x1
  ['E.N. BLOCK  VI C', 'E.N. BLOCK VI C'], // x1
  ['ENB-XIII', 'E.N. BLOCK XIII'], // x3
  ['E.N.B XIII', 'E.N. BLOCK XIII'], // x2
  ['E.N.B. IV', 'E.N. BLOCK IV'], // x20
  ['E.N.B IV', 'E.N. BLOCK IV'], // x4
  ['ENB-IV-Extension-II', 'E.N. BLOCK IV Extension-II'], // x1
  ['ENB-IV-Extension-III', 'E.N. BLOCK IV Extension-III'], // x1
  ['ENB-IV-Extension-IV', 'E.N. BLOCK IV Extension-IV'], // x1
  ['ENB-IV, Extension-I', 'E.N. BLOCK IV Extension-I'], // x1
  ['E.N.B.II', 'E.N. BLOCK II'], // x4
  ['E.N.B III', 'E.N. BLOCK III'], // x12
  ['E.N. BLOCK III', 'E.N. BLOCK III'], // x1
  ['E.N.B V', 'E.N. BLOCK V'], // x8
  ['E.N.B.V', 'E.N. BLOCK V'], // x1
  ['ENB-V Extension-I', 'E.N. BLOCK V Extension-I'], // x1
  ['E.N.B VII', 'E.N. BLOCK VII'], // x3
  ['E.N. BLOCK VII', 'E.N. BLOCK VII'], // x2
  ['ENB- VII - A', 'E.N. BLOCK VII A'], // x1
  ['E.N. BLOCK VIII', 'E.N. BLOCK VIII'], // x2
  ['E.N. BLOCK IX', 'E.N. BLOCK IX'], // x2
  ['E.N. BLOCK X', 'E.N. BLOCK X'], // x4
  ['E.N. BLOCK XI', 'E.N. BLOCK XI'], // x2
  ['E.N.B XII', 'E.N. BLOCK XII'], // x1
  ['E.N.B.XII', 'E.N. BLOCK XII'], // x1
  ['ENB-XII', 'E.N. BLOCK XII'], // x1
  ['E.N. BLOCK XII', 'E.N. BLOCK XII'], // x1
  ['E.N. BLOCK XIV', 'E.N. BLOCK XIV'], // x3
  // The fence-work pockets keep their own block, never dissolved into the
  // surrounding block's outline:
  ['ENCLOSURE', 'ENCLOSURE'], // x66
];

test('Facing logic maps every surveyed BLOCK spelling to its canonical block', () => {
  // No two distinct source spellings may collide onto the same canonical
  // name unless they are the *same* raw block spelled differently.
  for (const [raw, expected] of FACING_TABLE) {
    expect(canonicalBlock(raw)).toBe(expected);
  }
});

test('Facing logic classifies canonical names into the expected kinds', () => {
  expect(blockKind('E.N. BLOCK IV')).toBe('eastern-nagaram');
  expect(blockKind('ENCLOSURE')).toBe('enclosure');
  expect(blockKind('CUMBUM')).toBe('native');
  expect(canonicalBlock('')).toBe('');
});

test('Facing logic preserves unknown spellings instead of inventing a block', () => {
  // Safety rule: an unrecognized name must never be silently merged.
  const unknown = 'MYSTERY';
  expect(canonicalBlock(unknown)).toBe('MYSTERY');
});

describe('GET /api/gis/blocks (non-PostGIS asset fallback)', () => {
  it('dissolves compartments into blocks by canonical BLOCK, ENCLOSURE kept separate', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('postgis unavailable'));

    const res = await request(app).get('/api/gis/blocks');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBeGreaterThan(20);

    const byName = new Map<string, { count: number; area: number; isMulti: boolean }>();
    for (const f of res.body.features) {
      const prev = byName.get(f.properties.BLOCK) ?? { count: 0, area: 0, isMulti: true };
      prev.count += 1;
      prev.area += Number(f.properties.AREA_HA);
      prev.isMulti = prev.isMulti && f.geometry.type === 'MultiPolygon';
      byName.set(f.properties.BLOCK, prev);
    }

    // Every raw spelling-collapsed family appears exactly ONCE.
    expect(byName.get('E.N. BLOCK IV')?.count).toBe(1);
    expect(byName.get('E.N. BLOCK VI')?.count).toBe(1);
    // The enclosure network is its own block (never merged into CUMBUM etc.).
    expect(byName.get('ENCLOSURE')?.count).toBe(1);
    expect(byName.get('MARKAPUR')?.count).toBe(1);
  });

  it('keeps each block MultiPolygon-safe with compartment-count + area properties', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('postgis unavailable'));

    const res = await request(app).get('/api/gis/blocks');
    const block = res.body.features.find((f: { properties?: Record<string, unknown> }) =>
      f.properties?.BLOCK === 'CUMBUM'
    );
    expect(block).toBeDefined();
    expect(block.id).toBe('block-CUMBUM');
    expect(block.geometry.type).toBe('MultiPolygon');
    expect(Number(block.properties.COMPARTMENT_COUNT)).toBeGreaterThanOrEqual(1);
    expect(Number(block.properties.AREA_HA)).toBeGreaterThan(0);
  });
});