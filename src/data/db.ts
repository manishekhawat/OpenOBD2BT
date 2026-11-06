/**
 * Local database.
 *
 * Everything the app stores lives on the phone — scans, trips, vehicles,
 * dashboards, alarms, fuel logs and settings. There is no server, no account
 * and nothing is uploaded, so the schema is the whole data model.
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'obdscout.db';

/** Bump this and add a migration below when the schema changes. */
const SCHEMA_VERSION = 1;

let database: SQLite.SQLiteDatabase | null = null;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS vehicles (
      id            TEXT PRIMARY KEY NOT NULL,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'car',
      make          TEXT,
      model         TEXT,
      year          INTEGER,
      engine_cc     INTEGER,
      fuel_type     TEXT,
      tank_litres   REAL,
      kerb_weight_kg REAL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scans (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id    TEXT,
      started_at    INTEGER NOT NULL,
      adapter       TEXT,
      protocol      TEXT,
      vin           TEXT,
      voltage       REAL,
      mil_on        INTEGER NOT NULL DEFAULT 0,
      dtc_count     INTEGER NOT NULL DEFAULT 0,
      readiness_json TEXT,
      cleared_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS scans_recent ON scans (started_at DESC);

    CREATE TABLE IF NOT EXISTS scan_codes (
      scan_id       INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      position      INTEGER NOT NULL,
      code          TEXT NOT NULL,
      origin        TEXT NOT NULL,
      raw_hex       TEXT,
      title         TEXT,
      action        TEXT
    );
    CREATE INDEX IF NOT EXISTS scan_codes_scan ON scan_codes (scan_id);

    CREATE TABLE IF NOT EXISTS freeze_frames (
      scan_id       INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      pid           INTEGER NOT NULL,
      value         REAL NOT NULL,
      unit          TEXT
    );
    CREATE INDEX IF NOT EXISTS freeze_frames_scan ON freeze_frames (scan_id);

    CREATE TABLE IF NOT EXISTS trips (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id    TEXT,
      started_at    INTEGER NOT NULL,
      ended_at      INTEGER,
      distance_km   REAL NOT NULL DEFAULT 0,
      duration_s    INTEGER NOT NULL DEFAULT 0,
      max_speed_kmh REAL NOT NULL DEFAULT 0,
      avg_speed_kmh REAL NOT NULL DEFAULT 0,
      fuel_used_l   REAL,
      point_count   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS trips_recent ON trips (started_at DESC);

    CREATE TABLE IF NOT EXISTS trip_points (
      trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      t_ms          INTEGER NOT NULL,
      lat           REAL,
      lon           REAL,
      alt           REAL,
      speed_kmh     REAL,
      rpm           REAL
    );
    CREATE INDEX IF NOT EXISTS trip_points_trip ON trip_points (trip_id, t_ms);

    CREATE TABLE IF NOT EXISTS dashboard_slots (
      vehicle_id    TEXT NOT NULL,
      slot          INTEGER NOT NULL,
      pid           INTEGER NOT NULL,
      style         TEXT NOT NULL DEFAULT 'gauge',
      PRIMARY KEY (vehicle_id, slot)
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id    TEXT,
      pid           INTEGER NOT NULL,
      comparator    TEXT NOT NULL,
      threshold     REAL NOT NULL,
      hold_seconds  INTEGER NOT NULL DEFAULT 3,
      enabled       INTEGER NOT NULL DEFAULT 1,
      label         TEXT
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id    TEXT,
      at            INTEGER NOT NULL,
      litres        REAL NOT NULL,
      distance_km   REAL,
      cost          REAL,
      filled_to_full INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS fuel_logs_vehicle ON fuel_logs (vehicle_id, at DESC);
  `,
};

/** Open the database, running any migrations that have not been applied. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) continue;
    await db.execAsync(migration);
  }

  if (current < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  database = db;
  return db;
}

/** Drop every stored record but keep settings and vehicles. */
export async function clearHistory(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM scan_codes;
    DELETE FROM freeze_frames;
    DELETE FROM scans;
    DELETE FROM trip_points;
    DELETE FROM trips;
  `);
}
