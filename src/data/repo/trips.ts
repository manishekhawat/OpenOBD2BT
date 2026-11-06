/**
 * Trips.
 *
 * A trip is a recording of speed, revs and position over time. Position comes
 * from the phone's GPS and never leaves the phone; no map tiles are downloaded,
 * so the route is drawn from the points themselves.
 */

import { getDb } from '../db';

export interface TripPoint {
  tMs: number;
  lat: number | null;
  lon: number | null;
  alt: number | null;
  speedKmh: number | null;
  rpm: number | null;
}

export interface Trip {
  id: number;
  vehicleId: string | null;
  startedAt: number;
  endedAt: number | null;
  distanceKm: number;
  durationS: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  fuelUsedL: number | null;
  pointCount: number;
}

export async function startTrip(vehicleId: string | null): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO trips (vehicle_id, started_at) VALUES (?, ?)',
    [vehicleId, Date.now()],
  );
  return result.lastInsertRowId;
}

/** Append points in a batch — writing one row per sample would be too slow. */
export async function appendPoints(tripId: number, points: TripPoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const p of points) {
      await db.runAsync(
        `INSERT INTO trip_points (trip_id, t_ms, lat, lon, alt, speed_kmh, rpm)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tripId, p.tMs, p.lat, p.lon, p.alt, p.speedKmh, p.rpm],
      );
    }
  });
}

export async function finishTrip(
  tripId: number,
  summary: {
    distanceKm: number;
    durationS: number;
    maxSpeedKmh: number;
    avgSpeedKmh: number;
    fuelUsedL: number | null;
    pointCount: number;
  },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE trips SET ended_at = ?, distance_km = ?, duration_s = ?,
            max_speed_kmh = ?, avg_speed_kmh = ?, fuel_used_l = ?, point_count = ?
      WHERE id = ?`,
    [
      Date.now(),
      summary.distanceKm,
      summary.durationS,
      summary.maxSpeedKmh,
      summary.avgSpeedKmh,
      summary.fuelUsedL,
      summary.pointCount,
      tripId,
    ],
  );
}

interface TripRow {
  id: number; vehicle_id: string | null; started_at: number; ended_at: number | null;
  distance_km: number; duration_s: number; max_speed_kmh: number;
  avg_speed_kmh: number; fuel_used_l: number | null; point_count: number;
}

function toTrip(r: TripRow): Trip {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceKm: r.distance_km,
    durationS: r.duration_s,
    maxSpeedKmh: r.max_speed_kmh,
    avgSpeedKmh: r.avg_speed_kmh,
    fuelUsedL: r.fuel_used_l,
    pointCount: r.point_count,
  };
}

export async function listTrips(limit = 100): Promise<Trip[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TripRow>(
    'SELECT * FROM trips WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?',
    [limit],
  );
  return rows.map(toTrip);
}

export async function getTrip(id: number): Promise<Trip | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TripRow>('SELECT * FROM trips WHERE id = ?', [id]);
  return row ? toTrip(row) : null;
}

export async function getTripPoints(id: number): Promise<TripPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    t_ms: number; lat: number | null; lon: number | null;
    alt: number | null; speed_kmh: number | null; rpm: number | null;
  }>('SELECT t_ms, lat, lon, alt, speed_kmh, rpm FROM trip_points WHERE trip_id = ? ORDER BY t_ms', [id]);

  return rows.map((r) => ({
    tMs: r.t_ms,
    lat: r.lat,
    lon: r.lon,
    alt: r.alt,
    speedKmh: r.speed_kmh,
    rpm: r.rpm,
  }));
}

export async function deleteTrip(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trips WHERE id = ?', [id]);
}

/** Remove any trip that was started but never finished (app killed mid-trip). */
export async function discardUnfinishedTrips(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trips WHERE ended_at IS NULL');
}
