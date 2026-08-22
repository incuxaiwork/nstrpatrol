import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { patrolAnalytics, incidentAnalytics, healthAnalytics } from '../services/analytics';

/**
 * Work Analytics endpoints — server-side aggregations over real backend rows.
 *
 * Authorization: requireAuth + the same user-scope resolution as every other
 * list route. No separate analytics authorization layer.
 */

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const patrolsQuerySchema = rangeSchema.extend({
  groupBy: z.enum(['day', 'user']).optional(),
});

const incidentsQuerySchema = rangeSchema.extend({
  type: z.string().min(1).max(50).optional(),
  severity: z.string().min(1).max(20).optional(),
  status: z.string().min(1).max(20).optional(),
});

analyticsRouter.get('/patrols', validateQuery(patrolsQuerySchema), async (req, res) => {
  const q = patrolsQuerySchema.parse(req.query);
  const result = await patrolAnalytics(req.user!, { from: q.from, to: q.to });
  res.json(result);
});

analyticsRouter.get('/incidents', validateQuery(incidentsQuerySchema), async (req, res) => {
  const q = incidentsQuerySchema.parse(req.query);
  const result = await incidentAnalytics(
    req.user!,
    { from: q.from, to: q.to },
    { type: q.type, severity: q.severity, status: q.status },
  );
  res.json(result);
});

analyticsRouter.get('/health', validateQuery(rangeSchema), async (req, res) => {
  const q = rangeSchema.parse(req.query);
  const result = await healthAnalytics(req.user!, { from: q.from, to: q.to });
  res.json(result);
});