/**
 * Reading alarms.
 *
 * An alarm fires once when a reading stays past its limit for the hold time,
 * and re-arms only when the reading comes back. A missing reading never fires
 * one — silence is not the same as a bad value.
 */

import { pidDefinition } from '@/obd/pids';
import { getDb } from '../db';

export type Comparator = 'above' | 'below';

export interface Alarm {
  id: number;
  vehicleId: string | null;
  pid: number;
  comparator: Comparator;
  threshold: number;
  holdSeconds: number;
  enabled: boolean;
  label: string | null;
}

interface Row {
  id: number; vehicle_id: string | null; pid: number; comparator: string;
  threshold: number; hold_seconds: number; enabled: number; label: string | null;
}

function toAlarm(r: Row): Alarm {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    pid: r.pid,
    comparator: r.comparator === 'below' ? 'below' : 'above',
    threshold: r.threshold,
    holdSeconds: r.hold_seconds,
    enabled: r.enabled === 1,
    label: r.label,
  };
}

export async function listAlarms(vehicleId: string | null): Promise<Alarm[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM alarms WHERE vehicle_id IS ? OR vehicle_id IS NULL ORDER BY id',
    [vehicleId],
  );
  return rows.map(toAlarm);
}

export async function saveAlarm(alarm: Omit<Alarm, 'id'> & { id?: number }): Promise<number> {
  const db = await getDb();
  if (alarm.id !== undefined) {
    await db.runAsync(
      `UPDATE alarms SET vehicle_id = ?, pid = ?, comparator = ?, threshold = ?,
              hold_seconds = ?, enabled = ?, label = ? WHERE id = ?`,
      [
        alarm.vehicleId, alarm.pid, alarm.comparator, alarm.threshold,
        alarm.holdSeconds, alarm.enabled ? 1 : 0, alarm.label, alarm.id,
      ],
    );
    return alarm.id;
  }
  const result = await db.runAsync(
    `INSERT INTO alarms (vehicle_id, pid, comparator, threshold, hold_seconds, enabled, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      alarm.vehicleId, alarm.pid, alarm.comparator, alarm.threshold,
      alarm.holdSeconds, alarm.enabled ? 1 : 0, alarm.label,
    ],
  );
  return result.lastInsertRowId;
}

export async function deleteAlarm(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM alarms WHERE id = ?', [id]);
}

/** Alarms a new profile starts with, chosen to be useful rather than noisy. */
export function suggestedAlarms(vehicleId: string): Omit<Alarm, 'id'>[] {
  return [
    { vehicleId, pid: 0x05, comparator: 'above', threshold: 110, holdSeconds: 5, enabled: true, label: 'Coolant overheating' },
    { vehicleId, pid: 0x42, comparator: 'below', threshold: 12.2, holdSeconds: 10, enabled: true, label: 'Charging voltage low' },
    { vehicleId, pid: 0x2f, comparator: 'below', threshold: 12, holdSeconds: 30, enabled: false, label: 'Fuel low' },
  ];
}

export function describeAlarm(alarm: Alarm): string {
  const definition = pidDefinition(alarm.pid);
  const name = definition?.name ?? `PID ${alarm.pid.toString(16).toUpperCase()}`;
  const unit = definition?.unit ? ` ${definition.unit}` : '';
  const direction = alarm.comparator === 'above' ? 'goes above' : 'falls below';
  return `${name} ${direction} ${alarm.threshold}${unit} for ${alarm.holdSeconds}s`;
}
