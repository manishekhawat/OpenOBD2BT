/**
 * Fuel consumption.
 *
 * Three sources, best first:
 *
 *  1. PID 5E, engine fuel rate — the vehicle's own figure, in litres per hour.
 *  2. Mass air flow (PID 10) divided by the stoichiometric ratio for the fuel.
 *  3. Air flow estimated from manifold pressure, intake temperature, revs and
 *     engine size, when there is no MAF sensor.
 *
 * Only the first is a measurement. The others are estimates and are labelled as
 * such wherever they are shown, because treating a calculation as a reading is
 * how people end up distrusting the whole app.
 */

export type FuelSource = 'reported' | 'maf' | 'estimated';

export interface FuelRate {
  litresPerHour: number;
  source: FuelSource;
}

/** Stoichiometric air-fuel ratio and density, by fuel type. */
const FUEL_PROPERTIES: Record<string, { afr: number; densityKgPerL: number }> = {
  petrol: { afr: 14.7, densityKgPerL: 0.745 },
  diesel: { afr: 14.5, densityKgPerL: 0.832 },
  lpg: { afr: 15.6, densityKgPerL: 0.54 },
  cng: { afr: 17.2, densityKgPerL: 0.18 },
  ethanol: { afr: 9.0, densityKgPerL: 0.789 },
};

function propertiesFor(fuelType: string | null): { afr: number; densityKgPerL: number } {
  const key = (fuelType ?? 'petrol').toLowerCase();
  for (const [name, props] of Object.entries(FUEL_PROPERTIES)) {
    if (key.includes(name)) return props;
  }
  return FUEL_PROPERTIES.petrol as { afr: number; densityKgPerL: number };
}

export interface FuelInputs {
  /** PID 5E, litres per hour, when the vehicle reports it. */
  fuelRateLh?: number | null;
  /** PID 10, grams per second. */
  mafGs?: number | null;
  /** PID 0B, kPa. */
  mapKpa?: number | null;
  /** PID 0F, °C. */
  intakeTempC?: number | null;
  /** PID 0C, rpm. */
  rpm?: number | null;
  engineCc?: number | null;
  fuelType?: string | null;
  /** Correction learned from logged fill-ups; 1 means uncorrected. */
  calibration?: number;
}

/** Work out the current fuel rate from whatever the vehicle offers. */
export function fuelRate(inputs: FuelInputs): FuelRate | null {
  const calibration = inputs.calibration && inputs.calibration > 0 ? inputs.calibration : 1;
  const { afr, densityKgPerL } = propertiesFor(inputs.fuelType ?? null);

  if (inputs.fuelRateLh != null && inputs.fuelRateLh > 0) {
    return { litresPerHour: inputs.fuelRateLh * calibration, source: 'reported' };
  }

  const maf = inputs.mafGs;
  if (maf != null && maf > 0) {
    // grams of air per second → grams of fuel per second → litres per hour
    const fuelGramsPerSecond = maf / afr;
    const litresPerHour = (fuelGramsPerSecond * 3600) / (densityKgPerL * 1000);
    return { litresPerHour: litresPerHour * calibration, source: 'maf' };
  }

  const estimatedMaf = estimateMaf(inputs);
  if (estimatedMaf != null && estimatedMaf > 0) {
    const fuelGramsPerSecond = estimatedMaf / afr;
    const litresPerHour = (fuelGramsPerSecond * 3600) / (densityKgPerL * 1000);
    return { litresPerHour: litresPerHour * calibration, source: 'estimated' };
  }

  return null;
}

/**
 * Estimate air mass flow from the speed-density relationship, for engines with
 * no MAF sensor. Volumetric efficiency is assumed at 85%, which is a reasonable
 * mid-range figure and the main source of error here.
 */
export function estimateMaf(inputs: FuelInputs): number | null {
  const { mapKpa, intakeTempC, rpm, engineCc } = inputs;
  if (mapKpa == null || intakeTempC == null || rpm == null || !engineCc) return null;
  if (rpm <= 0 || engineCc <= 0) return null;

  const volumetricEfficiency = 0.85;
  const displacementM3 = engineCc / 1_000_000;
  // A four-stroke engine fills its displacement once every two revolutions.
  const intakeM3PerSecond = (rpm / 120) * displacementM3 * volumetricEfficiency;

  const kelvin = intakeTempC + 273.15;
  const specificGasConstant = 287.05; // J/(kg·K) for dry air
  const densityKgPerM3 = (mapKpa * 1000) / (specificGasConstant * kelvin);

  return intakeM3PerSecond * densityKgPerM3 * 1000; // grams per second
}

/** Instant consumption in litres per 100 km. Null below walking pace. */
export function litresPer100Km(litresPerHour: number, speedKmh: number): number | null {
  if (speedKmh < 3 || litresPerHour <= 0) return null;
  return (litresPerHour / speedKmh) * 100;
}

/**
 * Integrate fuel rate over time to get litres used.
 *
 * Samples are (timestamp, litres per hour) pairs; the trapezoid rule keeps the
 * figure stable when the polling interval varies, which it does.
 */
export function integrateLitres(samples: { at: number; litresPerHour: number }[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;
    const hours = (current.at - previous.at) / 3_600_000;
    if (hours <= 0 || hours > 0.5) continue; // ignore gaps from a dropped link
    total += ((previous.litresPerHour + current.litresPerHour) / 2) * hours;
  }
  return total;
}

/**
 * Correction factor from a fill-up: what the pump delivered against what was
 * estimated. Clamped, because one bad entry should not wreck future figures.
 */
export function calibrationFrom(estimatedLitres: number, actualLitres: number): number | null {
  if (estimatedLitres <= 0 || actualLitres <= 0) return null;
  const ratio = actualLitres / estimatedLitres;
  if (ratio < 0.5 || ratio > 2) return null;
  return ratio;
}
