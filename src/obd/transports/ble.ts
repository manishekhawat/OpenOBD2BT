/**
 * Bluetooth LE (GATT) transport.
 *
 * Adapters sold as "Bluetooth 4.0", "BLE" or "iOS compatible" expose a serial
 * bridge over GATT rather than Classic SPP. There is no standard for it, so
 * every vendor picks its own service and characteristic pair. Rather than
 * hardcoding one, this transport discovers the services and picks a
 * notify/write pair — preferring the handful of known-good UUIDs, and otherwise
 * falling back to any usable pair it finds. That makes it work with adapters
 * nobody has catalogued.
 */

import type { BleManager, Characteristic, Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

import {
  type AdapterCandidate,
  type Transport,
  type TransportEvents,
  TransportError,
} from '../transport';

/** Known serial-over-GATT pairs, most common first. */
const KNOWN_PROFILES = [
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', notify: '0000ffe1-0000-1000-8000-00805f9b34fb', write: '0000ffe1-0000-1000-8000-00805f9b34fb' },
  { service: '0000fff0-0000-1000-8000-00805f9b34fb', notify: '0000fff1-0000-1000-8000-00805f9b34fb', write: '0000fff2-0000-1000-8000-00805f9b34fb' },
  { service: '000018f0-0000-1000-8000-00805f9b34fb', notify: '00002af0-0000-1000-8000-00805f9b34fb', write: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '0000ffe5-0000-1000-8000-00805f9b34fb', notify: '0000ffe4-0000-1000-8000-00805f9b34fb', write: '0000ffe9-0000-1000-8000-00805f9b34fb' },
] as const;

/**
 * The manager is created on first use, from a deferred require.
 *
 * Loading the library at the top of the file means a failure to initialise
 * takes the whole bundle down before anything can report it. Deferring keeps
 * the failure contained to Bluetooth LE.
 */
let manager: BleManager | null = null;
let loadFailure: string | null = null;

function ble(): BleManager {
  if (manager) return manager;

  if (loadFailure === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const loaded = require('react-native-ble-plx') as {
        BleManager?: new () => BleManager;
      };
      if (typeof loaded.BleManager !== 'function') {
        loadFailure = 'The Bluetooth LE module loaded but is missing its manager.';
      } else {
        manager = new loaded.BleManager();
        return manager;
      }
    } catch (err) {
      loadFailure = err instanceof Error ? err.message : String(err);
    }
  }

  throw new TransportError(
    'ble',
    'Bluetooth LE support could not start',
    `${loadFailure} Classic Bluetooth and Wi-Fi adapters are unaffected.`,
  );
}

/** Whether the native library is usable, without throwing. For diagnostics. */
export function bleModuleStatus(): { ok: boolean; reason: string | null } {
  try {
    ble();
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: loadFailure };
  }
}

/** Scan for nearby LE devices for `durationMs`, de-duplicated by id. */
export async function scanBle(durationMs = 8000): Promise<AdapterCandidate[]> {
  const found = new Map<string, AdapterCandidate>();

  const state = await ble().state();
  if (state !== 'PoweredOn') {
    throw new TransportError(
      'ble',
      'Bluetooth is turned off',
      'Turn Bluetooth on, then scan again.',
    );
  }

  await new Promise<void>((resolve, reject) => {
    ble().startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        ble().stopDeviceScan();
        reject(
          new TransportError(
            'ble',
            error.message,
            /location/i.test(error.message)
              ? 'Android needs location permission to scan for Bluetooth LE devices. Allow it, then scan again.'
              : undefined,
          ),
        );
        return;
      }
      if (!device) return;
      const name = device.name ?? device.localName;
      if (!name) return; // Unnamed beacons are noise.
      found.set(device.id, {
        id: device.id,
        name,
        kind: 'ble',
        rssi: device.rssi ?? undefined,
      });
    });

    setTimeout(() => {
      ble().stopDeviceScan();
      resolve();
    }, durationMs);
  });

  // Likely adapters first: anything whose name mentions OBD or a known brand.
  return [...found.values()].sort((a, b) => {
    const score = (n: string) =>
      /OBD|ELM|VGATE|VEEPEAK|KONNWEI|ICAR|LINK/i.test(n) ? 0 : 1;
    const byScore = score(a.name) - score(b.name);
    return byScore !== 0 ? byScore : (b.rssi ?? -999) - (a.rssi ?? -999);
  });
}

export function stopBleScan(): void {
  try {
    ble().stopDeviceScan();
  } catch {
    // Not scanning.
  }
}

interface ResolvedProfile {
  notify: Characteristic;
  write: Characteristic;
}

/**
 * Work out which characteristics carry the serial stream.
 *
 * Tries the catalogued profiles, then any service that offers both a notifying
 * and a writable characteristic.
 */
function resolveProfile(device: Device, services: { uuid: string; characteristics: Characteristic[] }[]): ResolvedProfile | null {
  for (const profile of KNOWN_PROFILES) {
    const service = services.find((s) => s.uuid.toLowerCase() === profile.service);
    if (!service) continue;
    const notify = service.characteristics.find(
      (c) => c.uuid.toLowerCase() === profile.notify,
    );
    const write = service.characteristics.find(
      (c) => c.uuid.toLowerCase() === profile.write,
    );
    if (notify && write) return { notify, write };
  }

  for (const service of services) {
    const notify = service.characteristics.find(
      (c) => c.isNotifiable || c.isIndicatable,
    );
    const write = service.characteristics.find(
      (c) => c.isWritableWithResponse || c.isWritableWithoutResponse,
    );
    if (notify && write) return { notify, write };
  }

  return null;
}

export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  readonly id: string;
  readonly label: string;

  private device: Device | null = null;
  private profile: ResolvedProfile | null = null;
  private monitor: { remove: () => void } | null = null;
  private disconnectSub: { remove: () => void } | null = null;
  private open_ = false;

  constructor(id: string, name?: string) {
    this.id = id;
    this.label = name ?? id;
  }

  isOpen(): boolean {
    return this.open_;
  }

  async open(events: TransportEvents): Promise<void> {
    stopBleScan();

    try {
      this.device = await ble().connectToDevice(this.id, { timeout: 12000 });
    } catch (err) {
      throw new TransportError(
        this.kind,
        err instanceof Error ? err.message : 'Could not connect',
        'Check the adapter has power and is not already connected to another phone or app.',
      );
    }

    // A larger MTU keeps long responses (VIN, multi-frame DTC lists) in fewer
    // notifications. Failure here is harmless.
    try {
      await this.device.requestMTU(185);
    } catch {
      // Keep the default MTU.
    }

    await this.device.discoverAllServicesAndCharacteristics();
    const services = await this.device.services();
    const withChars = await Promise.all(
      services.map(async (s) => ({
        uuid: s.uuid,
        characteristics: await s.characteristics(),
      })),
    );

    this.profile = resolveProfile(this.device, withChars);
    if (!this.profile) {
      await this.close();
      throw new TransportError(
        this.kind,
        'This device does not expose a serial service',
        'It may not be an OBD adapter, or it may be a Classic Bluetooth adapter — try the Bluetooth tab instead.',
      );
    }

    this.monitor = this.profile.notify.monitor((error, characteristic) => {
      if (error) {
        events.onClose(error.message);
        return;
      }
      const value = characteristic?.value;
      if (!value) return;
      events.onData(Buffer.from(value, 'base64').toString('ascii'));
    });

    this.disconnectSub = this.device.onDisconnected(() => {
      this.open_ = false;
      events.onClose('The Bluetooth LE link dropped');
    });

    this.open_ = true;
  }

  async write(data: string): Promise<void> {
    const write = this.profile?.write;
    if (!write || !this.open_) {
      throw new TransportError(this.kind, 'Bluetooth LE link is not connected');
    }
    const payload = Buffer.from(data, 'ascii').toString('base64');
    if (write.isWritableWithoutResponse) {
      await write.writeWithoutResponse(payload);
    } else {
      await write.writeWithResponse(payload);
    }
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.monitor?.remove();
    this.monitor = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    try {
      if (this.device) await ble().cancelDeviceConnection(this.device.id);
    } catch {
      // Already disconnected.
    }
    this.device = null;
    this.profile = null;
  }
}
