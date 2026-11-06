/**
 * Fuel log.
 *
 * Fill-ups recorded at the pump. Comparing what the pump actually delivered
 * with what the app estimated from air flow lets the estimate be corrected, so
 * economy figures get better the more fill-ups are entered.
 */

import { getDb } from '../db';

export interface FuelLog {
  id: number;
  vehicleId: string | null;
  at: number;
  litres: number;
  distanceKm: number | null;
  cost: number | null;
  filledToFull: boolean;
}

export async function addFuelLog(entry: Omit<FuelLog, 'id'>): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO fuel_logs (vehicle_id, at, litres, distance_km, cost, filled_to_full)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.vehicleId, entry.at, entry.litres,
      entry.distanceKm, entry.cost, entry.filledToFull ? 1 : 0,
    ],
  );
  return result.lastInsertRowId;
}

export async function listFuelLogs(vehicleId: string | null, limit = 50): Promise<FuelLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; vehicle_id: string | null; at: number; litres: number;
    distance_km: number | null; cost: number | null; filled_to_full: number;
  }>(
    'SELECT * FROM fuel_logs WHERE vehicle_id IS ? ORDER BY at DESC LIMIT ?',
    [vehicleId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    at: r.at,
    litres: r.litres,
    distanceKm: r.distance_km,
    cost: r.cost,
    filledToFull: r.filled_to_full === 1,
  }));
}

export async function deleteFuelLog(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM fuel_logs WHERE id = ?', [id]);
}

/**
 * Economy across the logged fill-ups, in litres per 100 km.
 *
 * Only tank-to-full entries with a distance are usable: a partial fill leaves
 * an unknown amount in the tank, so it cannot anchor the calculation.
 */
export function averageEconomy(logs: FuelLog[]): number | null {
  const usable = logs.filter((l) => l.filledToFull && l.distanceKm && l.distanceKm > 0);
  if (usable.length === 0) return null;

  const litres = usable.reduce((sum, l) => sum + l.litres, 0);
  const km = usable.reduce((sum, l) => sum + (l.distanceKm ?? 0), 0);
  if (km <= 0) return null;
  return (litres / km) * 100;
}

/** Average cost per km across entries that recorded a cost. */
export function averageCostPerKm(logs: FuelLog[]): number | null {
  const usable = logs.filter((l) => l.cost != null && l.distanceKm && l.distanceKm > 0);
  if (usable.length === 0) return null;
  const cost = usable.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const km = usable.reduce((sum, l) => sum + (l.distanceKm ?? 0), 0);
  return km > 0 ? cost / km : null;
}
