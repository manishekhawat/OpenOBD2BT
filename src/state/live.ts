/**
 * Live readings.
 *
 * Holds the latest value for each parameter plus a rolling history for the
 * graphs. History is capped per parameter so a long session cannot grow
 * without bound.
 */

import { create } from 'zustand';

import { pidDefinition } from '@/obd/pids';
import { session, type Reading } from '@/obd/session';

/** Samples kept per parameter — about four minutes at the fast poll rate. */
const HISTORY_LIMIT = 600;

export interface HistoryPoint {
  at: number;
  value: number;
}

export interface LiveState {
  readings: Record<number, Reading>;
  history: Record<number, HistoryPoint[]>;
  polling: boolean;
  /** Parameters currently being polled. */
  activePids: number[];

  startPolling: (pids: number[]) => void;
  stopPolling: () => void;
  setActivePids: (pids: number[]) => void;
  clear: () => void;
  /** Latest value for one parameter, or null if it has not arrived yet. */
  latestValue: (pid: number) => number | null;
}

let stopFn: (() => void) | null = null;

export const useLive = create<LiveState>((set, get) => ({
  readings: {},
  history: {},
  polling: false,
  activePids: [],

  startPolling(pids) {
    if (pids.length === 0) return;
    stopFn?.();

    // Batch updates: a reading arrives every few milliseconds, and setting
    // state per reading would re-render far more often than the eye needs.
    let batch: Reading[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      if (batch.length === 0) return;
      const incoming = batch;
      batch = [];

      set((state) => {
        const readings = { ...state.readings };
        const history = { ...state.history };

        for (const reading of incoming) {
          readings[reading.pid] = reading;
          const previous = history[reading.pid] ?? [];
          const next = [...previous, { at: reading.at, value: reading.value }];
          history[reading.pid] =
            next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
        }

        return { readings, history };
      });
    };

    stopFn = session.startPolling(pids, (reading) => {
      batch.push(reading);
      if (!flushTimer) flushTimer = setTimeout(flush, 120);
    });

    set({ polling: true, activePids: pids });
  },

  stopPolling() {
    stopFn?.();
    stopFn = null;
    session.stopPolling();
    set({ polling: false });
  },

  setActivePids(pids) {
    const wasPolling = get().polling;
    set({ activePids: pids });
    if (wasPolling) get().startPolling(pids);
  },

  clear() {
    set({ readings: {}, history: {} });
  },

  latestValue(pid) {
    return get().readings[pid]?.value ?? null;
  },
}));

/** Readings that exist, sorted into the order the PID table defines. */
export function sortedReadings(readings: Record<number, Reading>): Reading[] {
  return Object.values(readings).sort((a, b) => {
    const da = pidDefinition(a.pid);
    const db = pidDefinition(b.pid);
    if (!da || !db) return a.pid - b.pid;
    if (da.category !== db.category) return da.category.localeCompare(db.category);
    return da.name.localeCompare(db.name);
  });
}
