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

import RNBluetoothClassic, {
  type BluetoothDevice,
} from 'react-native-bluetooth-classic';

import {
  type AdapterCandidate,
  type Transport,
  type TransportEvents,
  TransportError,
} from '../transport';

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

export async function isBluetoothEnabled(): Promise<boolean> {
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch {
    return false;
  }
}

/** Devices Android already has a pairing record for. */
export async function listPaired(): Promise<AdapterCandidate[]> {
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map((d) => ({
    id: d.address,
    name: d.name || d.address,
    kind: 'bt-classic' as const,
    paired: true,
  }));
}

/** Discover unpaired devices in range. Requires BLUETOOTH_SCAN on Android 12+. */
export async function discoverClassic(): Promise<AdapterCandidate[]> {
  const devices = await RNBluetoothClassic.startDiscovery();
  return devices.map((d) => ({
    id: d.address,
    name: d.name || d.address,
    kind: 'bt-classic' as const,
    paired: false,
  }));
}

export async function cancelDiscovery(): Promise<void> {
  try {
    await RNBluetoothClassic.cancelDiscovery();
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
        this.device = await RNBluetoothClassic.connectToDevice(this.id, {
          connectorType: 'rfcomm',
          delimiter: PROMPT,
          charset: 'ascii',
          secureSocket: attempt.secure,
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

    this.subscription = this.device.onDataReceived((event) => {
      // The delimiter is consumed by the native layer; put it back so the
      // ELM327 layer still sees a complete prompt-terminated response.
      events.onData(event.data + PROMPT);
    });

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
