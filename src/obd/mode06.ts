/**
 * Service 06 — on-board monitoring test results.
 *
 * Readiness monitors say a check passed. This says by how much. Each test
 * reports a measured value with the limits it was judged against, so a
 * catalytic converter that is slowly degrading shows its margin shrinking long
 * before it fails and turns the lamp on.
 *
 * Each record is nine bytes:
 *
 *   MID  TID  UASID  value(2)  min(2)  max(2)
 *
 * The unit-and-scaling ID says how to turn the raw 16-bit numbers into a
 * physical quantity. Two things follow from the value and both limits sharing
 * one scaling ID, and they shape this module:
 *
 *  - Pass or fail, and the margin as a proportion, can always be worked out,
 *    even when the scaling ID is one this app does not recognise.
 *  - So an unknown scaling is reported honestly as a raw number rather than
 *    guessed at. A wrong unit in a diagnostic tool is worse than no unit.
 */

export interface UnitScaling {
  unit: string;
  multiplier: number;
  signed: boolean;
  /** Added after scaling, for quantities the standard offsets. */
  offset?: number;
}

/**
 * Unit-and-scaling IDs from SAE J1979.
 *
 * Only entries that are certain are listed. An ID that is absent is reported
 * as an unscaled raw value rather than being approximated.
 */
const UNIT_SCALING: Record<number, UnitScaling> = {
  0x01: { unit: '', multiplier: 1, signed: false },
  0x02: { unit: '', multiplier: 0.1, signed: false },
  0x03: { unit: '', multiplier: 0.01, signed: false },
  0x04: { unit: '', multiplier: 0.001, signed: false },
  0x07: { unit: 'rpm', multiplier: 0.25, signed: false },
  0x08: { unit: 'km/h', multiplier: 0.01, signed: false },
  0x09: { unit: 'km/h', multiplier: 1, signed: false },
  0x0a: { unit: 'V', multiplier: 0.000122, signed: false },
  0x0b: { unit: 'V', multiplier: 0.001, signed: false },
  0x0c: { unit: 'V', multiplier: 0.01, signed: false },
  0x0d: { unit: 'mA', multiplier: 0.00390625, signed: false },
  0x0e: { unit: 'A', multiplier: 0.001, signed: false },
  0x0f: { unit: 'A', multiplier: 0.01, signed: false },
  0x10: { unit: 'ms', multiplier: 1, signed: false },
  0x12: { unit: 's', multiplier: 1, signed: false },
  0x13: { unit: 'mΩ', multiplier: 1, signed: false },
  0x14: { unit: 'Ω', multiplier: 1, signed: false },
  0x15: { unit: 'kΩ', multiplier: 1, signed: false },
  0x17: { unit: 'kPa', multiplier: 0.01, signed: false },
  0x19: { unit: 'kPa', multiplier: 0.079, signed: false },
  0x1a: { unit: 'kPa', multiplier: 1, signed: false },
  0x1b: { unit: 'kPa', multiplier: 10, signed: false },
  0x1c: { unit: '°', multiplier: 0.01, signed: false },
  0x1d: { unit: '°', multiplier: 0.5, signed: true },
  0x22: { unit: 'Hz', multiplier: 1, signed: false },
  0x24: { unit: 'count', multiplier: 1, signed: false },
  0x25: { unit: 'km', multiplier: 1, signed: false },
  0x27: { unit: 'g/s', multiplier: 0.01, signed: false },
  0x2f: { unit: '%', multiplier: 0.01, signed: false },
  0x30: { unit: '%', multiplier: 0.001, signed: false },
  0x31: { unit: 'L', multiplier: 0.1, signed: false },
  0x34: { unit: 'min', multiplier: 1, signed: false },
  0x35: { unit: 'ms', multiplier: 10, signed: false },
  0x36: { unit: 'g', multiplier: 0.01, signed: false },
  0x37: { unit: 'g', multiplier: 0.1, signed: false },
  0x38: { unit: 'g', multiplier: 1, signed: false },
  0x39: { unit: '%', multiplier: 0.01, signed: true },
  0x81: { unit: '', multiplier: 1, signed: true },
  0x82: { unit: '', multiplier: 0.1, signed: true },
  0x83: { unit: '', multiplier: 0.01, signed: true },
  0x84: { unit: '', multiplier: 0.001, signed: true },
};

export interface TestResult {
  /** Monitor ID — which system was tested. */
  mid: number;
  /** Test ID within that monitor. */
  tid: number;
  unitScalingId: number;
  /** Scaled value, or the raw number when the scaling is unrecognised. */
  value: number;
  minLimit: number;
  maxLimit: number;
  unit: string;
  /** False when the scaling ID is not in the table, so value is raw. */
  scalingKnown: boolean;
  /** True when the value sits inside its limits. */
  passed: boolean;
  /**
   * How much room is left before failing, 0 to 1, or null when the test has no
   * usable limit. Scaling-independent, so it is meaningful even when the unit
   * is not known.
   */
  margin: number | null;
  /** Which limit the test is judged against. */
  bound: 'max' | 'min' | 'both' | 'none';
  name: string;
  /** False when the monitor ID is not one the standard names. */
  nameKnown: boolean;
}

function toSigned16(value: number): number {
  return value > 0x7fff ? value - 0x10000 : value;
}

function scale(raw: number, scaling: UnitScaling | undefined): number {
  if (!scaling) return raw;
  const base = scaling.signed ? toSigned16(raw) : raw;
  return base * scaling.multiplier + (scaling.offset ?? 0);
}

/**
 * Name a monitor from its ID.
 *
 * Only the ranges the standard fixes are named. Anything else is reported by
 * its number, because manufacturers define their own monitors above $A0 and
 * inventing a label would mislead.
 */
export function monitorName(mid: number): { name: string; known: boolean } {
  const hex = `$${mid.toString(16).toUpperCase().padStart(2, '0')}`;

  // $01–$10: narrowband oxygen sensors, four sensors per bank.
  if (mid >= 0x01 && mid <= 0x10) {
    const index = mid - 0x01;
    return {
      name: `Oxygen sensor bank ${Math.floor(index / 4) + 1} sensor ${(index % 4) + 1}`,
      known: true,
    };
  }

  // $21–$30: wide-range oxygen sensors, same layout.
  if (mid >= 0x21 && mid <= 0x30) {
    const index = mid - 0x21;
    return {
      name: `Wide-range oxygen sensor bank ${Math.floor(index / 4) + 1} sensor ${(index % 4) + 1}`,
      known: true,
    };
  }

  if (mid >= 0x31 && mid <= 0x34) {
    return { name: `Exhaust gas recirculation, bank ${mid - 0x30}`, known: true };
  }

  if (mid >= 0x35 && mid <= 0x38) {
    return { name: `Catalytic converter, bank ${mid - 0x34}`, known: true };
  }

  if (mid >= 0x39 && mid <= 0x3c) {
    return { name: `Exhaust gas sensor, bank ${mid - 0x38}`, known: true };
  }

  // $A0 is not named here: it is one of the support bitmaps, following the
  // same pattern as the live-parameter blocks, so it carries no test of its own.
  if (mid >= 0xa1 && mid <= 0xac) {
    return { name: `Misfire, cylinder ${mid - 0xa0}`, known: true };
  }

  return { name: `Monitor ${hex}`, known: false };
}

/** Monitor IDs that carry the support bitmaps, which are not tests themselves. */
export const MID_SUPPORT_BLOCKS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0] as const;

/**
 * Decode the payload of a service 06 response into its test records.
 *
 * `payload` is everything after the 0x46 response byte.
 */
export function decodeTestResults(payload: number[]): TestResult[] {
  const results: TestResult[] = [];

  for (let offset = 0; offset + 8 < payload.length; offset += 9) {
    const mid = payload[offset];
    const tid = payload[offset + 1];
    const uasid = payload[offset + 2];
    const valueHi = payload[offset + 3];
    const valueLo = payload[offset + 4];
    const minHi = payload[offset + 5];
    const minLo = payload[offset + 6];
    const maxHi = payload[offset + 7];
    const maxLo = payload[offset + 8];

    if (
      mid === undefined || tid === undefined || uasid === undefined ||
      valueHi === undefined || valueLo === undefined ||
      minHi === undefined || minLo === undefined ||
      maxHi === undefined || maxLo === undefined
    ) {
      break;
    }

    // Support bitmaps share the response shape but are not test results.
    if ((MID_SUPPORT_BLOCKS as readonly number[]).includes(mid)) continue;

    const scaling = UNIT_SCALING[uasid];
    const rawValue = valueHi * 256 + valueLo;
    const rawMin = minHi * 256 + minLo;
    const rawMax = maxHi * 256 + maxLo;

    // Work out which limits are real before scaling, so the decision does not
    // depend on knowing the unit.
    const hasMin = rawMin !== 0x0000;
    const hasMax = rawMax !== 0xffff && rawMax !== 0x0000;
    const bound: TestResult['bound'] =
      hasMin && hasMax ? 'both' : hasMax ? 'max' : hasMin ? 'min' : 'none';

    const signedValue = scaling?.signed ? toSigned16(rawValue) : rawValue;
    const signedMin = scaling?.signed ? toSigned16(rawMin) : rawMin;
    const signedMax = scaling?.signed ? toSigned16(rawMax) : rawMax;

    let passed = true;
    if (hasMin && signedValue < signedMin) passed = false;
    if (hasMax && signedValue > signedMax) passed = false;

    const { name, known } = monitorName(mid);

    results.push({
      mid,
      tid,
      unitScalingId: uasid,
      value: scale(rawValue, scaling),
      minLimit: scale(rawMin, scaling),
      maxLimit: scale(rawMax, scaling),
      unit: scaling?.unit ?? '',
      scalingKnown: scaling !== undefined,
      passed,
      margin: computeMargin(signedValue, signedMin, signedMax, bound),
      bound,
      name,
      nameKnown: known,
    });
  }

  return results;
}

/**
 * How much headroom a test has, as a proportion from 0 to 1.
 *
 * Computed from the raw numbers, so it holds whether or not the unit is known.
 * For a test bounded above, 1 means the value is at zero and 0 means it is at
 * the limit; a failing test returns 0.
 */
function computeMargin(
  value: number,
  min: number,
  max: number,
  bound: TestResult['bound'],
): number | null {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  switch (bound) {
    case 'max': {
      if (max === 0) return null;
      return clamp(1 - value / max);
    }
    case 'min': {
      if (value <= 0) return 0;
      // Distance above the floor, relative to the floor itself.
      return clamp((value - min) / Math.max(Math.abs(min), 1));
    }
    case 'both': {
      const span = max - min;
      if (span <= 0) return null;
      // Distance from whichever limit is nearer, over half the span.
      const nearest = Math.min(value - min, max - value);
      return clamp(nearest / (span / 2));
    }
    case 'none':
      return null;
  }
}

/** Group results by monitor so the UI can show one section per system. */
export function groupByMonitor(results: TestResult[]): {
  mid: number;
  name: string;
  nameKnown: boolean;
  tests: TestResult[];
  /** Worst margin in the group, for sorting and for the summary row. */
  worstMargin: number | null;
  allPassed: boolean;
}[] {
  const groups = new Map<number, TestResult[]>();
  for (const result of results) {
    const list = groups.get(result.mid) ?? [];
    list.push(result);
    groups.set(result.mid, list);
  }

  return [...groups.entries()]
    .map(([mid, tests]) => {
      const margins = tests
        .map((t) => t.margin)
        .filter((m): m is number => m !== null);
      const first = tests[0];
      return {
        mid,
        name: first?.name ?? monitorName(mid).name,
        nameKnown: first?.nameKnown ?? false,
        tests,
        worstMargin: margins.length > 0 ? Math.min(...margins) : null,
        allPassed: tests.every((t) => t.passed),
      };
    })
    .sort((a, b) => {
      // Failing monitors first, then the tightest margins.
      if (a.allPassed !== b.allPassed) return a.allPassed ? 1 : -1;
      const am = a.worstMargin ?? 1;
      const bm = b.worstMargin ?? 1;
      return am - bm;
    });
}

/** A short verdict for a group, e.g. "94% margin" or "failing". */
export function describeMargin(margin: number | null, passed: boolean): string {
  if (!passed) return 'failing';
  if (margin === null) return 'passed';
  const percent = Math.round(margin * 100);
  if (percent >= 50) return `${percent}% margin`;
  if (percent >= 20) return `${percent}% margin, narrowing`;
  return `${percent}% margin, close to the limit`;
}
