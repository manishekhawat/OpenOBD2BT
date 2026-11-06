/**
 * Bluetooth Classic (RFCOMM / SPP) transport.
 *
 * Most older ELM327 adapters are Classic devices. Two quirks matter:
 *
 *  1. Cheap clones often ship a malformed SDP record, so Android's normal
 *     secure connect to the SPP UUID fails even though the device is paired.
 *     Connecting insecurely on RFCOMM channel 1 works where the secure path
 *     does not, so this transport tries secure first and falls back.
 *  2. An adapter accepts exactly one connection. A second app or phone holding
 *     it makes every connect fail, which we surface as a hint rather than a
 *     bare error, because it is the most common cause in practice.
 *
 * Adapters sold as "Bluetooth 4.0", "BLE" or "iOS compatible" are *not* Classic
 * devices: Android will pair them but SPP will never open. Those need the BLE
 * transport instead, and `isLikelyBleOnly` flags them so the UI can say so.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import type { BluetoothDevice } from 'react-native-bluetooth-classic';

import {
  type AdapterCandidate,
  type Transport,
  type TransportEvents,
  TransportError,
} from '../transport';

/**
 * The native library is loaded on first use rather than imported at the top.
 *
 * A module that throws while loading takes the whole bundle down with it, and
 * at that point no error boundary has mounted — the app simply closes with no
 * explanation. Deferring the load means a library that cannot initialise
 * breaks only the transport that needs it, reports why, and leaves the rest of
 * the app working. `import type` above is erased at compile time, so this file
 * pulls in nothing at load.
 */
type BluetoothClassicModule = typeof import('react-native-bluetooth-classic').default;

let cached: BluetoothClassicModule | null = null;
let loadFailure: string | null = null;

function native(): BluetoothClassicModule {
  if (cached) return cached;

  if (loadFailure === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const loaded = require('react-native-bluetooth-classic') as {
        default?: BluetoothClassicModule;
      };
      if (!loaded.default || typeof loaded.default.getBondedDevices !== 'function') {
        loadFailure = 'The Bluetooth module loaded but is missing its methods.';
      } else {
        cached = loaded.default;
        return cached;
      }
    } catch (err) {
      loadFailure = err instanceof Error ? err.message : String(err);
    }
  }

  throw new TransportError(
    'bt-classic',
    'Bluetooth support could not start',
    `${loadFailure} Bluetooth LE and Wi-Fi adapters are unaffected, and the demo vehicle still works.`,
  );
}

/** Whether the native library is usable, without throwing. For diagnostics. */
export function bluetoothModuleStatus(): { ok: boolean; reason: string | null } {
  try {
    native();
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: loadFailure };
  }
}

/** The library strips this delimiter, so it is re-appended on the way through. */
const PROMPT = '>';

/** Names used by adapters that are BLE-only despite appearing pairable. */
const BLE_ONLY_NAME_HINTS = [
  'BLE', 'IOS', 'V-LINK', 'VLINK', '4.0', 'LE-', 'OBDBLE',
];

export function isLikelyBleOnly(name: string): boolean {
  const upper = name.toUpperCase();
  return BLE_ONLY_NAME_HINTS.some((hint) => upper.includes(hint));
}

/**
 * Whether Android has granted what a connection needs.
 *
 * From Android 12 the Bluetooth calls throw a SecurityException when
 * BLUETOOTH_CONNECT has not been granted, and that exception surfaces inside
 * native code where it terminates the process rather than rejecting a promise.
 * So it is checked before calling, not caught afterwards.
 */
export async function hasConnectPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // The runtime permission only exists from API 31; before that the install
  // time permissions in the manifest are enough.
  if (Number(Platform.Version) < 31) return true;

  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  } catch {
    return false;
  }
}

export async function isBluetoothEnabled(): Promise<boolean> {
  try {
    return await native().isBluetoothEnabled();
  } catch {
    return false;
  }
}

/** Devices Android already has a pairing record for. */
export async function listPaired(): Promise<AdapterCandidate[]> {
  // Listing bonded devices needs the same permission as connecting to them.
  if (!(await hasConnectPermission())) return [];

  const devices = await native().getBondedDevices();
  return devices.map((d) => ({
    id: d.address,
    name: d.name || d.address,
    kind: 'bt-classic' as const,
    paired: true,
  }));
}

/** Discover unpaired devices in range. Requires BLUETOOTH_SCAN on Android 12+. */
export async function discoverClassic(): Promise<AdapterCandidate[]> {
  if (!(await hasConnectPermission())) {
    throw new TransportError(
      'bt-classic',
      'Bluetooth permission has not been granted',
      'Allow the Nearby devices permission, then scan again.',
    );
  }

  const devices = await native().startDiscovery();
  return devices.map((d) => ({
    id: d.address,
    name: d.name || d.address,
    kind: 'bt-classic' as const,
    paired: false,
  }));
}

export async function cancelDiscovery(): Promise<void> {
  try {
    await native().cancelDiscovery();
  } catch {
    // Discovery may already have finished; nothing to do.
  }
}

export class BluetoothClassicTransport implements Transport {
  readonly kind = 'bt-classic' as const;
  readonly id: string;
  readonly label: string;

  private device: BluetoothDevice | null = null;
  private subscription: { remove: () => void } | null = null;
  private open_ = false;

  constructor(address: string, name?: string) {
    this.id = address;
    this.label = name ?? address;
  }

  isOpen(): boolean {
    return this.open_;
  }

  async open(events: TransportEvents): Promise<void> {
    // Load the native library first: if it cannot start, this throws a
    // readable error here rather than failing somewhere less obvious later.
    native();

    if (!(await hasConnectPermission())) {
      throw new TransportError(
        this.kind,
        'Bluetooth permission has not been granted',
        'Android needs the Nearby devices permission before an app can open a Bluetooth connection. Allow it when asked, or turn it on in Settings under Apps, OBD Scout, Permissions.',
      );
    }

    if (!(await isBluetoothEnabled())) {
      throw new TransportError(
        this.kind,
        'Bluetooth is turned off',
        'Turn Bluetooth on, then try again.',
      );
    }

    // Secure first, then insecure. The insecure path is what rescues clones
    // with a broken service record.
    const attempts: { secure: boolean; note: string }[] = [
      { secure: true, note: 'secure RFCOMM' },
      { secure: false, note: 'insecure RFCOMM' },
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        this.device = await native().connectToDevice(this.id, {
          connectorType: 'rfcomm',
          delimiter: PROMPT,
          charset: 'ascii',
          // The native option is keyed "secure", not "secureSocket" — the
          // longer name is the enum's own identifier, not its JSON key, and
          // passing it means the value is dropped and the default (secure)
          // silently applies. Which defeats the whole point of the fallback.
          secure: attempt.secure,
        });
        break;
      } catch (err) {
        lastError = err;
        this.device = null;
      }
    }

    if (!this.device) {
      throw new TransportError(
        this.kind,
        describeConnectFailure(lastError),
        hintForConnectFailure(this.label),
      );
    }

    try {
      this.subscription = this.device.onDataReceived((event) => {
        // The delimiter is consumed by the native layer; put it back so the
        // ELM327 layer still sees a complete prompt-terminated response.
        events.onData(event.data + PROMPT);
      });
    } catch (err) {
      // A connection with nothing listening to it is useless and would hang
      // every command, so close it rather than leaving it half-open.
      await this.close();
      throw new TransportError(
        this.kind,
        'Connected, but could not listen for replies',
        err instanceof Error ? err.message : undefined,
      );
    }

    this.open_ = true;
  }

  async write(data: string): Promise<void> {
    if (!this.device || !this.open_) {
      throw new TransportError(this.kind, 'Bluetooth link is not connected');
    }
    await this.device.write(data, 'ascii');
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.subscription?.remove();
    this.subscription = null;
    try {
      await this.device?.disconnect();
    } catch {
      // Already gone.
    }
    this.device = null;
  }
}

function describeConnectFailure(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/socket|closed|read failed/i.test(text)) {
    return 'The adapter refused the connection';
  }
  if (/permission/i.test(text)) {
    return 'Bluetooth permission was denied';
  }
  if (/timed? ?out/i.test(text)) {
    return 'The adapter did not answer in time';
  }
  return text || 'Could not open the Bluetooth link';
}

function hintForConnectFailure(name: string): string {
  if (isLikelyBleOnly(name)) {
    return `"${name}" looks like a Bluetooth LE adapter. Android lets you pair it, but it does not speak Classic serial — connect it from the Bluetooth LE tab instead.`;
  }
  return 'Most often another app or phone is already holding the adapter, or it needs the ignition on. Close other OBD apps, unplug the adapter for 10 seconds, switch the ignition on and retry.';
}
