/**
 * Vehicle profiles.
 *
 * A profile is what makes the readings mean something: engine size and weight
 * drive the power estimate, tank size turns a percentage into litres, and the
 * vehicle type decides which parameters are worth offering at all.
 */

import type { VehicleType } from '@/obd/pids';
import { getDb } from '../db';

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  make: string | null;
  model: string | null;
  year: number | null;
  engineCc: number | null;
  fuelType: string | null;
  tankLitres: number | null;
  kerbWeightKg: number | null;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  engine_cc: number | null;
  fuel_type: string | null;
  tank_litres: number | null;
  kerb_weight_kg: number | null;
  created_at: number;
}

function toVehicle(row: Row): Vehicle {
  return {
    id: row.id,
    name: row.name,
    type: (row.type as VehicleType) ?? 'car',
    make: row.make,
    model: row.model,
    year: row.year,
    engineCc: row.engine_cc,
    fuelType: row.fuel_type,
    tankLitres: row.tank_litres,
    kerbWeightKg: row.kerb_weight_kg,
    createdAt: row.created_at,
  };
}

export async function listVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM vehicles ORDER BY created_at ASC');
  return rows.map(toVehicle);
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM vehicles WHERE id = ?', [id]);
  return row ? toVehicle(row) : null;
}

export async function saveVehicle(vehicle: Omit<Vehicle, 'createdAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vehicles
       (id, name, type, make, model, year, engine_cc, fuel_type, tank_litres, kerb_weight_kg, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       make = excluded.make,
       model = excluded.model,
       year = excluded.year,
       engine_cc = excluded.engine_cc,
       fuel_type = excluded.fuel_type,
       tank_litres = excluded.tank_litres,
       kerb_weight_kg = excluded.kerb_weight_kg`,
    [
      vehicle.id,
      vehicle.name,
      vehicle.type,
      vehicle.make,
      vehicle.model,
      vehicle.year,
      vehicle.engineCc,
      vehicle.fuelType,
      vehicle.tankLitres,
      vehicle.kerbWeightKg,
      vehicle.createdAt ?? Date.now(),
    ],
  );
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM dashboard_slots WHERE vehicle_id = ?', [id]);
  await db.runAsync('DELETE FROM vehicles WHERE id = ?', [id]);
}

/** Dashboard layout for one vehicle: which parameter sits in which slot. */
export interface DashboardSlot {
  slot: number;
  pid: number;
  style: 'gauge' | 'number' | 'bar';
}

export async function getDashboard(vehicleId: string): Promise<DashboardSlot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ slot: number; pid: number; style: string }>(
    'SELECT slot, pid, style FROM dashboard_slots WHERE vehicle_id = ? ORDER BY slot',
    [vehicleId],
  );
  return rows.map((r) => ({
    slot: r.slot,
    pid: r.pid,
    style: (r.style as DashboardSlot['style']) ?? 'gauge',
  }));
}

export async function saveDashboard(vehicleId: string, slots: DashboardSlot[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM dashboard_slots WHERE vehicle_id = ?', [vehicleId]);
  for (const slot of slots) {
    await db.runAsync(
      'INSERT INTO dashboard_slots (vehicle_id, slot, pid, style) VALUES (?, ?, ?, ?)',
      [vehicleId, slot.slot, slot.pid, slot.style],
    );
  }
}

/** Sensible starting layout when a vehicle has none yet. */
export function defaultDashboard(type: VehicleType): DashboardSlot[] {
  const base: number[] =
    type === 'motorcycle' || type === 'scooter'
      ? [0x0c, 0x0d, 0x05, 0x11, 0x42, 0x04]
      : [0x0c, 0x0d, 0x05, 0x04, 0x42, 0x2f];
  return base.map((pid, index) => ({
    slot: index,
    pid,
    style: index < 2 ? 'gauge' : 'number',
  }));
}
