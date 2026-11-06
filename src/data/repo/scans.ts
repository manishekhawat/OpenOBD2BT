/**
 * Saved scans.
 *
 * Every fault-code scan is kept so a problem can be compared with how it looked
 * last week, and so a record survives clearing the codes.
 */

import type { DecodedDtc } from '@/obd/dtc';
import type { ReadinessReport } from '@/obd/monitors';
import type { Reading } from '@/obd/session';
import { lookupDtc, type ActionLevel } from '../dtcCatalog';
import { getDb } from '../db';

export interface SavedScanSummary {
  id: number;
  vehicleId: string | null;
  startedAt: number;
  adapter: string | null;
  protocol: string | null;
  vin: string | null;
  voltage: number | null;
  milOn: boolean;
  dtcCount: number;
  clearedAt: number | null;
}

export interface SavedScanCode {
  code: string;
  origin: DecodedDtc['origin'];
  rawHex: string | null;
  title: string | null;
  action: ActionLevel | null;
}

export interface SavedScan extends SavedScanSummary {
  codes: SavedScanCode[];
  readiness: ReadinessReport | null;
  freezeFrame: { pid: number; value: number; unit: string | null }[];
}

export interface SaveScanInput {
  vehicleId: string | null;
  adapter: string | null;
  protocol: string | null;
  vin: string | null;
  voltage: number | null;
  stored: DecodedDtc[];
  pending: DecodedDtc[];
  permanent: DecodedDtc[];
  readiness: ReadinessReport | null;
  freezeFrame?: Reading[];
}

export async function saveScan(input: SaveScanInput): Promise<number> {
  const db = await getDb();
  const all = [...input.stored, ...input.pending, ...input.permanent];

  const result = await db.runAsync(
    `INSERT INTO scans
       (vehicle_id, started_at, adapter, protocol, vin, voltage, mil_on, dtc_count, readiness_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.vehicleId,
      Date.now(),
      input.adapter,
      input.protocol,
      input.vin,
      input.voltage,
      input.readiness?.milOn ? 1 : 0,
      input.stored.length,
      input.readiness ? JSON.stringify(input.readiness) : null,
    ],
  );

  const scanId = result.lastInsertRowId;

  for (const [position, dtc] of all.entries()) {
    const info = lookupDtc(dtc.code);
    await db.runAsync(
      `INSERT INTO scan_codes (scan_id, position, code, origin, raw_hex, title, action)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [scanId, position, dtc.code, dtc.origin, dtc.rawHex, info.title, info.action],
    );
  }

  for (const reading of input.freezeFrame ?? []) {
    await db.runAsync(
      'INSERT INTO freeze_frames (scan_id, pid, value, unit) VALUES (?, ?, ?, ?)',
      [scanId, reading.pid, reading.value, reading.unit],
    );
  }

  await pruneScans(200);
  return scanId;
}

/** Record that codes were cleared during this scan. */
export async function markCleared(scanId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE scans SET cleared_at = ? WHERE id = ?', [Date.now(), scanId]);
}

export async function listScans(limit = 100): Promise<SavedScanSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; vehicle_id: string | null; started_at: number; adapter: string | null;
    protocol: string | null; vin: string | null; voltage: number | null;
    mil_on: number; dtc_count: number; cleared_at: number | null;
  }>('SELECT * FROM scans ORDER BY started_at DESC LIMIT ?', [limit]);

  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    startedAt: r.started_at,
    adapter: r.adapter,
    protocol: r.protocol,
    vin: r.vin,
    voltage: r.voltage,
    milOn: r.mil_on === 1,
    dtcCount: r.dtc_count,
    clearedAt: r.cleared_at,
  }));
}

export async function getScan(id: number): Promise<SavedScan | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: number; vehicle_id: string | null; started_at: number; adapter: string | null;
    protocol: string | null; vin: string | null; voltage: number | null;
    mil_on: number; dtc_count: number; readiness_json: string | null; cleared_at: number | null;
  }>('SELECT * FROM scans WHERE id = ?', [id]);
  if (!row) return null;

  const codes = await db.getAllAsync<{
    code: string; origin: string; raw_hex: string | null;
    title: string | null; action: string | null;
  }>('SELECT code, origin, raw_hex, title, action FROM scan_codes WHERE scan_id = ? ORDER BY position', [id]);

  const frames = await db.getAllAsync<{ pid: number; value: number; unit: string | null }>(
    'SELECT pid, value, unit FROM freeze_frames WHERE scan_id = ?', [id],
  );

  let readiness: ReadinessReport | null = null;
  if (row.readiness_json) {
    try {
      readiness = JSON.parse(row.readiness_json) as ReadinessReport;
    } catch {
      readiness = null;
    }
  }

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    startedAt: row.started_at,
    adapter: row.adapter,
    protocol: row.protocol,
    vin: row.vin,
    voltage: row.voltage,
    milOn: row.mil_on === 1,
    dtcCount: row.dtc_count,
    clearedAt: row.cleared_at,
    codes: codes.map((c) => ({
      code: c.code,
      origin: c.origin as DecodedDtc['origin'],
      rawHex: c.raw_hex,
      title: c.title,
      action: c.action as ActionLevel | null,
    })),
    readiness,
    freezeFrame: frames,
  };
}

export async function deleteScan(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM scans WHERE id = ?', [id]);
}

/** Keep the most recent `keep` scans; older ones go. */
async function pruneScans(keep: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM scans WHERE id NOT IN (
       SELECT id FROM scans ORDER BY started_at DESC LIMIT ?
     )`,
    [keep],
  );
}

/** How often each code has appeared, newest first — for spotting a recurring fault. */
export async function codeHistory(code: string): Promise<{ scanId: number; at: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ scan_id: number; started_at: number }>(
    `SELECT c.scan_id, s.started_at
       FROM scan_codes c JOIN scans s ON s.id = c.scan_id
      WHERE c.code = ?
      ORDER BY s.started_at DESC`,
    [code],
  );
  return rows.map((r) => ({ scanId: r.scan_id, at: r.started_at }));
}
