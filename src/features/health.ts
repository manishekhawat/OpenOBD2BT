/**
 * Health assessment.
 *
 * Turns readings into answers. A fuel trim of +14% means nothing on its own;
 * read together with the other bank, the engine load and the oxygen sensors it
 * says something specific about where to look. That reading-in-context is what
 * this module does, and it is the difference between showing numbers and
 * being useful.
 *
 * Every check reports what it concluded and what it concluded it from, so a
 * verdict can always be traced back to the measurement behind it.
 */

import type { ReadinessReport } from '@/obd/monitors';
import { groupByMonitor, type TestResult } from '@/obd/mode06';
import type { ScanResult } from '@/obd/session';

export type HealthStatus = 'good' | 'watch' | 'bad' | 'unknown';

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  /** The conclusion, in a few words. */
  verdict: string;
  /** The measurement behind it. */
  detail: string | null;
  /** What to do, when there is something worth doing. */
  advice?: string;
}

export interface HealthInputs {
  readings: Record<number, number>;
  testResults: TestResult[];
  scan: ScanResult | null;
  readiness: ReadinessReport | null;
}

const rank: Record<HealthStatus, number> = { bad: 0, watch: 1, unknown: 2, good: 3 };

/** Run every check that the available data supports. */
export function assessHealth(inputs: HealthInputs): HealthCheck[] {
  const checks = [
    checkFuelMixture(inputs),
    checkCharging(inputs),
    checkCatalyst(inputs),
    checkMisfires(inputs),
    checkOxygenSensors(inputs),
    checkCoolant(inputs),
    checkClearedRecently(inputs),
  ].filter((check): check is HealthCheck => check !== null);

  return checks.sort((a, b) => rank[a.status] - rank[b.status]);
}

/** The worst status across the checks, which drives the headline verdict. */
export function overallHealth(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === 'bad')) return 'bad';
  if (checks.some((c) => c.status === 'watch')) return 'watch';
  if (checks.every((c) => c.status === 'unknown')) return 'unknown';
  return 'good';
}

/**
 * Fuel mixture, from short and long term trims.
 *
 * The two add up to how far the ECU has had to move from its base fuelling.
 * Beyond about 10% something is making the engine run off-target; beyond 25%
 * the ECU is close to running out of authority. Which bank, and whether it
 * appears at idle or under load, is what narrows the cause.
 */
function checkFuelMixture({ readings }: HealthInputs): HealthCheck | null {
  const shortB1 = readings[0x06];
  const longB1 = readings[0x07];
  if (shortB1 === undefined || longB1 === undefined) return null;

  const shortB2 = readings[0x08];
  const longB2 = readings[0x09];
  const load = readings[0x04];
  const rpm = readings[0x0c];

  const totalB1 = shortB1 + longB1;
  const totalB2 =
    shortB2 !== undefined && longB2 !== undefined ? shortB2 + longB2 : null;

  const worst = totalB2 === null
    ? totalB1
    : Math.abs(totalB1) >= Math.abs(totalB2) ? totalB1 : totalB2;

  const detail = totalB2 === null
    ? `Trim ${format(totalB1)} (short ${format(shortB1)}, long ${format(longB1)})`
    : `Bank 1 ${format(totalB1)}, bank 2 ${format(totalB2)}`;

  // A large gap between banks points at one side rather than the whole engine.
  if (totalB2 !== null && Math.abs(totalB1 - totalB2) > 10) {
    return {
      id: 'mixture',
      label: 'Fuel mixture',
      status: 'watch',
      verdict: 'Banks disagree',
      detail,
      advice:
        'One bank is being corrected much harder than the other, so the cause is probably on that side alone — an intake leak, an injector, or the oxygen sensor for that bank — rather than something affecting the whole engine.',
    };
  }

  const magnitude = Math.abs(worst);
  if (magnitude < 10) {
    return {
      id: 'mixture',
      label: 'Fuel mixture',
      status: 'good',
      verdict: 'Normal',
      detail,
    };
  }

  const lean = worst > 0;
  const atIdle = rpm !== undefined && rpm < 1200 && (load === undefined || load < 35);

  const leanAdvice = atIdle
    ? 'Running lean at idle most often means unmetered air getting in — a split vacuum hose, a leaking intake gasket, or the PCV system. A leak shows up worst at idle because manifold vacuum is highest then.'
    : 'Running lean under load points at fuel delivery rather than air — a tiring fuel pump, a blocked filter, or a dirty mass air flow sensor reading low.';

  const richAdvice = atIdle
    ? 'Running rich at idle points at a leaking injector, excess fuel pressure, or an oxygen sensor reporting lean when it is not.'
    : 'Running rich under load points at fuel pressure being too high, or a restricted air intake making the engine breathe less than the ECU expects.';

  return {
    id: 'mixture',
    label: 'Fuel mixture',
    status: magnitude > 25 ? 'bad' : 'watch',
    verdict: lean ? 'Running lean' : 'Running rich',
    detail,
    advice: lean ? leanAdvice : richAdvice,
  };
}

/**
 * Charging system, from control module voltage.
 *
 * Only meaningful with the engine turning — a reading taken with the ignition
 * on and the engine off is the battery alone, which is a different question.
 */
function checkCharging({ readings }: HealthInputs): HealthCheck | null {
  const volts = readings[0x42];
  if (volts === undefined) return null;

  const rpm = readings[0x0c];
  const running = rpm !== undefined && rpm > 400;

  if (!running) {
    if (volts < 12.0) {
      return {
        id: 'charging',
        label: 'Battery',
        status: 'bad',
        verdict: 'Flat',
        detail: `${volts.toFixed(1)} V with the engine off`,
        advice: 'Below 12 V at rest, a lead-acid battery is substantially discharged. Readings and fault codes taken at this voltage are unreliable — charge it first, then scan again.',
      };
    }
    return {
      id: 'charging',
      label: 'Battery',
      status: volts < 12.4 ? 'watch' : 'good',
      verdict: volts < 12.4 ? 'Low but usable' : 'Healthy at rest',
      detail: `${volts.toFixed(1)} V with the engine off`,
      advice: volts < 12.4
        ? 'A rested battery should sit above 12.4 V. Start the engine and check again: if it does not rise to about 14 V, the charging system is the problem rather than the battery.'
        : undefined,
    };
  }

  if (volts < 13.0) {
    return {
      id: 'charging',
      label: 'Charging',
      status: 'bad',
      verdict: 'Not charging',
      detail: `${volts.toFixed(1)} V with the engine running`,
      advice: 'A running engine should hold around 13.5 to 14.6 V. This low, the alternator is not keeping up — suspect the alternator, its belt, or the wiring to the battery. The vehicle is running on battery alone and will eventually stop.',
    };
  }
  if (volts < 13.4) {
    return {
      id: 'charging',
      label: 'Charging',
      status: 'watch',
      verdict: 'Charging weakly',
      detail: `${volts.toFixed(1)} V with the engine running`,
      advice: 'Lower than a healthy charging system usually holds. Worth checking the belt tension and the battery terminals before suspecting the alternator itself.',
    };
  }
  if (volts > 15.0) {
    return {
      id: 'charging',
      label: 'Charging',
      status: 'bad',
      verdict: 'Overcharging',
      detail: `${volts.toFixed(1)} V with the engine running`,
      advice: 'Above 15 V the voltage regulator is not controlling output. Sustained overcharging boils the battery dry and can damage electronics. Have the charging system checked promptly.',
    };
  }

  return {
    id: 'charging',
    label: 'Charging',
    status: 'good',
    verdict: 'Normal',
    detail: `${volts.toFixed(1)} V with the engine running`,
  };
}

/** Catalyst condition, from the service 06 monitor rather than a pass/fail flag. */
function checkCatalyst({ testResults }: HealthInputs): HealthCheck | null {
  const catalyst = groupByMonitor(testResults).filter(
    (group) => group.mid >= 0x35 && group.mid <= 0x38,
  );
  if (catalyst.length === 0) return null;

  const failing = catalyst.filter((group) => !group.allPassed);
  if (failing.length > 0) {
    return {
      id: 'catalyst',
      label: 'Catalytic converter',
      status: 'bad',
      verdict: 'Failing its test',
      detail: failing.map((g) => g.name).join(', '),
      advice: 'A converter failing its own monitor will set a P0420 or P0430 before long. Before replacing it, rule out the cheaper causes: an exhaust leak ahead of it, a tired downstream oxygen sensor, or an engine running rich enough to have damaged it.',
    };
  }

  const margins = catalyst
    .map((group) => group.worstMargin)
    .filter((m): m is number => m !== null);
  if (margins.length === 0) {
    return {
      id: 'catalyst',
      label: 'Catalytic converter',
      status: 'good',
      verdict: 'Passing',
      detail: 'Tested, no limit reported',
    };
  }

  const worst = Math.min(...margins);
  const percent = Math.round(worst * 100);

  return {
    id: 'catalyst',
    label: 'Catalytic converter',
    status: worst < 0.2 ? 'watch' : 'good',
    verdict: worst < 0.2 ? 'Close to its limit' : 'Healthy',
    detail: `${percent}% margin before failing`,
    advice: worst < 0.2
      ? 'Still passing, but with little room left. Watch this figure over the next few months — a converter that is genuinely wearing out will keep narrowing.'
      : undefined,
  };
}

/** Misfire counts, which service 06 reports per cylinder. */
function checkMisfires({ testResults }: HealthInputs): HealthCheck | null {
  const misfire = groupByMonitor(testResults).filter(
    (group) => group.mid >= 0xa0 && group.mid <= 0xac,
  );
  if (misfire.length === 0) return null;

  const cylinders = misfire.filter((group) => group.mid >= 0xa1);
  const withCounts = cylinders
    .map((group) => ({
      cylinder: group.mid - 0xa0,
      count: Math.max(...group.tests.map((t) => t.value)),
    }))
    .filter((entry) => Number.isFinite(entry.count));

  const total = withCounts.reduce((sum, entry) => sum + entry.count, 0);

  if (total === 0) {
    return {
      id: 'misfire',
      label: 'Misfires',
      status: 'good',
      verdict: 'None counted',
      detail: cylinders.length > 0 ? `Across ${cylinders.length} cylinders` : null,
    };
  }

  const worst = withCounts.reduce((a, b) => (b.count > a.count ? b : a));
  const concentrated = worst.count > total * 0.6 && withCounts.length > 1;

  return {
    id: 'misfire',
    label: 'Misfires',
    status: total > 50 ? 'bad' : 'watch',
    verdict: concentrated ? `Mostly cylinder ${worst.cylinder}` : 'Spread across cylinders',
    detail: `${total} counted, worst is cylinder ${worst.cylinder} at ${worst.count}`,
    advice: concentrated
      ? `Misfires concentrated on one cylinder point to that cylinder's own parts — spark plug, coil, or injector. Swapping the coil with a neighbouring cylinder and re-reading is the quickest way to confirm: if the count follows the coil, you have found it.`
      : 'Misfires spread across cylinders point to something shared — fuel pressure, a vacuum leak, or ignition timing — rather than one failed component.',
  };
}

/** Whether the oxygen sensors are actually switching, not just present. */
function checkOxygenSensors({ readings }: HealthInputs): HealthCheck | null {
  // Upstream narrowband sensors, which should oscillate in closed loop.
  const upstream = [0x14, 0x18].map((pid) => readings[pid]).filter((v): v is number => v !== undefined);
  if (upstream.length === 0) return null;

  // A sensor parked at either rail is stuck rather than switching.
  const stuck = upstream.filter((v) => v < 0.1 || v > 0.9);

  if (stuck.length === upstream.length) {
    return {
      id: 'oxygen',
      label: 'Oxygen sensors',
      status: 'watch',
      verdict: 'Not switching',
      detail: upstream.map((v) => `${v.toFixed(2)} V`).join(', '),
      advice: 'An upstream sensor sitting at one end of its range is either stuck or reading a genuinely extreme mixture. If the engine is warm and in closed loop, suspect the sensor; take one reading at idle and one at light throttle to tell the difference.',
    };
  }

  return {
    id: 'oxygen',
    label: 'Oxygen sensors',
    status: 'good',
    verdict: 'Switching normally',
    detail: upstream.map((v) => `${v.toFixed(2)} V`).join(', '),
  };
}

/** Coolant temperature, which matters both high and stuck-low. */
function checkCoolant({ readings }: HealthInputs): HealthCheck | null {
  const coolant = readings[0x05];
  const rpm = readings[0x0c];
  if (coolant === undefined) return null;

  if (coolant > 110) {
    return {
      id: 'coolant',
      label: 'Engine temperature',
      status: 'bad',
      verdict: 'Overheating',
      detail: `${coolant.toFixed(0)} °C`,
      advice: 'Stop and let the engine cool before going further. Continuing to drive an overheating engine risks warping the head, which is a far larger repair than whatever caused the overheating.',
    };
  }

  if (coolant > 102) {
    return {
      id: 'coolant',
      label: 'Engine temperature',
      status: 'watch',
      verdict: 'Running hot',
      detail: `${coolant.toFixed(0)} °C`,
      advice: 'Higher than a healthy engine normally sits. Check coolant level once cold, and that the radiator fan is cutting in.',
    };
  }

  // Only judge a cold reading once the engine has been running.
  const running = rpm !== undefined && rpm > 400;
  if (running && coolant < 70) {
    return {
      id: 'coolant',
      label: 'Engine temperature',
      status: 'watch',
      verdict: 'Not reaching temperature',
      detail: `${coolant.toFixed(0)} °C`,
      advice: 'If the engine has been running a while and is still this cool, the thermostat is probably stuck open. It wastes fuel and keeps the engine out of closed loop, so it is worth fixing even though nothing feels wrong.',
    };
  }

  return {
    id: 'coolant',
    label: 'Engine temperature',
    status: 'good',
    verdict: running ? 'Normal' : 'Cold, engine not running',
    detail: `${coolant.toFixed(0)} °C`,
  };
}

/**
 * Whether the codes were cleared recently — the single most useful check when
 * looking at a vehicle someone is trying to sell.
 */
function checkClearedRecently({ readings, scan }: HealthInputs): HealthCheck | null {
  const distance = readings[0x31];
  const warmups = readings[0x30];
  if (distance === undefined && warmups === undefined) return null;

  const permanent = scan?.permanent.length ?? 0;

  // Very little distance since clearing means someone reset the ECU lately.
  const recentlyCleared =
    (distance !== undefined && distance < 80) ||
    (warmups !== undefined && warmups < 5);

  if (!recentlyCleared) {
    return {
      id: 'cleared',
      label: 'Fault history',
      status: 'good',
      verdict: 'Settled',
      detail: distance !== undefined ? `${distance} km since codes were cleared` : `${warmups} warm-ups since clearing`,
    };
  }

  const detail = [
    distance !== undefined ? `${distance} km` : null,
    warmups !== undefined ? `${warmups} warm-ups` : null,
  ].filter(Boolean).join(' and ') + ' since codes were cleared';

  return {
    id: 'cleared',
    label: 'Fault history',
    status: permanent > 0 ? 'bad' : 'watch',
    verdict: permanent > 0 ? 'Cleared, but faults remain' : 'Recently cleared',
    detail,
    advice: permanent > 0
      ? 'The stored codes were wiped recently, but permanent codes are still present — and those can only be cleared by the vehicle itself, after it re-runs the test and passes. Something was wrong and has not been fixed.'
      : 'The engine computer was reset very recently, so an empty fault list proves little: a fault would need a full drive cycle to reappear. If you are inspecting a vehicle to buy, this is worth asking about, and worth re-scanning after a longer drive.',
  };
}

function format(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}
