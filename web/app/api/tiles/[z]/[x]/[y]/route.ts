/**
 * Raster tile proxy for the MapLibre GL web map.
 *
 * Browsers cannot read MBTiles (SQLite) directly, so the portal serves the
 * NSTR atlas tiles itself — the web counterpart of the Android app's embedded
 * MbtilesServer (mobile/.../data/map/MbtilesServer.kt). The atlas is
 * downloaded once from the backend GIS asset API (`/api/gis/assets/NSTR.mbtiles`)
 * and cached under web/.data; tiles are served with the same TMS Y-flip.
 */

import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type SqlJsDatabase } from "sql.js";

export const runtime = "nodejs";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ATLAS_PATH = path.join(process.cwd(), ".data", "NSTR.mbtiles");
const ATLAS_KEY = "NSTR.mbtiles";
const MAX_Z = 16;

let dbPromise: Promise<SqlJsDatabase> | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!fs.existsSync(ATLAS_PATH)) {
        fs.mkdirSync(path.dirname(ATLAS_PATH), { recursive: true });
        const res = await fetch(`${API_BASE}/api/gis/assets/${ATLAS_KEY}`);
        if (!res.ok) throw new Error(`Atlas download failed: HTTP ${res.status}`);
        fs.writeFileSync(ATLAS_PATH, Buffer.from(await res.arrayBuffer()));
      }
      const SQL = await initSqlJs();
      return new SQL.Database(fs.readFileSync(ATLAS_PATH));
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ z: string; x: string; y: string }> }
): Promise<Response> {
  const { z, x, y } = await ctx.params;
  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(y);
  const limit = 1 << zi;
  if (
    !Number.isInteger(zi) ||
    !Number.isInteger(xi) ||
    !Number.isInteger(yi) ||
    zi < 0 ||
    zi > MAX_Z ||
    xi < 0 ||
    yi < 0 ||
    xi >= limit ||
    yi >= limit
  ) {
    return new Response("Invalid tile coordinates", { status: 400 });
  }

  let db: SqlJsDatabase;
  try {
    db = await getDb();
  } catch (err) {
    return new Response(
      `Tile atlas unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 503 }
    );
  }

  // XYZ → TMS row flip (same as MbtilesServer.kt).
  const row = limit - 1 - yi;
  const res = db.exec(
    "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
    [zi, xi, row]
  );
  const tile = res[0]?.values[0]?.[0];
  if (!(tile instanceof Uint8Array)) {
    return new Response("Tile not found", { status: 404 });
  }
  const body = new Uint8Array(tile);
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}