/**
 * Wi-Fi (TCP) transport.
 *
 * Wi-Fi ELM327 adapters run a telnet-style server on their own access point.
 * The phone must be joined to that access point first; the adapter is then at a
 * fixed address, almost always 192.168.0.10:35000 or 192.168.4.1:35000.
 */

import type TcpSocketType from 'react-native-tcp-socket';

import {
  type Transport,
  type TransportEvents,
  TransportError,
} from '../transport';

/**
 * Loaded on first use. A library that throws while loading would otherwise
 * take the whole bundle down before anything could report it.
 */
type TcpModule = typeof TcpSocketType;

let cached: TcpModule | null = null;
let loadFailure: string | null = null;

function tcp(): TcpModule {
  if (cached) return cached;

  if (loadFailure === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const loaded = require('react-native-tcp-socket') as { default?: TcpModule };
      if (!loaded.default || typeof loaded.default.createConnection !== 'function') {
        loadFailure = 'The networking module loaded but is missing its methods.';
      } else {
        cached = loaded.default;
        return cached;
      }
    } catch (err) {
      loadFailure = err instanceof Error ? err.message : String(err);
    }
  }

  throw new TransportError(
    'wifi',
    'Wi-Fi support could not start',
    `${loadFailure} Bluetooth adapters are unaffected.`,
  );
}

/** Whether the native library is usable, without throwing. For diagnostics. */
export function wifiModuleStatus(): { ok: boolean; reason: string | null } {
  try {
    tcp();
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: loadFailure };
  }
}

/** Addresses worth trying when the user does not know theirs. */
export const COMMON_WIFI_ENDPOINTS = [
  { host: '192.168.0.10', port: 35000, note: 'Most ELM327 Wi-Fi adapters' },
  { host: '192.168.4.1', port: 35000, note: 'ESP32-based adapters' },
  { host: '192.168.1.5', port: 35000, note: 'Some V-Link and Vgate models' },
  { host: '192.168.0.10', port: 23, note: 'Adapters on the telnet port' },
] as const;

type Socket = ReturnType<TcpModule["createConnection"]>;

export class WifiTransport implements Transport {
  readonly kind = 'wifi' as const;
  readonly id: string;
  readonly label: string;

  private readonly host: string;
  private readonly port: number;
  private socket: Socket | null = null;
  private open_ = false;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.id = `${host}:${port}`;
    this.label = `${host}:${port}`;
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(events: TransportEvents): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.socket?.destroy();
        } catch {
          // Nothing to clean up.
        }
        reject(
          new TransportError(
            this.kind,
            `No answer from ${this.id}`,
            'Join the adapter\'s own Wi-Fi network first, then check the address. Most adapters are at 192.168.0.10:35000.',
          ),
        );
      }, 8000);

      const socket = tcp().createConnection(
        { host: this.host, port: this.port, tls: false },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.open_ = true;
          resolve();
        },
      );

      socket.setNoDelay(true);

      socket.on('data', (data) => {
        events.onData(
          typeof data === 'string' ? data : Buffer.from(data).toString('ascii'),
        );
      });

      socket.on('error', (error: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new TransportError(
              this.kind,
              error.message || `Could not reach ${this.id}`,
              'Check the phone is joined to the adapter\'s Wi-Fi network, not mobile data.',
            ),
          );
          return;
        }
        this.open_ = false;
        events.onClose(error.message || 'Wi-Fi link error');
      });

      socket.on('close', () => {
        if (this.open_) {
          this.open_ = false;
          events.onClose('The Wi-Fi link closed');
        }
      });

      this.socket = socket;
    });
  }

  write(data: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.socket || !this.open_) {
        reject(new TransportError(this.kind, 'Wi-Fi link is not connected'));
        return;
      }
      this.socket.write(data, 'ascii', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.open_ = false;
    try {
      this.socket?.destroy();
    } catch {
      // Already closed.
    }
    this.socket = null;
  }
}
