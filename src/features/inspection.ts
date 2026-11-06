/**
 * Pre-purchase inspection.
 *
 * What the engine computer can tell you about a vehicle someone is selling.
 * The useful part is not the fault list — a seller can clear that in seconds —
 * but the things that survive clearing:
 *
 *  - Permanent codes, which only the vehicle itself can clear, and only after
 *    it re-runs the test and passes.
 *  - Readiness monitors, which all reset to incomplete when codes are cleared
 *    and take a full drive cycle to come back.
 *  - Distance and warm-ups since clearing, which say when it happened.
 *
 * A clean fault list on a vehicle whose monitors are all incomplete and whose
 * counters read near zero is not evidence of a healthy vehicle. It is evidence
 * of a recent reset.
 */

import { lookupDtc } from '@/data/dtcCatalog';
import type { ReadinessReport } from '@/obd/monitors';
import type { ScanResult } from '@/obd/session';
import type { DecodedVin } from '@/obd/vin';
import type { HealthCheck } from './health';

export type FlagLevel = 'red' | 'amber' | 'note';

export interface InspectionFlag {
  level: FlagLevel;
  title: string;
  detail: string;
  /** What to actually say or do about it. */
  action: string;
}

export interface InspectionReport {
  flags: InspectionFlag[];
  /** Overall read, from the flags present. */
  verdict: 'clear' | 'questions' | 'serious';
  summary: string;
}

export interface InspectionInputs {
  vin: DecodedVin | null;
  scan: ScanResult | null;
  readiness: ReadinessReport | null;
  readings: Record<number, number>;
  checks: HealthCheck[];
  performanceCounters: { label: string; numerator: number; denominator: number }[];
}

export function buildInspection(inputs: InspectionInputs): InspectionReport {
  const flags: InspectionFlag[] = [];
  const { scan, readiness, readings, checks, vin } = inputs;

  // --- the things clearing codes cannot hide -------------------------------

  const permanent = scan?.permanent ?? [];
  if (permanent.length > 0) {
    flags.push({
      level: 'red',
      title: `${permanent.length} permanent fault ${permanent.length === 1 ? 'code' : 'codes'}`,
      detail: permanent
        .map((dtc) => `${dtc.code} — ${lookupDtc(dtc.code).title}`)
        .join('; '),
      action:
        'Permanent codes cannot be cleared with a scan tool. Only the vehicle clears them, after it re-runs the test and passes. Their presence means a fault was real and has not been confirmed fixed — ask directly what it was and what was done about it.',
    });
  }

  const distanceSinceCleared = readings[0x31];
  const warmupsSinceCleared = readings[0x30];
  const recentlyCleared =
    (distanceSinceCleared !== undefined && distanceSinceCleared < 80) ||
    (warmupsSinceCleared !== undefined && warmupsSinceCleared < 5);

  if (recentlyCleared) {
    const parts = [
      distanceSinceCleared !== undefined ? `${distanceSinceCleared} km` : null,
      warmupsSinceCleared !== undefined ? `${warmupsSinceCleared} warm-ups` : null,
    ].filter(Boolean);

    flags.push({
      level: permanent.length > 0 ? 'red' : 'amber',
      title: 'Fault memory was cleared recently',
      detail: `Only ${parts.join(' and ')} since the codes were last cleared.`,
      action:
        'An empty fault list proves little this soon after a reset — most faults need a full drive cycle to reappear. Ask when and why it was cleared, then drive the vehicle properly and scan again before deciding.',
    });
  }

  const incomplete = readiness
    ? readiness.monitors.filter((m) => m.supported && !m.complete)
    : [];

  if (readiness && incomplete.length > 0) {
    const total = readiness.monitors.filter((m) => m.supported).length;
    flags.push({
      level: recentlyCleared ? 'red' : 'amber',
      title: `${incomplete.length} of ${total} emission self-checks incomplete`,
      detail: incomplete.map((m) => m.name).join(', '),
      action: recentlyCleared
        ? 'Incomplete monitors together with a recent clear is the signature of a reset done shortly before viewing. It is also exactly the state that fails an emissions test.'
        : 'Monitors reset when the battery is disconnected or codes are cleared, and need a mixture of driving to finish. Worth knowing before an emissions test is due.',
    });
  }

  // --- what the vehicle is reporting now ------------------------------------

  if (readiness?.milOn) {
    flags.push({
      level: 'red',
      title: 'Warning lamp is on',
      detail: `${readiness.dtcCount} stored ${readiness.dtcCount === 1 ? 'fault' : 'faults'}.`,
      action: 'The engine computer is reporting an active fault right now. Whatever the seller says about it, the codes below are what the vehicle itself is recording.',
    });
  }

  const stored = scan?.stored ?? [];
  const serious = stored.filter((dtc) => {
    const info = lookupDtc(dtc.code);
    return info.action === 'stop' || info.action === 'urgent';
  });

  if (serious.length > 0) {
    flags.push({
      level: 'red',
      title: `${serious.length} serious stored ${serious.length === 1 ? 'fault' : 'faults'}`,
      detail: serious.map((dtc) => `${dtc.code} — ${lookupDtc(dtc.code).title}`).join('; '),
      action: 'These are faults that affect how the vehicle runs or whether it is safe to drive, rather than emissions alone.',
    });
  }

  // --- what the sensors say -------------------------------------------------

  for (const check of checks) {
    if (check.status === 'bad') {
      flags.push({
        level: 'red',
        title: check.label,
        detail: `${check.verdict}${check.detail ? ` — ${check.detail}` : ''}`,
        action: check.advice ?? 'Worth investigating before committing.',
      });
    } else if (check.status === 'watch') {
      flags.push({
        level: 'amber',
        title: check.label,
        detail: `${check.verdict}${check.detail ? ` — ${check.detail}` : ''}`,
        action: check.advice ?? 'Not wrong, but worth raising.',
      });
    }
  }

  // --- identity -------------------------------------------------------------

  if (vin && vin.checkDigitValid === false) {
    flags.push({
      level: 'note',
      title: 'VIN check digit does not validate',
      detail: vin.vin,
      action:
        'Several European makers do not use the check digit, so this is often nothing. It is still worth confirming the VIN on the dashboard, the door pillar and the paperwork all match what the computer reports.',
    });
  }

  const odometer = readings[0xa6];
  if (odometer !== undefined) {
    flags.push({
      level: 'note',
      title: 'Odometer read from the computer',
      detail: `${odometer.toFixed(0)} km`,
      action:
        'Few vehicles report odometer over standard OBD-II, so this is worth having: compare it with the dashboard reading and the service history.',
    });
  }

  const red = flags.filter((f) => f.level === 'red').length;
  const amber = flags.filter((f) => f.level === 'amber').length;

  const verdict: InspectionReport['verdict'] =
    red > 0 ? 'serious' : amber > 0 ? 'questions' : 'clear';

  const summary =
    verdict === 'serious'
      ? `${red} thing${red === 1 ? '' : 's'} here would need answering before buying.`
      : verdict === 'questions'
        ? `Nothing alarming, but ${amber} thing${amber === 1 ? '' : 's'} worth asking about.`
        : 'The engine computer is not reporting anything untoward.';

  return { flags, verdict, summary };
}

/** The report as plain text, for sharing or keeping with the paperwork. */
export function inspectionToText(
  report: InspectionReport,
  vin: DecodedVin | null,
  readings: Record<number, number>,
): string {
  const lines: string[] = [];

  lines.push('OBD Scout — pre-purchase inspection');
  lines.push(new Date().toLocaleString());
  lines.push('');

  if (vin) {
    lines.push(`VIN            ${vin.vin}`);
    if (vin.manufacturer) lines.push(`Manufacturer   ${vin.manufacturer}`);
    if (vin.modelYear) lines.push(`Model year     ${vin.modelYear}`);
    if (vin.country) lines.push(`Built in       ${vin.country}`);
    lines.push('');
  }

  const odometer = readings[0xa6];
  if (odometer !== undefined) lines.push(`Odometer       ${odometer.toFixed(0)} km`);

  lines.push(`Verdict        ${report.summary}`);
  lines.push('');

  for (const flag of report.flags) {
    const marker = flag.level === 'red' ? '[!]' : flag.level === 'amber' ? '[?]' : '[i]';
    lines.push(`${marker} ${flag.title}`);
    lines.push(`    ${flag.detail}`);
    lines.push(`    ${flag.action}`);
    lines.push('');
  }

  lines.push('Read over standard OBD-II. It covers the engine and emissions');
  lines.push('systems only — not the gearbox, ABS, airbags, bodywork or');
  lines.push('structure, none of which this can see.');

  return lines.join('\n');
}
