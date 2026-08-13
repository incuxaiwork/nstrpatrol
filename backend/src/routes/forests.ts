import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { param } from '../lib/http';
import { HttpError } from '../middleware/error';
import { geometryForDb, type GGeometry } from '../lib/geo';

export const forestsRouter = Router();

forestsRouter.use(requireAuth);

const forestCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(32),
  description: z.string().trim().max(500).nullish(),
});

const forestUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullish(),
});

forestsRouter.get('/', async (_req, res) => {
  const forests = await prisma.forest.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { boundaries: true, grids: true } } },
  });
  res.json(forests);
});

forestsRouter.post('/', requireAdmin, validateBody(forestCreateSchema), async (req, res) => {
  const { name, code, description } = req.body;
  const existing = await prisma.forest.findUnique({ where: { code } });
  if (existing) throw new HttpError(409, 'conflict', 'A forest with that code already exists');
  const forest = await prisma.forest.create({ data: { name, code, description: description ?? null } });
  res.status(201).json(forest);
});

forestsRouter.patch('/:id', requireAdmin, validateBody(forestUpdateSchema), async (req, res) => {
  const id = param(req, 'id');
  const data: Record<string, unknown> = {};
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.description !== undefined) data.description = req.body.description ?? null;
  const forest = await prisma.forest.update({ where: { id }, data });
  res.json(forest);
});

async function ensureForest(id: string): Promise<void> {
  const exists = await prisma.forest.findUnique({ where: { id } });
  if (!exists) throw new HttpError(404, 'not_found', 'Forest not found');
}

// ------------------------------------------------ boundaries

forestsRouter.get('/:id/boundaries', async (req, res) => {
  await ensureForest(param(req, 'id'));
  const rows = await prisma.$queryRaw<
    { id: string; name: string; geometry: unknown }[]
  >`
    SELECT id, name, ST_AsGeoJSON(geom)::json AS geometry
    FROM "ForestBoundary"
    WHERE "forestId" = ${param(req, 'id')} AND geom IS NOT NULL
  `;
  res.json({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      id: r.id,
      geometry: r.geometry,
      properties: { id: r.id, name: r.name },
    })),
  });
});

const boundarySchema = z.object({
  name: z.string().trim().min(1).max(160),
  geometry: z.unknown().refine((v) => v != null, { message: 'geometry is required' }),
});

forestsRouter.post('/:id/boundaries', requireAdmin, validateBody(boundarySchema), async (req, res) => {
  await ensureForest(param(req, 'id'));
  const geometry: GGeometry = geometryForDb(req.body.geometry);
  const boundary = await prisma.forestBoundary.create({
    data: { forestId: param(req, 'id'), name: req.body.name },
  });
  await prisma.$executeRaw`
    UPDATE "ForestBoundary"
    SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
    WHERE id = ${boundary.id}
  `;
  const row = await prisma.$queryRaw<{ id: string; name: string; geometry: unknown }[]>`
    SELECT id, name, ST_AsGeoJSON(geom)::json AS geometry
    FROM "ForestBoundary" WHERE id = ${boundary.id}
  `;
  res.status(201).json({
    type: 'Feature',
    id: row[0].id,
    geometry: row[0].geometry,
    properties: { id: row[0].id, name: row[0].name },
  });
});

forestsRouter.delete('/:id/boundaries/:boundaryId', requireAdmin, async (req, res) => {
  await ensureForest(param(req, 'id'));
  const deleted = await prisma.forestBoundary.deleteMany({
    where: { id: param(req, 'boundaryId'), forestId: param(req, 'id') },
  });
  if (deleted.count === 0) throw new HttpError(404, 'not_found', 'Boundary not found');
  res.status(204).end();
});

// ------------------------------------------------ grids

forestsRouter.get('/:id/grids', async (req, res) => {
  await ensureForest(param(req, 'id'));
  const rows = await prisma.$queryRaw<
    { id: string; gridCode: string; geometry: unknown }[]
  >`
    SELECT id, "gridCode", ST_AsGeoJSON(geom)::json AS geometry
    FROM "ForestGrid"
    WHERE "forestId" = ${param(req, 'id')} AND geom IS NOT NULL
  `;
  res.json({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      id: r.id,
      geometry: r.geometry,
      properties: { id: r.id, gridCode: r.gridCode },
    })),
  });
});

const gridSchema = z.object({
  gridCode: z.string().trim().min(1).max(64),
  geometry: z.unknown().refine((v) => v != null, { message: 'geometry is required' }),
});

forestsRouter.post('/:id/grids', requireAdmin, validateBody(gridSchema), async (req, res) => {
  await ensureForest(param(req, 'id'));
  const geometry: GGeometry = geometryForDb(req.body.geometry);
  const grid = await prisma.forestGrid.create({
    data: { forestId: param(req, 'id'), gridCode: req.body.gridCode },
  });
  await prisma.$executeRaw`
    UPDATE "ForestGrid"
    SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
    WHERE id = ${grid.id}
  `;
  const row = await prisma.$queryRaw<{ id: string; gridCode: string; geometry: unknown }[]>`
    SELECT id, "gridCode", ST_AsGeoJSON(geom)::json AS geometry
    FROM "ForestGrid" WHERE id = ${grid.id}
  `;
  res.status(201).json({
    type: 'Feature',
    id: row[0].id,
    geometry: row[0].geometry,
    properties: { id: row[0].id, gridCode: row[0].gridCode },
  });
});

forestsRouter.delete('/:id/grids/:gridId', requireAdmin, async (req, res) => {
  await ensureForest(param(req, 'id'));
  const deleted = await prisma.forestGrid.deleteMany({
    where: { id: param(req, 'gridId'), forestId: param(req, 'id') },
  });
  if (deleted.count === 0) throw new HttpError(404, 'not_found', 'Grid not found');
  res.status(204).end();
});
