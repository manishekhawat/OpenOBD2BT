/**
 * Performance measurement.
 *
 * Acceleration runs are timed from the vehicle's own speed signal. Power is
 * derived from how fast the vehicle gains speed against its mass and drag,
 * which is an estimate, not a dyno figure — the app says so wherever it shows
 * one, and the accuracy depends entirely on the weight in the vehicle profile.
 */

export interface SpeedSample {
  at: number;
  speedKmh: number;
  rpm?: number | null;
}

export type RunKind = '0-60' | '0-100' | '60-100' | '0-400m' | 'custom';

export interface RunDefinition {
  kind: RunKind;
  label: string;
  fromKmh: number;
  toKmh: number | null;
  /** Set for distance-based runs like the standing quarter mile. */
  distanceM?: number;
}

export const STANDARD_RUNS: RunDefinition[] = [
  { kind: '0-60', label: '0 – 60 km/h', fromKmh: 0, toKmh: 60 },
  { kind: '0-100', label: '0 – 100 km/h', fromKmh: 0, toKmh: 100 },
  { kind: '60-100', label: '60 – 100 km/h', fromKmh: 60, toKmh: 100 },
  { kind: '0-400m', label: 'Standing 400 m', fromKmh: 0, toKmh: null, distanceM: 400 },
];

export interface RunResult {
  definition: RunDefinition;
  seconds: number;
  /** Trap speed at the end of a distance run. */
  endSpeedKmh: number;
  at: number;
}

/**
 * Find a completed run inside a buffer of speed samples.
 *
 * The run must start at or below the start speed and climb without dropping
 * back below it, so a hesitation invalidates the attempt rather than quietly
 * producing a flattering time.
 */
export function detectRun(
  samples: SpeedSample[],
  definition: RunDefinition,
): RunResult | null {
  if (samples.length < 2) return null;

  const startThreshold = definition.fromKmh;
  let startIndex: number | null = null;
  let distanceM = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;

    // Begin timing on the crossing of the start speed.
    if (startIndex === null) {
      if (previous.speedKmh <= startThreshold && current.speedKmh > startThreshold) {
        startIndex = i - 1;
        distanceM = 0;
      }
      continue;
    }

    // Abandon the attempt if speed falls back below the start line.
    if (current.speedKmh < startThreshold - 1) {
      startIndex = null;
      distanceM = 0;
      continue;
    }

    const dtSeconds = (current.at - previous.at) / 1000;
    if (dtSeconds > 0 && dtSeconds < 2) {
      const averageKmh = (previous.speedKmh + current.speedKmh) / 2;
      distanceM += (averageKmh / 3.6) * dtSeconds;
    }

    const start = samples[startIndex];
    if (!start) continue;

    if (definition.distanceM != null) {
      if (distanceM >= definition.distanceM) {
        return {
          definition,
          seconds: (current.at - start.at) / 1000,
          endSpeedKmh: current.speedKmh,
          at: current.at,
        };
      }
    } else if (definition.toKmh != null && current.speedKmh >= definition.toKmh) {
      // Interpolate between the two samples that straddle the finish line.
      const span = current.speedKmh - previous.speedKmh;
      const fraction = span > 0 ? (definition.toKmh - previous.speedKmh) / span : 0;
      const crossedAt = previous.at + (current.at - previous.at) * fraction;
      return {
        definition,
        seconds: (crossedAt - start.at) / 1000,
        endSpeedKmh: definition.toKmh,
        at: crossedAt,
      };
    }
  }

  return null;
}

export interface PowerInputs {
  samples: SpeedSample[];
  /** Kerb weight from the vehicle profile, plus the occupants. */
  massKg: number;
  /** Drag area, CdA in m². Defaults suit the vehicle type. */
  dragAreaM2?: number;
  /** Rolling resistance coefficient. */
  rollingCoefficient?: number;
}

export interface PowerEstimate {
  peakKw: number;
  peakHp: number;
  atRpm: number | null;
  atSpeedKmh: number;
  /** Torque at the wheels, back-calculated from power and revs. */
  peakTorqueNm: number | null;
}

/** Typical drag areas, for when the profile does not carry one. */
export const DEFAULT_DRAG_AREA: Record<string, number> = {
  car: 0.65,
  truck: 1.2,
  motorcycle: 0.45,
  scooter: 0.5,
};

/**
 * Estimate peak power from an acceleration run.
 *
 * Power at the wheels is the sum of what goes into accelerating the mass,
 * pushing air aside, and overcoming rolling resistance. Drivetrain losses mean
 * this reads below a crank figure, and the drag assumption dominates at speed,
 * so treat it as indicative.
 */
export function estimatePower(inputs: PowerInputs): PowerEstimate | null {
  const { samples, massKg } = inputs;
  if (samples.length < 4 || massKg <= 0) return null;

  const dragArea = inputs.dragAreaM2 ?? DEFAULT_DRAG_AREA.car ?? 0.65;
  const rolling = inputs.rollingCoefficient ?? 0.015;
  const airDensity = 1.225; // kg/m³ at sea level, 15 °C
  const gravity = 9.81;

  let best: PowerEstimate | null = null;

  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;

    const dtSeconds = (current.at - previous.at) / 1000;
    if (dtSeconds <= 0 || dtSeconds > 1) continue;

    const v1 = previous.speedKmh / 3.6;
    const v2 = current.speedKmh / 3.6;
    const v = (v1 + v2) / 2;
    if (v < 5) continue; // too slow for the model to mean anything

    const acceleration = (v2 - v1) / dtSeconds;
    if (acceleration <= 0) continue;

    const inertialW = massKg * acceleration * v;
    const dragW = 0.5 * airDensity * dragArea * v * v * v;
    const rollingW = rolling * massKg * gravity * v;
    const totalW = inertialW + dragW + rollingW;
    const kw = totalW / 1000;

    if (!best || kw > best.peakKw) {
      const rpm = current.rpm ?? null;
      best = {
        peakKw: kw,
        peakHp: kw * 1.34102,
        atRpm: rpm,
        atSpeedKmh: current.speedKmh,
        peakTorqueNm: rpm && rpm > 0 ? (totalW * 60) / (2 * Math.PI * rpm) : null,
      };
    }
  }

  return best;
}

/**
 * Smooth a noisy speed trace. Vehicle speed arrives as whole km/h, so the
 * derivative is very steppy without this.
 */
export function smoothSpeed(samples: SpeedSample[], window = 5): SpeedSample[] {
  if (samples.length <= window) return samples;
  const half = Math.floor(window / 2);

  return samples.map((sample, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -half; offset <= half; offset += 1) {
      const neighbour = samples[index + offset];
      if (!neighbour) continue;
      sum += neighbour.speedKmh;
      count += 1;
    }
    return count > 0 ? { ...sample, speedKmh: sum / count } : sample;
  });
}
