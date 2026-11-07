/**
 * Connection state.
 *
 * Wraps the single ObdSession so screens can read its status reactively, and
 * holds the adapter discovery logic — including the auto-detect that tries each
 * kind of link in turn and reports which one answered.
 */

import { create } from 'zustand';

import { session, type SessionStatus, type TraceEntry } from '@/obd/session';
import type { AdapterCandidate, Transport, TransportKind } from '@/obd/transport';
import {
  BluetoothClassicTransport,
  isBluetoothEnabled,
  isLikelyBleOnly,
  listPaired,
} from '@/obd/transports/bluetoothClassic';
import { BleTransport, scanBle, stopBleScan } from '@/obd/transports/ble';
import { COMMON_WIFI_ENDPOINTS, WifiTransport } from '@/obd/transports/wifi';
import { DemoTransport } from '@/obd/transports/demo';
import { useSettings } from './settings';

export interface ConnectionState {
  status: SessionStatus;
  trace: TraceEntry[];
  /** Discovered adapters, by transport kind. */
  candidates: AdapterCandidate[];
  scanning: boolean;
  connecting: boolean;
  lastError: { message: string; hint?: string } | null;
  /** Progress text during auto-detect. */
  probeStep: string | null;

  refreshPaired: () => Promise<void>;
  discover: (kind: TransportKind) => Promise<void>;
  stopDiscovery: () => void;
  connectTo: (candidate: AdapterCandidate) => Promise<boolean>;
  connectWifi: (host: string, port: number) => Promise<boolean>;
  connectDemo: () => Promise<boolean>;
  autoDetect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

function describeError(error: unknown): { message: string; hint?: string } {
  if (error && typeof error === 'object' && 'hint' in error && 'message' in error) {
    return {
      message: String((error as { message: unknown }).message),
      hint: (error as { hint?: string }).hint,
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

export const useConnection = create<ConnectionState>((set, get) => {
  // Mirror the session's own events into the store.
  session.onStatus((status) => set({ status }));
  session.onTrace((trace) => set({ trace }));

  const connectWith = async (transport: Transport): Promise<boolean> => {
    set({ connecting: true, lastError: null });
    try {
      await session.connect(transport, { safeMode: useSettings.getState().safeMode });
      useSettings.getState().set('lastAdapterId', transport.id);
      useSettings.getState().set('lastAdapterKind', transport.kind);
      return true;
    } catch (error) {
      set({ lastError: describeError(error) });
      // Leave nothing half-open behind a failed attempt.
      await session.disconnect().catch(() => undefined);
      return false;
    } finally {
      set({ connecting: false });
    }
  };

  return {
    status: session.getStatus(),
    trace: session.getTrace(),
    candidates: [],
    scanning: false,
    connecting: false,
    lastError: null,
    probeStep: null,

    async refreshPaired() {
      try {
        if (!(await isBluetoothEnabled())) {
          set({ candidates: [], lastError: { message: 'Bluetooth is turned off', hint: 'Turn Bluetooth on to see paired adapters.' } });
          return;
        }
        const paired = await listPaired();
        set({ candidates: paired, lastError: null });
      } catch (error) {
        set({ lastError: describeError(error) });
      }
    },

    async discover(kind) {
      set({ scanning: true, lastError: null });
      try {
        if (kind === 'bt-classic') {
          // Classic adapters have to be paired in Android settings before they
          // will accept a serial connection, so the paired list is the whole
          // story — there is nothing useful an unpaired scan would add.
          set({ candidates: await listPaired() });
        } else if (kind === 'ble') {
          set({ candidates: await scanBle() });
        }
      } catch (error) {
        set({ lastError: describeError(error) });
      } finally {
        set({ scanning: false });
      }
    },

    stopDiscovery() {
      // Only Bluetooth LE scans: Classic adapters come from the paired list,
      // which is a single read with nothing to cancel.
      stopBleScan();
      set({ scanning: false });
    },

    async connectTo(candidate) {
      const transport: Transport =
        candidate.kind === 'ble'
          ? new BleTransport(candidate.id, candidate.name)
          : new BluetoothClassicTransport(candidate.id, candidate.name);
      return connectWith(transport);
    },

    async connectWifi(host, port) {
      useSettings.getState().set('wifiHost', host);
      useSettings.getState().set('wifiPort', port);
      return connectWith(new WifiTransport(host, port));
    },

    async connectDemo() {
      return connectWith(new DemoTransport());
    },

    /**
     * Try every kind of link in turn and connect to whichever answers.
     *
     * Order matters: paired Classic devices first because they are the common
     * case and the cheapest to test, then BLE, then the usual Wi-Fi addresses.
     */
    async autoDetect() {
      set({ connecting: true, lastError: null, probeStep: 'Looking for a paired Bluetooth adapter…' });

      try {
        // 1. Paired Classic adapters, most recently used first.
        const lastId = useSettings.getState().lastAdapterId;
        let paired: AdapterCandidate[] = [];
        try {
          paired = await listPaired();
        } catch {
          paired = [];
        }
        paired.sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0));

        for (const candidate of paired) {
          // Skip devices whose name says they are BLE — Classic will never open.
          if (isLikelyBleOnly(candidate.name)) continue;
          set({ probeStep: `Trying ${candidate.name} over Bluetooth…` });
          const transport = new BluetoothClassicTransport(candidate.id, candidate.name);
          try {
            await session.connect(transport, { safeMode: useSettings.getState().safeMode });
            useSettings.getState().set('lastAdapterId', candidate.id);
            useSettings.getState().set('lastAdapterKind', 'bt-classic');
            set({ probeStep: null });
            return true;
          } catch {
            await session.disconnect().catch(() => undefined);
          }
        }

        // 2. Bluetooth LE.
        set({ probeStep: 'Scanning for Bluetooth LE adapters…' });
        let bleCandidates: AdapterCandidate[] = [];
        try {
          bleCandidates = await scanBle(6000);
        } catch {
          bleCandidates = [];
        }
        for (const candidate of bleCandidates.slice(0, 4)) {
          set({ probeStep: `Trying ${candidate.name} over Bluetooth LE…` });
          try {
            await session.connect(new BleTransport(candidate.id, candidate.name), {
              safeMode: useSettings.getState().safeMode,
            });
            useSettings.getState().set('lastAdapterId', candidate.id);
            useSettings.getState().set('lastAdapterKind', 'ble');
            set({ probeStep: null });
            return true;
          } catch {
            await session.disconnect().catch(() => undefined);
          }
        }

        // 3. Well-known Wi-Fi addresses.
        for (const endpoint of COMMON_WIFI_ENDPOINTS) {
          set({ probeStep: `Trying ${endpoint.host}:${endpoint.port} over Wi-Fi…` });
          try {
            await session.connect(new WifiTransport(endpoint.host, endpoint.port), {
              safeMode: useSettings.getState().safeMode,
            });
            useSettings.getState().set('lastAdapterId', `${endpoint.host}:${endpoint.port}`);
            useSettings.getState().set('lastAdapterKind', 'wifi');
            set({ probeStep: null });
            return true;
          } catch {
            await session.disconnect().catch(() => undefined);
          }
        }

        set({
          lastError: {
            message: 'No adapter answered',
            hint: 'Check the adapter is plugged in with the ignition on, that Bluetooth is on, and that no other app is holding it. For a Wi-Fi adapter, join its network first.',
          },
        });
        return false;
      } finally {
        set({ connecting: false, probeStep: null });
      }
    },

    async disconnect() {
      await session.disconnect();
      set({ lastError: null });
    },

    clearError() {
      set({ lastError: null });
    },
  };
});
