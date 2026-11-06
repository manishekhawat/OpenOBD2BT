/**
 * App settings.
 *
 * Kept in device storage. There is no account, so these are simply this
 * phone's preferences and nothing is synchronised anywhere.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UnitSystem } from '@/features/units';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Language = 'en' | 'hi';

export interface SettingsState {
  theme: ThemeChoice;
  units: UnitSystem;
  language: Language;
  /**
   * Plain ELM327 requests, one at a time, with adaptive timing off. Slower,
   * but tolerated by clone adapters that drop replies when pushed.
   */
  safeMode: boolean;
  keepAwake: boolean;
  /** Reconnect automatically if the link drops mid-session. */
  autoReconnect: boolean;
  /** Keep the raw adapter conversation for troubleshooting. */
  logAdapterTraffic: boolean;
  /** Last adapter used, so Connect can offer it first. */
  lastAdapterId: string | null;
  lastAdapterKind: string | null;
  /** Vehicle profile currently selected. */
  activeVehicleId: string | null;
  /** Wi-Fi adapter address, remembered between sessions. */
  wifiHost: string;
  wifiPort: number;
  /** Learned fuel-rate correction, per vehicle. */
  fuelCalibration: Record<string, number>;

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
}

const DEFAULTS = {
  theme: 'system' as ThemeChoice,
  units: 'metric' as UnitSystem,
  language: 'en' as Language,
  safeMode: false,
  keepAwake: true,
  autoReconnect: true,
  logAdapterTraffic: false,
  lastAdapterId: null,
  lastAdapterKind: null,
  activeVehicleId: null,
  wifiHost: '192.168.0.10',
  wifiPort: 35000,
  fuelCalibration: {} as Record<string, number>,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'obd-scout-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data, not the action functions.
      partialize: (state) => {
        const { set: _set, reset: _reset, ...data } = state;
        return data;
      },
    },
  ),
);
