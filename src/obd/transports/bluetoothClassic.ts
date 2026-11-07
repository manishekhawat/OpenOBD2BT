/**
 * Bluetooth Classic (RFCOMM / SPP) transport.
 *
 * Built on the native module in this project's `modules/obd-bluetooth` rather
 * than a published library. The libraries available for Bluetooth Classic are
 * written against React Native's old bridge, and under the bridgeless runtime
 * their failure modes end the process instead of returning an error — which is
 * not something a transport layer can defend against from JavaScript.
 *
 * The native side tries a secure RFCOMM socket, then an insecure one, then a
 * direct connection to channel 1. The second is what cheap clones with a
 * malformed service record need, and the third rescues the few that are
 * broken enough that no service lookup finds the serial profile at all.
 *
 * Adapters sold as "Bluetooth 4.0", "BLE" or "iOS compatible" are not Classic
 * devices: Android will pair them but SPP will never open. `isLikelyBleOnly`
 * flags those so the UI can point at the right tab.
 */

import { PermissionsAndroid, Platform } from 'react-native';

import * as ObdBluetooth from '../../../modules/obd-bluetooth';
import {
  type AdapterCandidate,
  type Transport,
  type TransportEvents,
  TransportError,
} from '../transport';

/** Names used by adapters that are BLE-only despite appearing pairable. */
const BLE_ONLY_NAME_HINTS = ['BLE', 'IOS', 'V-LINK', 'VLINK', '4.0', 'LE-', 'OBDBLE'];

export function isLikelyBleOnly(name: string): boolean {
  const upper = name.toUpperCase();
  return BLE_ONLY_NAME_HINTS.some((hint) => upper.includes(hint));
}

/** Whether the native module is present. For the diagnostics panel. */
export function bluetoothModuleStatus(): { ok: boolean; reason: string | null } {
  if (!ObdBluetooth.isAvailable()) {
    return { ok: false, reason: 'The Bluetooth module is not present in this build.' };
  }
  if (!ObdBluetooth.isSupported()) {
    return { ok: false, reason: 'This phone reports no Bluetooth adapter.' };
  }
  return { ok: true, reason: null };
}

/**
 * From Android 12 the Bluetooth calls raise a SecurityException without this
 * permission. The native side checks it too; this is the JavaScript-side
 * check so the UI can ask before trying.
 */
export async function hasConnectPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 31) return true;

  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  } catch {
    return false;
  }
}

export async function isBluetoothEnabled(): Promise<boolean> {
  return ObdBluetooth.isEnabled();
}

/**
 * Devices Android already has a pairing record for.
 *
 * Only paired devices are listed: an ELM327 has to be paired before it will
 * accept a serial connection anyway, so scanning for unpaired ones would add
 * broadcast receivers and the Android 14 export-flag rules they bring, for no
 * practical gain.
 */
export async function listPaired(): Promise<AdapterCandidate[]> {
  if (!ObdBluetooth.isAvailable()) return [];
  if (!(await hasConnectPermission())) return [];

  try {
    const devices = await ObdBluetooth.listPaired();
    return devices.map((device) => ({
      id: device.address,
      name: device.name || device.address,
      kind: 'bt-classic' as const,
      paired: true,
    }));
  } catch {
    return [];
  }
}

export class BluetoothClassicTransport implements Transport {
  readonly kind = 'bt-classic' as const;
  readonly id: string;
  readonly label: string;

  private dataSub: ObdBluetooth.Subscription | null = null;
  private closeSub: ObdBluetooth.Subscription | null = null;
  private open_ = false;
  /** Which strategy connected, for the session log. */
  mode: ObdBluetooth.ConnectMode | null = null;

  constructor(address: string, name?: string) {
    this.id = address;
    this.label = name ?? address;
  }

  isOpen(): boolean {
    return this.open_;
  }

  async open(events: TransportEvents): Promise<void> {
    if (!ObdBluetooth.isAvailable()) {
      throw new TransportError(
        this.kind,
        'Bluetooth support is missing from this build',
        'Bluetooth LE and Wi-Fi adapters still work, as does the demo vehicle.',
      );
    }

    if (!(await hasConnectPermission())) {
      throw new TransportError(
        this.kind,
        'Bluetooth permission has not been granted',
        'Android needs the Nearby devices permission before an app can open a Bluetooth connection. Allow it when asked, or turn it on in Settings under Apps, OBD Scout, Permissions.',
      );
    }

    if (!ObdBluetooth.isEnabled()) {
      throw new TransportError(
        this.kind,
        'Bluetooth is turned off',
        'Turn Bluetooth on, then try again.',
      );
    }

    // Listeners first: a reply can arrive the instant the socket opens.
    this.dataSub = ObdBluetooth.onData(({ data }) => {
      events.onData(data);
    });
    this.closeSub = ObdBluetooth.onClose(({ reason }) => {
      this.open_ = false;
      events.onClose(reason);
    });

    try {
      const { mode } = await ObdBluetooth.connect(this.id, true);
      this.mode = mode;
      this.open_ = true;
    } catch (err) {
      await this.close();
      throw new TransportError(
        this.kind,
        describeConnectFailure(err),
        hintForConnectFailure(this.label),
      );
    }
  }

  async write(data: string): Promise<void> {
    if (!this.open_) {
      throw new TransportError(this.kind, 'Bluetooth link is not connected');
    }
    await ObdBluetooth.write(data);
  }

  async close(): Promise<void> {
    this.open_ = false;

    this.dataSub?.remove();
    this.dataSub = null;
    this.closeSub?.remove();
    this.closeSub = null;

    try {
      await ObdBluetooth.disconnect();
    } catch {
      // Already gone.
    }
  }
}

function describeConnectFailure(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);

  if (/permission/i.test(text)) return 'Bluetooth permission was denied';
  if (/turned off/i.test(text)) return 'Bluetooth is turned off';
  if (/socket|closed|read failed|refused/i.test(text)) {
    return 'The adapter refused the connection';
  }
  if (/timed? ?out/i.test(text)) return 'The adapter did not answer in time';
  return text || 'Could not open the Bluetooth link';
}

function hintForConnectFailure(name: string): string {
  if (isLikelyBleOnly(name)) {
    return `"${name}" looks like a Bluetooth LE adapter. Android lets you pair it, but it does not speak Classic serial — connect it from the Bluetooth LE tab instead.`;
  }
  return 'All three connection methods were tried. Most often another app or phone is already holding the adapter, or it needs the ignition on: close other OBD apps, unplug the adapter for ten seconds, switch the ignition on and retry.';
}
