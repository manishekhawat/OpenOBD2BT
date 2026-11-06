/**
 * Mode 01 / 02 parameter definitions.
 *
 * Scaling formulas follow the SAE J1979 / ISO 15031-5 standard, which defines
 * exactly one correct conversion per PID. Only PIDs a vehicle reports as
 * supported (see pidSupport.ts) are ever polled.
 */

export type PidCategory =
  | 'engine'
  | 'fuel'
  | 'air'
  | 'temperature'
  | 'electrical'
  | 'emissions'
  | 'turbo'
  | 'dpf'
  | 'torque'
  | 'status'
  | 'trip';

/** How often a reading is worth re-reading, used by the poll scheduler. */
export type PidRate = 'fast' | 'medium' | 'slow';

export type VehicleType = 'car' | 'motorcycle' | 'scooter' | 'truck';

export interface PidDefinition {
  /** Service (mode) this belongs to: 1 for live data. */
  service: 1;
  pid: number;
  /** Full name, as shown in lists. */
  name: string;
  /** Compact name for gauges and chart legends. */
  short: string;
  unit: string;
  /** Expected payload length in bytes, after the PID echo. */
  bytes: number;
  min: number;
  max: number;
  rate: PidRate;
  category: PidCategory;
  /** Decimal places to show. */
  precision: number;
  /** Returns the scaled value, or null when the payload is too short. */
  decode: (data: number[]) => number | null;
  /** Vehicle types this is worth offering on. Undefined means all. */
  only?: VehicleType[];
  /**
   * A second quantity carried in the same response — oxygen sensors report a
   * voltage and a fuel trim together, for instance.
   */
  secondary?: {
    name: string;
    unit: string;
    precision: number;
    decode: (data: number[]) => number | null;
  };
  /**
   * Set where the byte layout is documented but this app has not been able to
   * confirm it against a vehicle. The UI marks these, because a confidently
   * wrong number is worse than a flagged one.
   */
  unverified?: boolean;
}

const u8 = (d: number[], i: number): number | null => {
  const v = d[i];
  return v === undefined ? null : v;
};

const u16 = (d: number[], i: number): number | null => {
  const hi = d[i];
  const lo = d[i + 1];
  if (hi === undefined || lo === undefined) return null;
  return hi * 256 + lo;
};

const u32 = (d: number[], i: number): number | null => {
  const a = d[i];
  const b = d[i + 1];
  const c = d[i + 2];
  const e = d[i + 3];
  if (a === undefined || b === undefined || c === undefined || e === undefined) return null;
  return a * 16777216 + b * 65536 + c * 256 + e;
};

/** A*100/255 — the standard percentage scaling. */
const pct255 = (d: number[]): number | null => {
  const a = u8(d, 0);
  return a === null ? null : (a * 100) / 255;
};

/** (A-128)*100/128 — the standard signed trim scaling. */
const trim = (d: number[]): number | null => {
  const a = u8(d, 0);
  return a === null ? null : ((a - 128) * 100) / 128;
};

/** A-40 — the standard temperature scaling. */
const tempA = (d: number[]): number | null => {
  const a = u8(d, 0);
  return a === null ? null : a - 40;
};

function def(d: PidDefinition): PidDefinition {
  return d;
}

export const PID_DEFINITIONS: PidDefinition[] = [
  def({
    service: 1, pid: 0x04, name: 'Calculated engine load', short: 'Load',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'medium', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x05, name: 'Engine coolant temperature', short: 'Coolant',
    unit: '°C', bytes: 1, min: -40, max: 215, rate: 'medium', category: 'temperature',
    precision: 0, decode: tempA,
  }),
  def({
    service: 1, pid: 0x06, name: 'Short term fuel trim, bank 1', short: 'STFT B1',
    unit: '%', bytes: 1, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim,
  }),
  def({
    service: 1, pid: 0x07, name: 'Long term fuel trim, bank 1', short: 'LTFT B1',
    unit: '%', bytes: 1, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim,
  }),
  def({
    service: 1, pid: 0x08, name: 'Short term fuel trim, bank 2', short: 'STFT B2',
    unit: '%', bytes: 1, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim, only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x09, name: 'Long term fuel trim, bank 2', short: 'LTFT B2',
    unit: '%', bytes: 1, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim, only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x0a, name: 'Fuel pressure (gauge)', short: 'Fuel press',
    unit: 'kPa', bytes: 1, min: 0, max: 765, rate: 'slow', category: 'fuel',
    precision: 0, decode: (d) => { const a = u8(d, 0); return a === null ? null : a * 3; },
  }),
  def({
    service: 1, pid: 0x0b, name: 'Intake manifold absolute pressure', short: 'MAP',
    unit: 'kPa', bytes: 1, min: 0, max: 255, rate: 'medium', category: 'air',
    precision: 0, decode: (d) => u8(d, 0),
  }),
  def({
    service: 1, pid: 0x0c, name: 'Engine speed', short: 'RPM',
    unit: 'rpm', bytes: 2, min: 0, max: 16383.75, rate: 'fast', category: 'engine',
    precision: 0, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 4; },
  }),
  def({
    service: 1, pid: 0x0d, name: 'Vehicle speed', short: 'Speed',
    unit: 'km/h', bytes: 1, min: 0, max: 255, rate: 'fast', category: 'engine',
    precision: 0, decode: (d) => u8(d, 0),
  }),
  def({
    service: 1, pid: 0x0e, name: 'Timing advance', short: 'Timing',
    unit: '°', bytes: 1, min: -64, max: 63.5, rate: 'medium', category: 'engine',
    precision: 1, decode: (d) => { const a = u8(d, 0); return a === null ? null : a / 2 - 64; },
  }),
  def({
    service: 1, pid: 0x0f, name: 'Intake air temperature', short: 'Intake air',
    unit: '°C', bytes: 1, min: -40, max: 215, rate: 'medium', category: 'temperature',
    precision: 0, decode: tempA,
  }),
  def({
    service: 1, pid: 0x10, name: 'Mass air flow rate', short: 'MAF',
    unit: 'g/s', bytes: 2, min: 0, max: 655.35, rate: 'fast', category: 'air',
    precision: 2, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 100; },
  }),
  def({
    service: 1, pid: 0x11, name: 'Throttle position', short: 'Throttle',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'fast', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x1f, name: 'Run time since engine start', short: 'Run time',
    unit: 's', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'trip',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x21, name: 'Distance travelled with MIL on', short: 'Dist MIL',
    unit: 'km', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'emissions',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x22, name: 'Fuel rail pressure (rel. to manifold)', short: 'Rail press',
    unit: 'kPa', bytes: 2, min: 0, max: 5177.265, rate: 'slow', category: 'fuel',
    precision: 1, decode: (d) => { const v = u16(d, 0); return v === null ? null : v * 0.079; },
  }),
  def({
    service: 1, pid: 0x23, name: 'Fuel rail gauge pressure', short: 'Rail gauge',
    unit: 'kPa', bytes: 2, min: 0, max: 655350, rate: 'slow', category: 'fuel',
    precision: 0, decode: (d) => { const v = u16(d, 0); return v === null ? null : v * 10; },
  }),
  def({
    service: 1, pid: 0x2c, name: 'Commanded EGR', short: 'EGR cmd',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'slow', category: 'emissions',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x2d, name: 'EGR error', short: 'EGR err',
    unit: '%', bytes: 1, min: -100, max: 99.2, rate: 'slow', category: 'emissions',
    precision: 1, decode: trim,
  }),
  def({
    service: 1, pid: 0x2e, name: 'Commanded evaporative purge', short: 'EVAP purge',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'slow', category: 'emissions',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x2f, name: 'Fuel tank level input', short: 'Fuel level',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'slow', category: 'fuel',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x30, name: 'Warm-ups since codes cleared', short: 'Warm-ups',
    unit: '', bytes: 1, min: 0, max: 255, rate: 'slow', category: 'emissions',
    precision: 0, decode: (d) => u8(d, 0),
  }),
  def({
    service: 1, pid: 0x31, name: 'Distance since codes cleared', short: 'Dist cleared',
    unit: 'km', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'emissions',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x33, name: 'Absolute barometric pressure', short: 'Baro',
    unit: 'kPa', bytes: 1, min: 0, max: 255, rate: 'slow', category: 'air',
    precision: 0, decode: (d) => u8(d, 0),
  }),
  def({
    service: 1, pid: 0x3c, name: 'Catalyst temperature, bank 1 sensor 1', short: 'Cat B1S1',
    unit: '°C', bytes: 2, min: -40, max: 6513.5, rate: 'slow', category: 'temperature',
    precision: 1, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 10 - 40; },
    only: ['car', 'truck', 'motorcycle'],
  }),
  def({
    service: 1, pid: 0x3d, name: 'Catalyst temperature, bank 1 sensor 2', short: 'Cat B1S2',
    unit: '°C', bytes: 2, min: -40, max: 6513.5, rate: 'slow', category: 'temperature',
    precision: 1, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 10 - 40; },
    only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x42, name: 'Control module voltage', short: 'ECU volts',
    unit: 'V', bytes: 2, min: 0, max: 65.535, rate: 'medium', category: 'electrical',
    precision: 2, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 1000; },
  }),
  def({
    service: 1, pid: 0x43, name: 'Absolute load value', short: 'Abs load',
    unit: '%', bytes: 2, min: 0, max: 25700, rate: 'medium', category: 'engine',
    precision: 1, decode: (d) => { const v = u16(d, 0); return v === null ? null : (v * 100) / 255; },
  }),
  def({
    service: 1, pid: 0x44, name: 'Commanded air-fuel equivalence ratio', short: 'Lambda cmd',
    unit: 'λ', bytes: 2, min: 0, max: 2, rate: 'medium', category: 'fuel',
    precision: 3, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 32768; },
  }),
  def({
    service: 1, pid: 0x45, name: 'Relative throttle position', short: 'Throttle rel',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'fast', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x46, name: 'Ambient air temperature', short: 'Ambient',
    unit: '°C', bytes: 1, min: -40, max: 215, rate: 'slow', category: 'temperature',
    precision: 0, decode: tempA,
  }),
  def({
    service: 1, pid: 0x47, name: 'Absolute throttle position B', short: 'Throttle B',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'medium', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x49, name: 'Accelerator pedal position D', short: 'Pedal D',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'fast', category: 'engine',
    precision: 1, decode: pct255, only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x4a, name: 'Accelerator pedal position E', short: 'Pedal E',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'fast', category: 'engine',
    precision: 1, decode: pct255, only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x4c, name: 'Commanded throttle actuator', short: 'Throttle act',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'medium', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x4d, name: 'Time run with MIL on', short: 'Time MIL',
    unit: 'min', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'emissions',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x4e, name: 'Time since codes cleared', short: 'Time cleared',
    unit: 'min', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'emissions',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x52, name: 'Ethanol fuel percentage', short: 'Ethanol',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'slow', category: 'fuel',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x5a, name: 'Relative accelerator pedal position', short: 'Pedal rel',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'fast', category: 'engine',
    precision: 1, decode: pct255,
  }),
  def({
    service: 1, pid: 0x5b, name: 'Hybrid battery pack remaining life', short: 'HV batt',
    unit: '%', bytes: 1, min: 0, max: 100, rate: 'slow', category: 'electrical',
    precision: 1, decode: pct255, only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x5c, name: 'Engine oil temperature', short: 'Oil temp',
    unit: '°C', bytes: 1, min: -40, max: 215, rate: 'medium', category: 'temperature',
    precision: 0, decode: tempA,
  }),
  def({
    service: 1, pid: 0x5d, name: 'Fuel injection timing', short: 'Inj timing',
    unit: '°', bytes: 2, min: -210, max: 301.992, rate: 'medium', category: 'fuel',
    precision: 2, decode: (d) => { const v = u16(d, 0); return v === null ? null : (v - 26880) / 128; },
  }),
  def({
    service: 1, pid: 0x5e, name: 'Engine fuel rate', short: 'Fuel rate',
    unit: 'L/h', bytes: 2, min: 0, max: 3276.75, rate: 'medium', category: 'fuel',
    precision: 2, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 20; },
  }),
  def({
    service: 1, pid: 0x61, name: "Driver's demand engine torque", short: 'Torque dmd',
    unit: '%', bytes: 1, min: -125, max: 130, rate: 'medium', category: 'torque',
    precision: 0, decode: (d) => { const a = u8(d, 0); return a === null ? null : a - 125; },
  }),
  def({
    service: 1, pid: 0x62, name: 'Actual engine torque', short: 'Torque act',
    unit: '%', bytes: 1, min: -125, max: 130, rate: 'medium', category: 'torque',
    precision: 0, decode: (d) => { const a = u8(d, 0); return a === null ? null : a - 125; },
  }),
  def({
    service: 1, pid: 0x63, name: 'Engine reference torque', short: 'Torque ref',
    unit: 'N·m', bytes: 2, min: 0, max: 65535, rate: 'slow', category: 'torque',
    precision: 0, decode: (d) => u16(d, 0),
  }),
  def({
    service: 1, pid: 0x6b, name: 'Exhaust gas recirculation temperature', short: 'EGR temp',
    unit: '°C', bytes: 2, min: -40, max: 215, rate: 'slow', category: 'temperature',
    precision: 0, decode: (d) => { const a = u8(d, 1); return a === null ? null : a - 40; },
    only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x70, name: 'Boost pressure control', short: 'Boost',
    unit: 'kPa', bytes: 2, min: 0, max: 2047.97, rate: 'fast', category: 'turbo',
    precision: 1, decode: (d) => { const v = u16(d, 1); return v === null ? null : v / 32; },
    only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x73, name: 'Exhaust pressure', short: 'Exh press',
    unit: 'kPa', bytes: 2, min: 0, max: 655.35, rate: 'slow', category: 'turbo',
    precision: 1, decode: (d) => { const v = u16(d, 1); return v === null ? null : v / 128; },
    only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x74, name: 'Turbocharger RPM', short: 'Turbo RPM',
    unit: 'rpm', bytes: 2, min: 0, max: 655350, rate: 'medium', category: 'turbo',
    precision: 0, decode: (d) => { const v = u16(d, 1); return v === null ? null : v * 10; },
    only: ['car', 'truck'],
  }),
  def({
    service: 1, pid: 0x7c, name: 'Diesel particulate filter temperature', short: 'DPF temp',
    unit: '°C', bytes: 2, min: -40, max: 6513.5, rate: 'slow', category: 'dpf',
    precision: 0, decode: (d) => { const v = u16(d, 1); return v === null ? null : v / 10 - 40; },
    only: ['car', 'truck'], unverified: true,
  }),
  def({
    service: 1, pid: 0x9d, name: 'Engine fuel rate (g/s)', short: 'Fuel rate g/s',
    unit: 'g/s', bytes: 4, min: 0, max: 3276.75, rate: 'medium', category: 'fuel',
    precision: 2, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 50; },
  }),
  def({
    service: 1, pid: 0xa6, name: 'Odometer', short: 'Odometer',
    unit: 'km', bytes: 4, min: 0, max: 429496729.5, rate: 'slow', category: 'trip',
    precision: 1, decode: (d) => { const v = u32(d, 0); return v === null ? null : v / 10; },
  }),

  // --- Oxygen sensors -------------------------------------------------------
  // Narrowband sensors report voltage in A and the short-term trim they are
  // driving in B. A trim byte of 0xFF means the sensor is not used for trim.
  ...oxygenSensors(),

  // Wide-range sensors report an equivalence ratio across A and B, with a
  // voltage across C and D.
  ...wideRangeOxygenSensors(),

  def({
    service: 1, pid: 0x32, name: 'Evaporative system vapour pressure', short: 'EVAP press',
    unit: 'Pa', bytes: 2, min: -8192, max: 8191.75, rate: 'slow', category: 'emissions',
    precision: 2,
    decode: (d) => {
      const v = u16(d, 0);
      if (v === null) return null;
      // Signed across the full 16 bits, quarter-Pascal resolution.
      return (v > 0x7fff ? v - 0x10000 : v) / 4;
    },
  }),
  def({
    service: 1, pid: 0x53, name: 'Absolute evaporative system vapour pressure', short: 'EVAP abs',
    unit: 'kPa', bytes: 2, min: 0, max: 327.675, rate: 'slow', category: 'emissions',
    precision: 3, decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 200; },
  }),
  def({
    service: 1, pid: 0x55, name: 'Short term secondary oxygen trim, bank 1', short: 'ST sec B1',
    unit: '%', bytes: 2, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim,
  }),
  def({
    service: 1, pid: 0x56, name: 'Long term secondary oxygen trim, bank 1', short: 'LT sec B1',
    unit: '%', bytes: 2, min: -100, max: 99.2, rate: 'slow', category: 'fuel',
    precision: 1, decode: trim,
  }),
  def({
    service: 1, pid: 0x59, name: 'Fuel rail absolute pressure', short: 'Rail abs',
    unit: 'kPa', bytes: 2, min: 0, max: 655350, rate: 'slow', category: 'fuel',
    precision: 0, decode: (d) => { const v = u16(d, 0); return v === null ? null : v * 10; },
  }),

  // --- Diesel after-treatment ----------------------------------------------
  def({
    service: 1, pid: 0x9b, name: 'Diesel exhaust fluid tank level', short: 'AdBlue',
    unit: '%', bytes: 4, min: 0, max: 100, rate: 'slow', category: 'dpf',
    precision: 0,
    decode: (d) => { const a = u8(d, 2); return a === null ? null : (a * 100) / 255; },
    only: ['car', 'truck'], unverified: true,
  }),
  def({
    service: 1, pid: 0xa4, name: 'Transmission gear ratio', short: 'Gear ratio',
    unit: '', bytes: 4, min: 0, max: 65.535, rate: 'medium', category: 'engine',
    precision: 3,
    decode: (d) => { const v = u16(d, 2); return v === null ? null : v / 1000; },
    unverified: true,
  }),
];

/**
 * Narrowband oxygen sensors, PIDs 0x14–0x1B: four sensors on each of two banks.
 * Generated rather than written out, because the layout is identical and the
 * bank and sensor numbers follow directly from the PID.
 */
function oxygenSensors(): PidDefinition[] {
  const sensors: PidDefinition[] = [];
  for (let index = 0; index < 8; index += 1) {
    const pid = 0x14 + index;
    const bank = Math.floor(index / 4) + 1;
    const sensor = (index % 4) + 1;
    sensors.push(
      def({
        service: 1,
        pid,
        name: `Oxygen sensor ${sensor} voltage, bank ${bank}`,
        short: `O2 B${bank}S${sensor}`,
        unit: 'V',
        bytes: 2,
        min: 0,
        max: 1.275,
        rate: 'fast',
        category: 'emissions',
        precision: 3,
        decode: (d) => { const a = u8(d, 0); return a === null ? null : a / 200; },
        secondary: {
          name: `Short term fuel trim from sensor ${sensor}, bank ${bank}`,
          unit: '%',
          precision: 1,
          decode: (d) => {
            const b = u8(d, 1);
            // 0xFF means this sensor does not drive trim.
            if (b === null || b === 0xff) return null;
            return ((b - 128) * 100) / 128;
          },
        },
        only: bank === 2 ? ['car', 'truck'] : undefined,
      }),
    );
  }
  return sensors;
}

/**
 * Wide-range (air-fuel ratio) sensors, PIDs 0x24–0x2B. These report an
 * equivalence ratio, where 1.000 is the ideal mixture — below is rich, above
 * is lean — which is far more readable than a raw voltage.
 */
function wideRangeOxygenSensors(): PidDefinition[] {
  const sensors: PidDefinition[] = [];
  for (let index = 0; index < 8; index += 1) {
    const pid = 0x24 + index;
    const bank = Math.floor(index / 4) + 1;
    const sensor = (index % 4) + 1;
    sensors.push(
      def({
        service: 1,
        pid,
        name: `Oxygen sensor ${sensor} equivalence ratio, bank ${bank}`,
        short: `λ B${bank}S${sensor}`,
        unit: 'λ',
        bytes: 4,
        min: 0,
        max: 2,
        rate: 'fast',
        category: 'emissions',
        precision: 3,
        decode: (d) => { const v = u16(d, 0); return v === null ? null : v / 32768; },
        secondary: {
          name: `Oxygen sensor ${sensor} voltage, bank ${bank}`,
          unit: 'V',
          precision: 3,
          decode: (d) => { const v = u16(d, 2); return v === null ? null : v / 8192; },
        },
        only: bank === 2 ? ['car', 'truck'] : undefined,
      }),
    );
  }
  return sensors;
}

/**
 * Mode 01 PID 0x13 — which oxygen sensors the vehicle has.
 *
 * One bit per sensor, in the same order as PIDs 0x14 to 0x1B, so a set bit
 * maps directly onto the PID that reads that sensor. Saves polling sensors
 * that will never answer.
 */
export function decodeOxygenSensorsPresent(data: number[]): number[] {
  const a = data[0];
  if (a === undefined) return [];

  const present: number[] = [];
  for (let bit = 0; bit < 8; bit += 1) {
    if ((a & (1 << bit)) !== 0) present.push(0x14 + bit);
  }
  return present;
}

const BY_PID = new Map<number, PidDefinition>(
  PID_DEFINITIONS.map((d) => [d.pid, d]),
);

export function pidDefinition(pid: number): PidDefinition | undefined {
  return BY_PID.get(pid);
}

/** PIDs worth offering for a vehicle type, in display order. */
export function pidsForVehicle(type: VehicleType): PidDefinition[] {
  return PID_DEFINITIONS.filter((d) => !d.only || d.only.includes(type));
}

/** Two-character uppercase hex, as ELM327 commands require. */
export function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

// --- Enumerated (non-numeric) parameters -----------------------------------

const FUEL_SYSTEM_STATUS: Record<number, string> = {
  0: 'Not supported',
  1: 'Open loop — engine not yet warm',
  2: 'Closed loop — using oxygen sensor',
  4: 'Open loop — load or deceleration',
  8: 'Open loop — system fault',
  16: 'Closed loop — with a sensor fault',
};

/** Mode 01 PID 03. Two bytes: one per fuel system. */
export function decodeFuelSystemStatus(data: number[]): string[] {
  const out: string[] = [];
  for (const byte of data.slice(0, 2)) {
    if (byte === 0) continue;
    out.push(FUEL_SYSTEM_STATUS[byte] ?? `Unknown (0x${hex2(byte)})`);
  }
  return out;
}

const FUEL_TYPES: Record<number, string> = {
  0: 'Not available', 1: 'Petrol', 2: 'Methanol', 3: 'Ethanol', 4: 'Diesel',
  5: 'LPG', 6: 'CNG', 7: 'Propane', 8: 'Electric', 9: 'Bifuel petrol',
  10: 'Bifuel methanol', 11: 'Bifuel ethanol', 12: 'Bifuel LPG',
  13: 'Bifuel CNG', 14: 'Bifuel propane', 15: 'Bifuel electric',
  16: 'Bifuel electric and combustion', 17: 'Hybrid petrol',
  18: 'Hybrid ethanol', 19: 'Hybrid diesel', 20: 'Hybrid electric',
  21: 'Hybrid', 22: 'Hybrid regenerative', 23: 'Bifuel diesel',
};

/** Mode 01 PID 51. */
export function decodeFuelType(data: number[]): string | null {
  const a = u8(data, 0);
  if (a === null) return null;
  return FUEL_TYPES[a] ?? `Unknown (${a})`;
}

const OBD_STANDARDS: Record<number, string> = {
  1: 'OBD-II (California ARB)', 2: 'OBD (US EPA)', 3: 'OBD and OBD-II',
  4: 'OBD-I', 5: 'Not OBD compliant', 6: 'EOBD', 7: 'EOBD and OBD-II',
  8: 'EOBD and OBD', 9: 'EOBD, OBD and OBD-II', 10: 'JOBD',
  11: 'JOBD and OBD-II', 12: 'JOBD and EOBD', 13: 'JOBD, EOBD and OBD-II',
  17: 'EMD', 18: 'EMD+', 19: 'HD OBD-C', 20: 'HD OBD', 21: 'WWH OBD',
  23: 'HD EOBD-I', 24: 'HD EOBD-I N', 25: 'HD EOBD-II', 26: 'HD EOBD-II N',
  28: 'OBDBr-1', 29: 'OBDBr-2', 30: 'KOBD', 31: 'IOBD-I', 32: 'IOBD-II',
  33: 'HD EOBD-IV',
};

/** Mode 01 PID 1C. */
export function decodeObdStandard(data: number[]): string | null {
  const a = u8(data, 0);
  if (a === null) return null;
  return OBD_STANDARDS[a] ?? `Unknown (${a})`;
}
