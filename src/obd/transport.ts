/**
 * Transport abstraction for ELM327-compatible adapters.
 *
 * Every physical link (Bluetooth Classic SPP, Bluetooth LE GATT, Wi-Fi TCP,
 * and the built-in demo simulator) exposes the same byte-stream interface, so
 * the ELM327 protocol layer above does not care how bytes travel.
 */

export type TransportKind = 'bt-classic' | 'ble' | 'wifi' | 'demo';

export interface AdapterCandidate {
  /** Stable handle used to reconnect: MAC address, BLE id, or "host:port". */
  id: string;
  name: string;
  kind: TransportKind;
  /** BT Classic only: whether Android already has a pairing record. */
  paired?: boolean;
  /** BLE only: signal strength when discovered. */
  rssi?: number;
}

export interface TransportEvents {
  /** Raw bytes arrived from the adapter. */
  onData: (chunk: string) => void;
  /** The link dropped. `reason` is for display and the session log. */
  onClose: (reason: string) => void;
}

export interface Transport {
  readonly kind: TransportKind;
  readonly id: string;
  readonly label: string;
  /** True between a successful open() and any close. */
  isOpen(): boolean;
  open(events: TransportEvents): Promise<void>;
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export class TransportError extends Error {
  readonly kind: TransportKind;
  /** Short, actionable hint shown under the error on the Connect screen. */
  readonly hint?: string;

  constructor(kind: TransportKind, message: string, hint?: string) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
    this.hint = hint;
  }
}
