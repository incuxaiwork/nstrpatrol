import { z } from 'zod';

export type GeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';

export type GPoint = { type: 'Point'; coordinates: [number, number] };
export type GMultiPoint = { type: 'MultiPoint'; coordinates: [number, number][] };
export type GLineString = { type: 'LineString'; coordinates: [number, number][] };
export type GMultiLineString = { type: 'MultiLineString'; coordinates: [number, number][][] };
export type GPolygon = { type: 'Polygon'; coordinates: [number, number][][] };
export type GMultiPolygon = { type: 'MultiPolygon'; coordinates: [number, number][][][] };

export type GGeometry = GPoint | GMultiPoint | GLineString | GMultiLineString | GPolygon | GMultiPolygon;

const position = z
  .array(z.number())
  .length(2)
  .refine(([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, {
    message: 'coordinate out of range',
  });

const positions = z.array(position);

const ring = z
  .array(position)
  .min(4)
  .refine(
    (coords) => coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1],
    { message: 'linear ring must be closed' },
  );

const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: position }).strict(),
  z.object({ type: z.literal('MultiPoint'), coordinates: positions }).strict(),
  z.object({ type: z.literal('LineString'), coordinates: positions.min(2) }).strict(),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(positions.min(2)) }).strict(),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }).strict(),
]);

/**
 * Validates a GeoJSON geometry (RFC 7946, [lon,lat], WGS84). Throws
 * GeoValidationError whose message is surfaced as 422 by the error middleware.
 */
export class GeoValidationError extends Error {}

export function validateGeometry(input: unknown): GGeometry {
  const result = geometrySchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new GeoValidationError(
      first ? `${first.path.join('.') || 'geometry'}: ${first.message}` : 'invalid geometry',
    );
  }
  return result.data as GGeometry;
}

export function isValidGeometry(input: unknown): input is GGeometry {
  return geometrySchema.safeParse(input).success;
}

export function geometryForDb(geom: unknown): GGeometry {
  return validateGeometry(geom);
}

export function toGeoJSONPoint(lon: number, lat: number): GPoint {
  return { type: 'Point', coordinates: [lon, lat] };
}

/**
 * Parses a GeoJSON Feature or bare geometry into a validated geometry.
 * Returns null when the input is null/undefined (meaning "leave unchanged").
 */
export function geometryFromFeature(input: unknown): GGeometry | null {
  if (input == null) return null;
  if (typeof input === 'object' && (input as { type?: string }).type === 'Feature') {
    const feature = input as { geometry: unknown };
    return validateGeometry(feature.geometry);
  }
  return validateGeometry(input);
}

export function polygonBBox(
  geom: unknown,
): { minLon: number; minLat: number; maxLon: number; maxLat: number } | null {
  const parsed = geometrySchema.safeParse(geom);
  if (!parsed.success) return null;
  let coords: number[][] = [];
  switch (parsed.data.type) {
    case 'Point':
      coords = [parsed.data.coordinates];
      break;
    case 'MultiPoint':
      coords = parsed.data.coordinates;
      break;
    case 'LineString':
      coords = parsed.data.coordinates;
      break;
    case 'MultiLineString':
      coords = parsed.data.coordinates.flat();
      break;
    case 'Polygon':
      coords = parsed.data.coordinates.flat();
      break;
    case 'MultiPolygon':
      coords = parsed.data.coordinates.flat(2);
      break;
  }
  if (coords.length === 0) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
}
