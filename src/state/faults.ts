/**
 * Fault scan state.
 *
 * Holds the most recent scan so the home screen and the faults screen agree
 * without re-reading the vehicle, and writes each scan to the database so a
 * record survives clearing the codes.
 */

import { create } from 'zustand';

import { actionRank, lookupDtc, type DriveAdvice } from '@/data/dtcCatalog';
import { markCleared, saveScan } from '@/data/repo/scans';
import type { DecodedDtc } from '@/obd/dtc';
import type { ReadinessReport } from '@/obd/monitors';
import { session, type ScanResult } from '@/obd/session';
import { useSettings } from './settings';
import { useVehicles } from './vehicles';

export interface FaultsState {
  result: ScanResult | null;
  /** Row id of the saved scan, so clearing can be recorded against it. */
  savedScanId: number | null;
  scanning: boolean;
  clearing: boolean;
  error: string | null;
  /** Outcome of the last clear, for the confirmation message. */
  lastClear: { attemptedAt: number; remaining: number; accepted: boolean } | null;

  scan: () => Promise<void>;
  clear: () => Promise<void>;
  reset: () => void;
}

export const useFaults = create<FaultsState>((set, get) => ({
  result: null,
  savedScanId: null,
  scanning: false,
  clearing: false,
  error: null,
  lastClear: null,

  async scan() {
    if (!session.isReady()) {
      set({ error: 'Connect an adapter first.' });
      return;
    }
    set({ scanning: true, error: null, lastClear: null });

    try {
      const result = await session.scanFaults();
      const status = session.getStatus();

      const savedScanId = await saveScan({
        vehicleId: useVehicles.getState().activeId,
        adapter: status.adapterLabel,
        protocol: status.protocol,
        vin: session.vehicleInfo?.vin ?? null,
        voltage: status.voltage,
        stored: result.stored,
        pending: result.pending,
        permanent: result.permanent,
        readiness: result.readiness,
      });

      set({ result, savedScanId, scanning: false });
    } catch (error) {
      set({
        scanning: false,
        error: error instanceof Error ? error.message : 'The scan could not be completed.',
      });
    }
  },

  async clear() {
    if (!session.isReady()) {
      set({ error: 'Connect an adapter first.' });
      return;
    }
    set({ clearing: true, error: null });

    try {
      const outcome = await session.clearFaults();
      const savedScanId = get().savedScanId;
      if (savedScanId !== null) await markCleared(savedScanId);

      // Re-read so the screen reflects what the vehicle now reports.
      const result = await session.scanFaults();

      set({
        clearing: false,
        result,
        lastClear: {
          attemptedAt: Date.now(),
          remaining: outcome.remaining.length,
          accepted: outcome.cleared,
        },
      });

      // Clearing resets the fuel correction basis, since trip counters reset too.
      const vehicleId = useVehicles.getState().activeId;
      if (vehicleId) {
        const calibration = { ...useSettings.getState().fuelCalibration };
        delete calibration[vehicleId];
        useSettings.getState().set('fuelCalibration', calibration);
      }
    } catch (error) {
      set({
        clearing: false,
        error: error instanceof Error ? error.message : 'The codes could not be cleared.',
      });
    }
  },

  reset() {
    set({ result: null, savedScanId: null, error: null, lastClear: null });
  },
}));

/** Every code from a scan, worst first. */
export function rankedCodes(result: ScanResult): DecodedDtc[] {
  return [...result.stored, ...result.pending, ...result.permanent].sort((a, b) => {
    const rank = actionRank(lookupDtc(a.code).action) - actionRank(lookupDtc(b.code).action);
    return rank !== 0 ? rank : a.code.localeCompare(b.code);
  });
}

/** The most cautious driving advice across a set of codes. */
export function overallDriveAdvice(codes: DecodedDtc[]): DriveAdvice {
  let worst: DriveAdvice = 'ok';
  for (const dtc of codes) {
    const { drive } = lookupDtc(dtc.code);
    if (drive === 'do-not-drive') return 'do-not-drive';
    if (drive === 'with-care') worst = 'with-care';
  }
  return worst;
}

/** Short summary of readiness, for the home screen. */
export function readinessSummary(readiness: ReadinessReport | null): string | null {
  if (!readiness) return null;
  const supported = readiness.monitors.filter((m) => m.supported);
  if (supported.length === 0) return null;
  const complete = supported.filter((m) => m.complete).length;
  return readiness.readyForTest
    ? 'All self-checks complete'
    : `${complete} of ${supported.length} self-checks complete`;
}
