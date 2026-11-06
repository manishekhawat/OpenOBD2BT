/**
 * Readiness monitors — Mode 01 PID 01.
 *
 * Four bytes describe the warning lamp, the stored fault count, and the state
 * of each on-board emission self-check. Which checks exist depends on whether
 * the engine is spark ignition (petrol) or compression ignition (diesel), which
 * byte B declares. This is what an emissions test reads.
 */

export interface MonitorState {
  name: string;
  supported: boolean;
  /** False while the vehicle is still running the check. */
  complete: boolean;
}

export interface ReadinessReport {
  /** Malfunction indicator lamp — the dashboard engine light. */
  milOn: boolean;
  /** Number of confirmed stored faults the ECU is reporting. */
  dtcCount: number;
  ignition: 'spark' | 'compression';
  monitors: MonitorState[];
  /** True when every supported check has finished. */
  readyForTest: boolean;
}

const CONTINUOUS = ['Misfire', 'Fuel system', 'Comprehensive components'] as const;

const SPARK_MONITORS = [
  'Catalyst',
  'Heated catalyst',
  'Evaporative system',
  'Secondary air system',
  'A/C refrigerant',
  'Oxygen sensor',
  'Oxygen sensor heater',
  'EGR system',
] as const;

const COMPRESSION_MONITORS = [
  'NMHC catalyst',
  'NOx / SCR aftertreatment',
  'Reserved',
  'Boost pressure',
  'Reserved',
  'Exhaust gas sensor',
  'Particulate filter',
  'EGR and VVT system',
] as const;

/** Decode the four payload bytes of Mode 01 PID 01 (or PID 41). */
export function decodeReadiness(data: number[]): ReadinessReport | null {
  const a = data[0];
  const b = data[1];
  const c = data[2];
  const d = data[3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }

  const milOn = (a & 0x80) !== 0;
  const dtcCount = a & 0x7f;
  const ignition = (b & 0x08) !== 0 ? 'compression' : 'spark';

  const monitors: MonitorState[] = [];

  // Continuous monitors: supported in bits 0-2, "not complete" in bits 4-6.
  CONTINUOUS.forEach((name, i) => {
    const supported = (b & (1 << i)) !== 0;
    const incomplete = (b & (1 << (i + 4))) !== 0;
    monitors.push({ name, supported, complete: supported && !incomplete });
  });

  // Non-continuous monitors: C holds support flags, D holds "not complete".
  const names = ignition === 'compression' ? COMPRESSION_MONITORS : SPARK_MONITORS;
  names.forEach((name, i) => {
    if (name === 'Reserved') return;
    const supported = (c & (1 << i)) !== 0;
    const incomplete = (d & (1 << i)) !== 0;
    monitors.push({ name, supported, complete: supported && !incomplete });
  });

  const readyForTest = monitors.every((m) => !m.supported || m.complete);

  return { milOn, dtcCount, ignition, monitors, readyForTest };
}
