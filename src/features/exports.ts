/**
 * File exports.
 *
 * Everything is written to the app's own cache directory and handed to the
 * system share sheet, so the user decides where it goes. Nothing is uploaded.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { pidDefinition } from '@/obd/pids';
import type { SavedScan } from '@/data/repo/scans';
import type { Trip, TripPoint } from '@/data/repo/trips';
import type { TraceEntry } from '@/obd/session';

/** Quote a value for CSV, escaping embedded quotes. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

async function writeAndShare(filename: string, contents: string, mimeType: string): Promise<string> {
  // The cache directory is right for exports: the system may reclaim them, and
  // the copy that matters is the one the user saves from the share sheet.
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
  }
  return file.uri;
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** One scan, with its codes and freeze frame, as CSV. */
export async function exportScanCsv(scan: SavedScan): Promise<string> {
  const lines: string[] = [];

  lines.push(csvRow(['OBD Scout scan export']));
  lines.push(csvRow(['Recorded', new Date(scan.startedAt).toISOString()]));
  lines.push(csvRow(['Adapter', scan.adapter]));
  lines.push(csvRow(['Protocol', scan.protocol]));
  lines.push(csvRow(['VIN', scan.vin]));
  lines.push(csvRow(['Battery voltage', scan.voltage]));
  lines.push(csvRow(['Warning lamp', scan.milOn ? 'on' : 'off']));
  lines.push('');

  lines.push(csvRow(['Code', 'Origin', 'Title', 'Action', 'Raw']));
  for (const code of scan.codes) {
    lines.push(csvRow([code.code, code.origin, code.title, code.action, code.rawHex]));
  }

  if (scan.freezeFrame.length > 0) {
    lines.push('');
    lines.push(csvRow(['Freeze frame']));
    lines.push(csvRow(['Parameter', 'Value', 'Unit']));
    for (const frame of scan.freezeFrame) {
      const definition = pidDefinition(frame.pid);
      lines.push(csvRow([definition?.name ?? `PID ${frame.pid}`, frame.value, frame.unit]));
    }
  }

  if (scan.readiness) {
    lines.push('');
    lines.push(csvRow(['Readiness monitors']));
    lines.push(csvRow(['Monitor', 'Supported', 'Complete']));
    for (const monitor of scan.readiness.monitors) {
      lines.push(csvRow([monitor.name, monitor.supported ? 'yes' : 'no', monitor.complete ? 'yes' : 'no']));
    }
  }

  return writeAndShare(`obd-scan-${stamp(scan.startedAt)}.csv`, lines.join('\n'), 'text/csv');
}

/** A trip's samples as CSV. */
export async function exportTripCsv(trip: Trip, points: TripPoint[]): Promise<string> {
  const lines: string[] = [];
  lines.push(csvRow(['OBD Scout trip export']));
  lines.push(csvRow(['Started', new Date(trip.startedAt).toISOString()]));
  lines.push(csvRow(['Distance (km)', trip.distanceKm.toFixed(2)]));
  lines.push(csvRow(['Duration (s)', trip.durationS]));
  lines.push('');
  lines.push(csvRow(['Time', 'Latitude', 'Longitude', 'Altitude (m)', 'Speed (km/h)', 'RPM']));

  for (const point of points) {
    lines.push(
      csvRow([
        new Date(point.tMs).toISOString(),
        point.lat, point.lon, point.alt, point.speedKmh, point.rpm,
      ]),
    );
  }

  return writeAndShare(`obd-trip-${stamp(trip.startedAt)}.csv`, lines.join('\n'), 'text/csv');
}

/** A trip's route as GPX, for mapping software. */
export async function exportTripGpx(trip: Trip, points: TripPoint[]): Promise<string> {
  const located = points.filter(
    (p): p is TripPoint & { lat: number; lon: number } => p.lat != null && p.lon != null,
  );
  if (located.length === 0) {
    throw new Error('This trip has no satellite positions, so it cannot be written as GPX.');
  }

  const body = located
    .map((p) => {
      const elevation = p.alt != null ? `\n        <ele>${p.alt.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${elevation}
        <time>${new Date(p.tMs).toISOString()}</time>
      </trkpt>`;
    })
    .join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OBD Scout" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Trip ${new Date(trip.startedAt).toISOString()}</name>
  </metadata>
  <trk>
    <name>OBD Scout trip</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>`;

  return writeAndShare(`obd-trip-${stamp(trip.startedAt)}.gpx`, gpx, 'application/gpx+xml');
}

/** The raw adapter conversation, for diagnosing an adapter that misbehaves. */
export async function exportTrace(trace: TraceEntry[]): Promise<string> {
  const lines = trace.map((entry) => {
    const time = new Date(entry.at).toISOString().slice(11, 23);
    const arrow = entry.direction === 'tx' ? '>>' : entry.direction === 'rx' ? '<<' : '--';
    return `${time} ${arrow} ${entry.text.replace(/\r/g, '\\r').replace(/\n/g, ' ')}`;
  });

  const header = [
    'OBD Scout adapter log',
    `Written ${new Date().toISOString()}`,
    '',
  ];

  return writeAndShare(
    `obd-adapter-log-${stamp(Date.now())}.txt`,
    [...header, ...lines].join('\n'),
    'text/plain',
  );
}
