import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { param, queryString } from '../lib/http';
import { HttpError } from '../middleware/error';
import { geometryForDb, type GGeometry } from '../lib/geo';
import { sha256Of } from '../services/storage';

export const mapRouter = Router();

mapRouter.use(requireAuth);

const ASSET_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// ================================================================ beats

interface BeatRow {
  id: string;
  name: string;
  section: string | null;
  rangeName: string | null;
  division: string | null;
  circle: string | null;
  district: string | null;
  areaHa: number | null;
  createdAt: Date;
  updatedAt: Date;
  geometry: unknown;
}

const beatBase = z.object({
  name: z.string().trim().min(1).max(160),
  section: z.string().trim().max(120).nullish(),
  rangeName: z.string().trim().max(120).nullish(),
  division: z.string().trim().max(120).nullish(),
  circle: z.string().trim().max(120).nullish(),
  district: z.string().trim().max(120).nullish(),
  areaHa: z.number().finite().positive().nullish(),
});

const beatCreateSchema = beatBase.extend({
  geometry: z.unknown().optional(),
});

const beatUpdateSchema = beatBase.partial().extend({
  geometry: z.unknown().optional(),
});

async function fetchBeat(id: string): Promise<BeatRow> {
  const rows = await prisma.$queryRaw<BeatRow[]>`
    SELECT id, name, section, "rangeName", division, circle, district, "areaHa",
           "createdAt", "updatedAt", ST_AsGeoJSON(geom)::json AS geometry
    FROM "Beat" WHERE id = ${id}
  `;
  if (rows.length === 0) throw new HttpError(404, 'not_found', 'Beat not found');
  return rows[0];
}

mapRouter.get('/beats', async (_req, res) => {
  const rows = await prisma.$queryRaw<BeatRow[]>`
    SELECT id, name, section, "rangeName", division, circle, district, "areaHa",
           "createdAt", "updatedAt", ST_AsGeoJSON(geom)::json AS geometry
    FROM "Beat" ORDER BY name
  `;
  res.json(rows);
});

mapRouter.post('/beats', requireAdmin, validateBody(beatCreateSchema), async (req, res) => {
  const body = req.body;
  const beat = await prisma.beat.create({
    data: {
      name: body.name,
      section: body.section ?? null,
      rangeName: body.rangeName ?? null,
      division: body.division ?? null,
      circle: body.circle ?? null,
      district: body.district ?? null,
      areaHa: body.areaHa ?? null,
    },
  });
  if (body.geometry != null) {
    const geometry: GGeometry = geometryForDb(body.geometry);
    await prisma.$executeRaw`
      UPDATE "Beat" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
      WHERE id = ${beat.id}
    `;
  }
  res.status(201).json(await fetchBeat(beat.id));
});

mapRouter.put('/beats/:id', requireAdmin, validateBody(beatUpdateSchema), async (req, res) => {
  const id = param(req, 'id');
  const body = req.body;
  const data: Record<string, unknown> = {};
  for (const key of ['name', 'section', 'rangeName', 'division', 'circle', 'district'] as const) {
    if (body[key] !== undefined) data[key] = body[key] ?? null;
  }
  if (body.areaHa !== undefined) data.areaHa = body.areaHa ?? null;

  await prisma.beat.update({ where: { id }, data });
  if (body.geometry != null) {
    const geometry: GGeometry = geometryForDb(body.geometry);
    await prisma.$executeRaw`
      UPDATE "Beat" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
      WHERE id = ${id}
    `;
  }
  res.json(await fetchBeat(id));
});

mapRouter.delete('/beats/:id', requireAdmin, async (req, res) => {
  await prisma.beat.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

const beatImportSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature').optional(),
      properties: z.record(z.string(), z.unknown()).default({}),
      geometry: z.unknown().refine((v) => v != null, { message: 'geometry is required' }),
    }),
  ),
});

function beatNameFrom(p: Record<string, unknown>): string | null {
  const raw = p['Beat'] ?? p['name'] ?? p['NAME'];
  const name = typeof raw === 'string' ? raw.trim() : null;
  return name && name.length > 0 ? name.toUpperCase() : null;
}

mapRouter.post('/beats/import', requireAdmin, validateBody(beatImportSchema), async (req, res) => {
  const features = req.body.features;
  const names = features
    .map((f: { properties: Record<string, unknown> }) => beatNameFrom(f.properties))
    .filter((n: string | null): n is string => n !== null);

  const created = await prisma.$transaction(async (tx) => {
    if (names.length > 0) await tx.beat.deleteMany({ where: { name: { in: names } } });
    let count = 0;
    for (const feature of features) {
      const name = beatNameFrom(feature.properties);
      if (!name) continue;
      const geometry: GGeometry = geometryForDb(feature.geometry);
      const p = feature.properties;
      const asText = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : null);
      const asFloat = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const beat = await tx.beat.create({
        data: {
          name,
          section: asText(p['Section']),
          rangeName: asText(p['Range']),
          division: asText(p['Division']),
          circle: asText(p['Circle']),
          district: asText(p['District']),
          areaHa: asFloat(p['Area_ha']),
        },
      });
      await tx.$executeRaw`
        UPDATE "Beat" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
        WHERE id = ${beat.id}
      `;
      count++;
    }
    return count;
  });

  res.status(201).json({ beatsCreated: created, strategy: 'replace-by-name' });
});

// ============================================================ compartments

interface CompartmentRow {
  id: string;
  compNo: string;
  areaHa: number | null;
  beatId: string | null;
  beatName: string | null;
  createdAt: Date;
  geometry: unknown;
}

const compCreateSchema = z.object({
  compNo: z.string().trim().min(1).max(64),
  areaHa: z.number().finite().positive().nullish(),
  beatId: z.string().cuid().nullish(),
  geometry: z.unknown().optional(),
});

const compUpdateSchema = compCreateSchema.partial();

async function fetchCompartment(id: string): Promise<CompartmentRow> {
  const rows = await prisma.$queryRaw<CompartmentRow[]>`
    SELECT c.id, c."compNo", c."areaHa", c."beatId", b.name AS "beatName", c."createdAt",
           ST_AsGeoJSON(c.geom)::json AS geometry
    FROM "Compartment" c LEFT JOIN "Beat" b ON b.id = c."beatId"
    WHERE c.id = ${id}
  `;
  if (rows.length === 0) throw new HttpError(404, 'not_found', 'Compartment not found');
  return rows[0];
}

mapRouter.get('/compartments', async (req, res) => {
  const beatId = queryString(req, 'beatId');
  const where = beatId ? Prisma.sql`WHERE c."beatId" = ${String(beatId)}` : Prisma.empty;
  const rows = await prisma.$queryRaw<CompartmentRow[]>`
    SELECT c.id, c."compNo", c."areaHa", c."beatId", b.name AS "beatName", c."createdAt",
           ST_AsGeoJSON(c.geom)::json AS geometry
    FROM "Compartment" c LEFT JOIN "Beat" b ON b.id = c."beatId"
    ${where}
    ORDER BY c."compNo"
  `;
  res.json(rows);
});

mapRouter.post('/compartments', requireAdmin, validateBody(compCreateSchema), async (req, res) => {
  const body = req.body;
  if (body.beatId != null) {
    const beat = await prisma.beat.findUnique({ where: { id: body.beatId } });
    if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
  }
  const comp = await prisma.compartment.create({
    data: {
      compNo: body.compNo,
      areaHa: body.areaHa ?? null,
      beatId: body.beatId ?? null,
    },
  });
  if (body.geometry != null) {
    const geometry: GGeometry = geometryForDb(body.geometry);
    await prisma.$executeRaw`
      UPDATE "Compartment" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
      WHERE id = ${comp.id}
    `;
  }
  res.status(201).json(await fetchCompartment(comp.id));
});

mapRouter.put('/compartments/:id', requireAdmin, validateBody(compUpdateSchema), async (req, res) => {
  const id = param(req, 'id');
  const body = req.body;
  if (body.beatId != null) {
    const beat = await prisma.beat.findUnique({ where: { id: body.beatId } });
    if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
  }
  const data: Record<string, unknown> = {};
  if (body.compNo !== undefined) data.compNo = body.compNo;
  if (body.areaHa !== undefined) data.areaHa = body.areaHa ?? null;
  if (body.beatId !== undefined) data.beatId = body.beatId ?? null;

  await prisma.compartment.update({ where: { id }, data });
  if (body.geometry != null) {
    const geometry: GGeometry = geometryForDb(body.geometry);
    await prisma.$executeRaw`
      UPDATE "Compartment" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
      WHERE id = ${id}
    `;
  }
  res.json(await fetchCompartment(id));
});

mapRouter.delete('/compartments/:id', requireAdmin, async (req, res) => {
  await prisma.compartment.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

const compImportSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature').optional(),
      properties: z.record(z.string(), z.unknown()).default({}),
      geometry: z.unknown().refine((v) => v != null, { message: 'geometry is required' }),
    }),
  ),
});

mapRouter.post('/compartments/import', requireAdmin, validateBody(compImportSchema), async (req, res) => {
  const { beatsCreated, compartmentsCreated } = await prisma.$transaction(async (tx) => {
    const beats = 0;
    let comps = 0;
    const beatCache = new Map<string, string>();
    const beatByName = async (name: string): Promise<string | null> => {
      if (beatCache.has(name)) return beatCache.get(name)!;
      const beat = await tx.beat.findFirst({ where: { name }, select: { id: true } });
      if (beat) beatCache.set(name, beat.id);
      return beat?.id ?? null;
    };

    await tx.compartment.deleteMany({});
    for (const feature of req.body.features) {
      const p = feature.properties;
      const asText = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : null);
      const asFloat = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const compNo = asText(p['COMP_NO']) ?? asText(p['compNo']);
      if (!compNo) continue;

      const beatName = asText(p['BEAT'])?.toUpperCase() ?? null;
      const beatId = beatName ? await beatByName(beatName) : null;
      const geometry: GGeometry = geometryForDb(feature.geometry);

      const comp = await tx.compartment.create({
        data: { compNo, areaHa: asFloat(p['AREA_HA']), beatId },
      });
      await tx.$executeRaw`
        UPDATE "Compartment" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
        WHERE id = ${comp.id}
      `;
      comps++;
    }
    return { beatsCreated: beats, compartmentsCreated: comps };
  });

  res.status(201).json({ beatsCreated, compartmentsCreated, strategy: 'replace-all' });
});

// ============================================================ patrol routes

interface RouteRow {
  id: string;
  name: string;
  patrolType: string | null;
  beatId: string | null;
  targetKm: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  geometry: unknown;
}

const routeCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  patrolType: z.string().trim().max(64).nullish(),
  beatId: z.string().cuid().nullish(),
  targetKm: z.number().finite().positive().nullish(),
  active: z.boolean().default(true),
  geometry: z.unknown().optional(),
});

const routeUpdateSchema = routeCreateSchema.partial();

async function fetchRoute(id: string): Promise<RouteRow> {
  const rows = await prisma.$queryRaw<RouteRow[]>`
    SELECT id, name, "patrolType", "beatId", "targetKm", active, "createdAt", "updatedAt",
           ST_AsGeoJSON(geom)::json AS geometry
    FROM "PatrolRoute" WHERE id = ${id}
  `;
  if (rows.length === 0) throw new HttpError(404, 'not_found', 'Patrol route not found');
  return rows[0];
}

mapRouter.get('/routes', async (req, res) => {
  const active = queryString(req, 'active');
  const where = active !== undefined ? Prisma.sql`WHERE active = ${active === 'true'}` : Prisma.empty;
  const rows = await prisma.$queryRaw<RouteRow[]>`
    SELECT id, name, "patrolType", "beatId", "targetKm", active, "createdAt", "updatedAt",
           ST_AsGeoJSON(geom)::json AS geometry
    FROM "PatrolRoute"
    ${where}
    ORDER BY name
  `;
  res.json(rows);
});

mapRouter.post('/routes', requireAdmin, validateBody(routeCreateSchema), async (req, res) => {
  const body = req.body;
  if (body.geometry == null) throw new HttpError(422, 'invalid_geometry', 'geometry is required for a route');
  if (body.beatId != null) {
    const beat = await prisma.beat.findUnique({ where: { id: body.beatId } });
    if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
  }
  const geometry: GGeometry = geometryForDb(body.geometry);
  const route = await prisma.patrolRoute.create({
    data: {
      name: body.name,
      patrolType: body.patrolType ?? null,
      beatId: body.beatId ?? null,
      targetKm: body.targetKm ?? null,
      active: body.active,
    },
  });
  await prisma.$executeRaw`
    UPDATE "PatrolRoute" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
    WHERE id = ${route.id}
  `;
  res.status(201).json(await fetchRoute(route.id));
});

mapRouter.put('/routes/:id', requireAdmin, validateBody(routeUpdateSchema), async (req, res) => {
  const id = param(req, 'id');
  const body = req.body;
  if (body.beatId != null) {
    const beat = await prisma.beat.findUnique({ where: { id: body.beatId } });
    if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
  }
  const data: Record<string, unknown> = {};
  for (const key of ['name', 'patrolType', 'beatId', 'targetKm', 'active'] as const) {
    if (body[key] !== undefined) data[key] = body[key] ?? null;
  }
  await prisma.patrolRoute.update({ where: { id }, data });
  if (body.geometry != null) {
    const geometry: GGeometry = geometryForDb(body.geometry);
    await prisma.$executeRaw`
      UPDATE "PatrolRoute" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
      WHERE id = ${id}
    `;
  }
  res.json(await fetchRoute(id));
});

mapRouter.delete('/routes/:id', requireAdmin, async (req, res) => {
  await prisma.patrolRoute.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

// ============================================================ map assets

const assetMeta = (a: { id: string; resourceKey: string; contentType: string; sizeBytes: number; sha256: string; version: number; createdAt: Date; updatedAt: Date }) => ({
  id: a.id,
  resourceKey: a.resourceKey,
  contentType: a.contentType,
  sizeBytes: a.sizeBytes,
  sha256: a.sha256,
  version: a.version,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

mapRouter.get('/assets', async (_req, res) => {
  const assets = await prisma.mapAsset.findMany({ orderBy: { resourceKey: 'asc' } });
  res.json(assets.map(assetMeta));
});

mapRouter.get('/assets/:resourceKey/meta', async (req, res) => {
  const resourceKey = param(req, 'resourceKey');
  if (!ASSET_KEY_PATTERN.test(resourceKey)) throw new HttpError(400, 'invalid_key', 'Invalid asset key');
  const asset = await prisma.mapAsset.findUnique({ where: { resourceKey } });
  if (!asset) throw new HttpError(404, 'not_found', 'Asset not found');
  res.json(assetMeta(asset));
});

mapRouter.post('/assets', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'validation_error', 'file field is required');
  const resourceKey = String(req.body.resourceKey ?? '');
  if (!ASSET_KEY_PATTERN.test(resourceKey)) throw new HttpError(400, 'invalid_key', 'Invalid resourceKey');

  const existing = await prisma.mapAsset.findUnique({ where: { resourceKey } });
  if (existing) throw new HttpError(409, 'conflict', 'An asset with that resourceKey already exists; use PUT to replace');

  const data = req.file.buffer;
  const contentType = guessContentType(resourceKey, req.file.mimetype);
  const asset = await prisma.mapAsset.create({
    data: {
      resourceKey,
      contentType,
      storagePath: null,
      sizeBytes: data.length,
      sha256: sha256Of(data),
      version: 1,
      data: new Uint8Array(data),
    },
  });
  res.status(201).json(assetMeta(asset));
});

mapRouter.put('/assets/:resourceKey', requireAdmin, upload.single('file'), async (req, res) => {
  const resourceKey = param(req, 'resourceKey');
  if (!ASSET_KEY_PATTERN.test(resourceKey)) throw new HttpError(400, 'invalid_key', 'Invalid asset key');
  if (!req.file) throw new HttpError(400, 'validation_error', 'file field is required');

  const existing = await prisma.mapAsset.findUnique({ where: { resourceKey } });
  if (!existing) throw new HttpError(404, 'not_found', 'Asset not found');

  const data = req.file.buffer;
  const sha256 = sha256Of(data);
  const version = existing.sha256 === sha256 ? existing.version : existing.version + 1;
  const asset = await prisma.mapAsset.update({
    where: { resourceKey },
    data: {
      contentType: guessContentType(resourceKey, req.file.mimetype),
      sizeBytes: data.length,
      sha256,
      version,
      data: new Uint8Array(data),
      storagePath: null,
    },
  });
  res.json(assetMeta(asset));
});

mapRouter.delete('/assets/:resourceKey', requireAdmin, async (req, res) => {
  const resourceKey = param(req, 'resourceKey');
  if (!ASSET_KEY_PATTERN.test(resourceKey)) throw new HttpError(400, 'invalid_key', 'Invalid asset key');
  await prisma.mapAsset.delete({ where: { resourceKey } });
  res.status(204).end();
});

function guessContentType(resourceKey: string, declared: string): string {
  if (resourceKey.endsWith('.mbtiles')) return 'application/vnd.mapbox-vector-tile';
  if (resourceKey.endsWith('.geojson') || resourceKey.endsWith('.json')) return 'application/geo+json';
  return declared || 'application/octet-stream';
}
