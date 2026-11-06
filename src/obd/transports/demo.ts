/**
 * Demo transport — a built-in ELM327 and vehicle simulator.
 *
 * It answers the same AT and OBD commands a real adapter would, with values
 * from a simulated drive cycle, so every screen works with no hardware. It is
 * also what the unit tests run against, which means the decoding path is
 * covered end to end rather than only in isolation.
 */

import { hex2 } from '../pids';
import {
  type Transport,
  type TransportEvents,
} from '../transport';

/** Mode 01 PIDs the simulated ECU answers. */
const SUPPORTED_PIDS = [
  0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x1c, 0x1f, 0x20, 0x21, 0x2f, 0x30, 0x31, 0x33, 0x3c, 0x40, 0x42,
  0x43, 0x44, 0x45, 0x46, 0x4c, 0x4d, 0x4e, 0x51, 0x5c, 0x5e,
];

const DEMO_VIN = 'MA1TA2YS3P4567890';
const DEMO_DTCS: [number, number][] = [
  [0x03, 0x01], // P0301 — cylinder 1 misfire
  [0x04, 0x20], // P0420 — catalyst efficiency below threshold
  [0x01, 0x71], // P0171 — system too lean, bank 1
];
const DEMO_PENDING: [number, number][] = [
  [0x01, 0x33], // P0133 — O2 sensor slow response
];

interface VehicleState {
  speedKmh: number;
  rpm: number;
  throttlePct: number;
  loadPct: number;
  coolantC: number;
  intakeC: number;
  mafGs: number;
  mapKpa: number;
  fuelLevelPct: number;
  voltage: number;
  oilC: number;
  fuelRateLh: number;
}

/** Advance a repeating 120-second drive cycle. */
function simulate(elapsedMs: number, clearedAtMs: number | null): VehicleState {
  const t = (elapsedMs / 1000) % 120;
  const sinceStart = elapsedMs / 1000;

  let speed: number;
  let throttle: number;
  if (t < 15) {
    speed = 0;
    throttle = 13;
  } else if (t < 45) {
    const k = (t - 15) / 30;
    speed = 80 * k;
    throttle = 13 + 45 * k;
  } else if (t < 90) {
    speed = 78 + Math.sin(t / 3) * 4;
    throttle = 24 + Math.sin(t / 2) * 5;
  } else if (t < 110) {
    const k = 1 - (t - 90) / 20;
    speed = 80 * k;
    throttle = 13;
  } else {
    speed = 0;
    throttle = 13;
  }

  // Idle at ~820 rpm; above that, assume a gear ratio that keeps revs sensible.
  const rpm = speed < 2 ? 820 + Math.sin(t) * 25 : 1100 + speed * 28 + Math.sin(t * 2) * 60;
  const load = Math.min(95, 18 + throttle * 0.9 + (speed > 2 ? 12 : 0));

  // Coolant warms from ambient to thermostat temperature over three minutes.
  const warmup = Math.min(1, sinceStart / 180);
  const coolant = 24 + 66 * warmup + Math.sin(sinceStart / 20) * 1.5;

  const maf = (rpm / 1000) * (load / 100) * 11 + 1.2;

  return {
    speedKmh: speed,
    rpm,
    throttlePct: throttle,
    loadPct: load,
    coolantC: coolant,
    intakeC: 28 + Math.sin(sinceStart / 40) * 3,
    mafGs: maf,
    mapKpa: speed < 2 ? 32 : 38 + throttle * 0.75,
    // Falls slowly, and resets with a cleared session so the screen changes.
    fuelLevelPct: Math.max(8, 72 - (sinceStart / 60) * 0.4),
    voltage: speed < 2 ? 14.1 : 14.3 + Math.sin(sinceStart / 15) * 0.15,
    oilC: 24 + 72 * Math.min(1, sinceStart / 240),
    fuelRateLh: (maf / 14.7) * 3600 / 745 + (clearedAtMs ? 0 : 0),
  };
}

/** Build a 4-byte Mode 01 support bitmap for one block of 32 PIDs. */
function supportBitmap(basePid: number, supported: number[]): number[] {
  const bytes = [0, 0, 0, 0];
  for (const pid of supported) {
    const offset = pid - basePid - 1;
    if (offset < 0 || offset > 31) continue;
    const byteIndex = Math.floor(offset / 8);
    const bit = offset % 8;
    const current = bytes[byteIndex] ?? 0;
    bytes[byteIndex] = current | (0x80 >> bit);
  }
  return bytes;
}

/** Wrap payload bytes in an ISO-TP frame (or frames) with a 7E8 header. */
function frame(payload: number[]): string {
  const hex = payload.map(hex2).join('');
  if (payload.length <= 7) {
    // Single frame: a full PCI byte of 0x0L, where L is the payload length.
    return `7E8${hex2(payload.length)}${hex}\r`;
  }

  const lines: string[] = [];
  const total = payload.length.toString(16).toUpperCase().padStart(3, '0');
  lines.push(`7E81${total}${payload.slice(0, 6).map(hex2).join('')}\r`);

  let seq = 1;
  for (let i = 6; i < payload.length; i += 7) {
    const chunk = payload.slice(i, i + 7);
    lines.push(`7E82${(seq % 16).toString(16).toUpperCase()}${chunk.map(hex2).join('')}\r`);
    seq += 1;
  }
  return lines.join('');
}

export class DemoTransport implements Transport {
  readonly kind = 'demo' as const;
  readonly id = 'demo';
  readonly label = 'Demo vehicle';

  private events: TransportEvents | null = null;
  private open_ = false;
  private readonly startedAt = Date.now();
  private clearedAt: number | null = null;
  private dtcs = [...DEMO_DTCS];
  private pending = [...DEMO_PENDING];

  isOpen(): boolean {
    return this.open_;
  }

  async open(events: TransportEvents): Promise<void> {
    this.events = events;
    this.open_ = true;
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.events = null;
  }

  async write(data: string): Promise<void> {
    if (!this.open_) throw new Error('Demo transport is not open');
    const command = data.replace(/[\r\n>]/g, '').replace(/\s+/g, '').toUpperCase();
    const reply = this.respond(command);
    // A small delay keeps the UI's loading states honest.
    setTimeout(() => this.events?.onData(`${reply}\r>`), 35);
  }

  private state(): VehicleState {
    return simulate(Date.now() - this.startedAt, this.clearedAt);
  }

  private respond(command: string): string {
    if (command.startsWith('AT')) return this.respondAt(command);

    const service = command.slice(0, 2);
    const pid = command.length >= 4 ? Number.parseInt(command.slice(2, 4), 16) : undefined;

    switch (service) {
      case '01':
        return pid === undefined ? 'NO DATA' : this.mode01(pid);
      case '02':
        return pid === undefined ? 'NO DATA' : this.mode02(pid);
      case '03':
        return this.dtcList(0x43, this.dtcs);
      case '07':
        return this.dtcList(0x47, this.pending);
      case '0A':
        return this.dtcList(0x4a, []);
      case '04':
        this.dtcs = [];
        this.pending = [];
        this.clearedAt = Date.now();
        return frame([0x44]);
      case '09':
        return pid === undefined ? 'NO DATA' : this.mode09(pid);
      default:
        return 'NO DATA';
    }
  }

  private respondAt(command: string): string {
    if (command === 'ATZ') return 'ELM327 v1.5';
    if (command === 'ATI') return 'ELM327 v1.5';
    if (command === 'ATDP') return 'ISO 15765-4 (CAN 11/500)';
    if (command === 'ATDPN') return 'A6';
    if (command === 'ATRV') return `${this.state().voltage.toFixed(1)}V`;
    // Everything else is a configuration command the simulator simply accepts.
    return 'OK';
  }

  private dtcList(responseByte: number, codes: [number, number][]): string {
    if (codes.length === 0) return frame([responseByte, 0x00]);
    const payload = [responseByte, codes.length];
    for (const [a, b] of codes) payload.push(a, b);
    return frame(payload);
  }

  private mode01(pid: number): string {
    const s = this.state();

    if (pid === 0x00) return frame([0x41, 0x00, ...supportBitmap(0x00, SUPPORTED_PIDS)]);
    if (pid === 0x20) return frame([0x41, 0x20, ...supportBitmap(0x20, SUPPORTED_PIDS)]);
    if (pid === 0x40) return frame([0x41, 0x40, ...supportBitmap(0x40, SUPPORTED_PIDS)]);
    if (pid === 0x60) return frame([0x41, 0x60, ...supportBitmap(0x60, SUPPORTED_PIDS)]);

    const data = this.valueBytes(pid, s);
    if (!data) return 'NO DATA';
    return frame([0x41, pid, ...data]);
  }

  /** Freeze frame: a snapshot taken when the misfire was recorded. */
  private mode02(pid: number): string {
    const frozen: VehicleState = {
      speedKmh: 42, rpm: 2480, throttlePct: 31, loadPct: 58,
      coolantC: 91, intakeC: 34, mafGs: 14.2, mapKpa: 61,
      fuelLevelPct: 54, voltage: 14.2, oilC: 96, fuelRateLh: 5.1,
    };
    if (pid === 0x02) return frame([0x42, 0x02, 0x03, 0x01]);
    const data = this.valueBytes(pid, frozen);
    if (!data) return 'NO DATA';
    return frame([0x42, pid, ...data]);
  }

  private mode09(pid: number): string {
    // Real ECUs pad each item out to its fixed width with 0x00.
    const ascii = (text: string, width: number): number[] => {
      const bytes = [...text].map((c) => c.charCodeAt(0));
      while (bytes.length < width) bytes.push(0x00);
      return bytes.slice(0, width);
    };

    if (pid === 0x00) return frame([0x49, 0x00, 0x55, 0x40, 0x00, 0x00]);
    if (pid === 0x02) return frame([0x49, 0x02, 0x01, ...ascii(DEMO_VIN, 17)]);
    if (pid === 0x04) return frame([0x49, 0x04, 0x01, ...ascii('OBDSCOUTDEMO0001', 16)]);
    if (pid === 0x0a) return frame([0x49, 0x0a, 0x01, ...ascii('ECM-EngineControl', 20)]);
    return 'NO DATA';
  }

  /** Encode one Mode 01 value back into its standard byte form. */
  private valueBytes(pid: number, s: VehicleState): number[] | null {
    const clamp = (n: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, Math.round(n)));
    const u16 = (n: number): number[] => {
      const v = clamp(n, 0, 65535);
      return [Math.floor(v / 256), v % 256];
    };

    switch (pid) {
      case 0x01: {
        // MIL on with three stored faults, several monitors still running.
        const a = this.dtcs.length > 0 ? 0x80 | this.dtcs.length : 0x00;
        return [a, 0x07, 0xe5, this.dtcs.length > 0 ? 0x21 : 0x00];
      }
      case 0x03:
        return [0x02, 0x00]; // closed loop, using oxygen sensor
      case 0x04:
        return [clamp((s.loadPct * 255) / 100, 0, 255)];
      case 0x05:
        return [clamp(s.coolantC + 40, 0, 255)];
      case 0x06:
        return [clamp(128 + 3.2 * 1.28, 0, 255)];
      case 0x07:
        return [clamp(128 + 6.1 * 1.28, 0, 255)];
      case 0x0b:
        return [clamp(s.mapKpa, 0, 255)];
      case 0x0c:
        return u16(s.rpm * 4);
      case 0x0d:
        return [clamp(s.speedKmh, 0, 255)];
      case 0x0e:
        return [clamp((12 + 2) * 2 + 128 - 128, 0, 255)];
      case 0x0f:
        return [clamp(s.intakeC + 40, 0, 255)];
      case 0x10:
        return u16(s.mafGs * 100);
      case 0x11:
        return [clamp((s.throttlePct * 255) / 100, 0, 255)];
      case 0x1c:
        return [0x06]; // EOBD
      case 0x1f:
        return u16((Date.now() - this.startedAt) / 1000);
      case 0x21:
        return u16(this.dtcs.length > 0 ? 143 : 0);
      case 0x2f:
        return [clamp((s.fuelLevelPct * 255) / 100, 0, 255)];
      case 0x30:
        return [this.clearedAt ? 0 : 24];
      case 0x31:
        return u16(this.clearedAt ? 0 : 1680);
      case 0x33:
        return [99];
      case 0x3c:
        return u16((420 + s.loadPct * 2 + 40) * 10);
      case 0x42:
        return u16(s.voltage * 1000);
      case 0x43:
        return u16((s.loadPct * 255) / 100);
      case 0x44:
        return u16(0.998 * 32768);
      case 0x45:
        return [clamp((Math.max(0, s.throttlePct - 13) * 255) / 100, 0, 255)];
      case 0x46:
        return [clamp(29 + 40, 0, 255)];
      case 0x4c:
        return [clamp((s.throttlePct * 255) / 100, 0, 255)];
      case 0x4d:
        return u16(this.dtcs.length > 0 ? 47 : 0);
      case 0x4e:
        return u16(this.clearedAt ? Math.floor((Date.now() - this.clearedAt) / 60000) : 2210);
      case 0x51:
        return [0x01]; // petrol
      case 0x5c:
        return [clamp(s.oilC + 40, 0, 255)];
      case 0x5e:
        return u16(s.fuelRateLh * 20);
      default:
        return null;
    }
  }
}
