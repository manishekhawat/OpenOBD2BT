/**
 * Diagnostic results shared between screens.
 *
 * The health check, the monitor test results and the inspection report all
 * read the same things from the vehicle, and each read costs a round trip over
 * a link that handles one request at a time. Keeping the results here means a
 * screen can show them immediately instead of re-reading what was just read.
 */

import { create } from 'zustand';

import type { TestResult } from '@/obd/mode06';
import type { ReadinessReport } from '@/obd/monitors';
import { session } from '@/obd/session';
import { assessHealth, type HealthCheck } from '@/features/health';
import { useFaults } from './faults';

export interface DiagnosticsState {
  readings: Record<number, number>;
  testResults: TestResult[];
  readiness: ReadinessReport | null;
  driveCycle: ReadinessReport | null;
  performanceCounters: { label: string; numerator: number; denominator: number }[];
  checks: HealthCheck[] | null;
  /** When the last full read finished. */
  readAt: number | null;
  busy: boolean;
  step: string | null;

  /** Read everything the diagnostic screens need, in one pass. */
  refresh: (options?: { includeTestResults?: boolean; includeCounters?: boolean }) => Promise<void>;
  clear: () => void;
}

/** Sensors the health checks and the inspection report both draw on. */
const DIAGNOSTIC_PIDS = [
  0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0c, 0x0d, 0x0f,
  0x11, 0x14, 0x18, 0x1f, 0x21, 0x2f, 0x30, 0x31, 0x42, 0x4d, 0x4e, 0xa6,
];

export const useDiagnostics = create<DiagnosticsState>((set, get) => ({
  readings: {},
  testResults: [],
  readiness: null,
  driveCycle: null,
  performanceCounters: [],
  checks: null,
  readAt: null,
  busy: false,
  step: null,

  async refresh(options = {}) {
    if (!session.isReady() || get().busy) return;
    const { includeTestResults = true, includeCounters = true } = options;

    set({ busy: true, step: 'Reading sensors…' });

    try {
      const readings: Record<number, number> = {};
      for (const pid of DIAGNOSTIC_PIDS) {
        if (!session.supportedPids.includes(pid)) continue;
        const reading = await session.readValue(pid);
        if (reading) readings[pid] = reading.value;
      }
      set({ readings });

      set({ step: 'Checking for fault codes…' });
      await useFaults.getState().scan();
      const scan = useFaults.getState().result;

      set({ step: 'Reading readiness…' });
      const readiness = await session.readReadiness();
      const driveCycle = await session.readDriveCycleReadiness();
      set({ readiness, driveCycle });

      let testResults = get().testResults;
      if (includeTestResults) {
        set({ step: 'Reading monitor test results…' });
        testResults = await session.readTestResults();
        set({ testResults });
      }

      if (includeCounters) {
        set({ step: 'Reading performance counters…' });
        set({ performanceCounters: await session.readPerformanceCounters() });
      }

      set({
        checks: assessHealth({ readings, testResults, scan, readiness }),
        readAt: Date.now(),
      });
    } finally {
      set({ busy: false, step: null });
    }
  },

  clear() {
    set({
      readings: {},
      testResults: [],
      readiness: null,
      driveCycle: null,
      performanceCounters: [],
      checks: null,
      readAt: null,
    });
  },
}));
