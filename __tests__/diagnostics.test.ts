/**
 * Tests for the diagnostic layers added on top of basic code reading: VIN
 * decoding, service 06 test results, and the health assessment that reads
 * them in context.
 */

import { decodeVin, describeVin } from '@/obd/vin';
import {
  decodeTestResults,
  describeMargin,
  groupByMonitor,
  monitorName,
} from '@/obd/mode06';
import { assessHealth, overallHealth } from '@/features/health';
import { buildInspection } from '@/features/inspection';
import { ObdSession } from '@/obd/session';
import { DemoTransport } from '@/obd/transports/demo';

jest.setTimeout(30000);

describe('VIN decoding', () => {
  it('pulls the manufacturer out of the first three characters', () => {
    const decoded = decodeVin('WAUZZZ8V9FA123456');
    expect(decoded?.wmi).toBe('WAU');
    expect(decoded?.manufacturer).toBe('Audi');
    expect(decoded?.country).toBe('Germany');
    expect(decoded?.region).toBe('Europe');
  });

  it('decodes an Indian VIN', () => {
    const decoded = decodeVin('MA3ERLF1S00123456');
    expect(decoded?.manufacturer).toBe('Maruti Suzuki');
    expect(decoded?.country).toBe('India');
  });

  it('decodes the model year and offers the thirty-year alternative', () => {
    // 'F' is the sixth code, so 1985 or 2015.
    const decoded = decodeVin('WAUZZZ8V9FA123456');
    expect(decoded?.modelYear).toBe(2015);
    expect(decoded?.modelYearAlternative).toBe(1985);
  });

  it('does not claim a year the vehicle could not have been built in', () => {
    const decoded = decodeVin('WAUZZZ8V9FA123456');
    const currentYear = new Date().getFullYear();
    expect(decoded?.modelYear).toBeLessThanOrEqual(currentYear + 1);
  });

  it('returns null rather than guessing at a malformed VIN', () => {
    expect(decodeVin('TOOSHORT')).toBeNull();
    expect(decodeVin('')).toBeNull();
  });

  it('reports an unknown manufacturer as unknown', () => {
    const decoded = decodeVin('QQQ12345678901234');
    expect(decoded).not.toBeNull();
    expect(decoded?.manufacturer).toBeNull();
  });

  it('describes what it knows and omits what it does not', () => {
    const decoded = decodeVin('WAUZZZ8V9FA123456');
    expect(describeVin(decoded!)).toContain('Audi');
    expect(describeVin(decoded!)).toContain('Germany');
  });
});

describe('service 06 test results', () => {
  /** MID, TID, UASID, value, min, max — one nine-byte record. */
  const record = (mid: number, tid: number, uasid: number, value: number, min: number, max: number) => [
    mid, tid, uasid,
    Math.floor(value / 256), value % 256,
    Math.floor(min / 256), min % 256,
    Math.floor(max / 256), max % 256,
  ];

  it('decodes a record and scales it by the unit-and-scaling ID', () => {
    // UASID 0x0C is volts at 0.01 per count.
    const results = decodeTestResults(record(0x01, 0x01, 0x0c, 72, 20, 90));
    expect(results).toHaveLength(1);
    expect(results[0]?.value).toBeCloseTo(0.72, 5);
    expect(results[0]?.unit).toBe('V');
    expect(results[0]?.scalingKnown).toBe(true);
  });

  it('passes a value inside its limits and fails one outside', () => {
    expect(decodeTestResults(record(0x35, 0x01, 0x03, 48, 0, 75))[0]?.passed).toBe(true);
    expect(decodeTestResults(record(0x35, 0x01, 0x03, 90, 0, 75))[0]?.passed).toBe(false);
  });

  it('computes margin against an upper limit', () => {
    // 48 of a permitted 75 leaves 36% headroom.
    const result = decodeTestResults(record(0x35, 0x01, 0x03, 48, 0, 75))[0];
    expect(result?.margin).toBeCloseTo(0.36, 2);
  });

  it('still judges pass and margin when the scaling is unknown', () => {
    // 0x77 is not in the table, so the value stays raw.
    const result = decodeTestResults(record(0x35, 0x01, 0x77, 20, 0, 100))[0];
    expect(result?.scalingKnown).toBe(false);
    expect(result?.value).toBe(20);
    expect(result?.passed).toBe(true);
    expect(result?.margin).toBeCloseTo(0.8, 5);
  });

  it('skips the support bitmaps, which are not tests', () => {
    expect(decodeTestResults(record(0x00, 0x01, 0x01, 1, 0, 1))).toHaveLength(0);
    expect(decodeTestResults(record(0xa0, 0x01, 0x01, 1, 0, 1))).toHaveLength(0);
  });

  it('reads several records from one payload', () => {
    const payload = [
      ...record(0x01, 0x01, 0x0c, 72, 20, 90),
      ...record(0x35, 0x01, 0x03, 48, 0, 75),
    ];
    expect(decodeTestResults(payload)).toHaveLength(2);
  });

  it('names the monitors the standard defines and no others', () => {
    expect(monitorName(0x01)).toEqual({ name: 'Oxygen sensor bank 1 sensor 1', known: true });
    expect(monitorName(0x06)).toEqual({ name: 'Oxygen sensor bank 2 sensor 2', known: true });
    expect(monitorName(0x35)).toEqual({ name: 'Catalytic converter, bank 1', known: true });
    expect(monitorName(0xa3)).toEqual({ name: 'Misfire, cylinder 3', known: true });
    expect(monitorName(0x7e).known).toBe(false);
  });

  it('sorts failing monitors ahead of passing ones', () => {
    const payload = [
      ...record(0x35, 0x01, 0x03, 10, 0, 100), // comfortable
      ...record(0x01, 0x01, 0x03, 150, 0, 100), // failing
    ];
    const groups = groupByMonitor(decodeTestResults(payload));
    expect(groups[0]?.allPassed).toBe(false);
  });

  it('describes a margin in words', () => {
    expect(describeMargin(0.94, true)).toBe('94% margin');
    expect(describeMargin(0.3, true)).toContain('narrowing');
    expect(describeMargin(0.05, true)).toContain('close to the limit');
    expect(describeMargin(0.9, false)).toBe('failing');
  });
});

describe('health assessment', () => {
  const base = { testResults: [], scan: null, readiness: null };

  it('calls a small fuel trim normal', () => {
    const checks = assessHealth({ ...base, readings: { 0x06: 2, 0x07: 1.5 } });
    const mixture = checks.find((c) => c.id === 'mixture');
    expect(mixture?.status).toBe('good');
  });

  it('flags a large positive trim as running lean', () => {
    const checks = assessHealth({ ...base, readings: { 0x06: 14, 0x07: 15 } });
    const mixture = checks.find((c) => c.id === 'mixture');
    expect(mixture?.status).toBe('bad');
    expect(mixture?.verdict).toBe('Running lean');
  });

  it('blames the intake when lean at idle and fuel delivery when lean under load', () => {
    const idle = assessHealth({
      ...base,
      readings: { 0x06: 8, 0x07: 8, 0x0c: 800, 0x04: 20 },
    }).find((c) => c.id === 'mixture');
    expect(idle?.advice).toMatch(/vacuum|intake|leak/i);

    const load = assessHealth({
      ...base,
      readings: { 0x06: 8, 0x07: 8, 0x0c: 3000, 0x04: 70 },
    }).find((c) => c.id === 'mixture');
    expect(load?.advice).toMatch(/pump|filter|delivery/i);
  });

  it('notices when the two banks disagree', () => {
    const checks = assessHealth({
      ...base,
      readings: { 0x06: 1, 0x07: 1, 0x08: 14, 0x09: 12 },
    });
    expect(checks.find((c) => c.id === 'mixture')?.verdict).toBe('Banks disagree');
  });

  it('separates a flat battery from a failing alternator', () => {
    const engineOff = assessHealth({ ...base, readings: { 0x42: 11.6, 0x0c: 0 } });
    expect(engineOff.find((c) => c.id === 'charging')?.verdict).toBe('Flat');

    const running = assessHealth({ ...base, readings: { 0x42: 12.4, 0x0c: 800 } });
    expect(running.find((c) => c.id === 'charging')?.verdict).toBe('Not charging');
  });

  it('calls a healthy charging voltage normal', () => {
    const checks = assessHealth({ ...base, readings: { 0x42: 14.2, 0x0c: 800 } });
    expect(checks.find((c) => c.id === 'charging')?.status).toBe('good');
  });

  it('flags overheating as serious', () => {
    const checks = assessHealth({ ...base, readings: { 0x05: 118 } });
    expect(checks.find((c) => c.id === 'coolant')?.status).toBe('bad');
  });

  it('spots a thermostat stuck open only once the engine is running', () => {
    const running = assessHealth({ ...base, readings: { 0x05: 55, 0x0c: 2000 } });
    expect(running.find((c) => c.id === 'coolant')?.verdict).toBe('Not reaching temperature');

    const off = assessHealth({ ...base, readings: { 0x05: 55, 0x0c: 0 } });
    expect(off.find((c) => c.id === 'coolant')?.status).toBe('good');
  });

  it('takes the worst check as the overall verdict', () => {
    expect(overallHealth([
      { id: 'a', label: 'A', status: 'good', verdict: '', detail: null },
      { id: 'b', label: 'B', status: 'bad', verdict: '', detail: null },
    ])).toBe('bad');
  });

  it('omits checks the vehicle gave no data for', () => {
    expect(assessHealth({ ...base, readings: {} })).toHaveLength(0);
  });
});

describe('pre-purchase inspection', () => {
  const base = {
    vin: null,
    readiness: null,
    checks: [],
    performanceCounters: [],
  };

  it('treats a recent clear as something to ask about', () => {
    const report = buildInspection({
      ...base,
      scan: null,
      readings: { 0x31: 12, 0x30: 1 },
    });
    const flag = report.flags.find((f) => f.title.includes('cleared'));
    expect(flag).toBeDefined();
    expect(report.verdict).toBe('questions');
  });

  it('treats a recent clear with permanent codes still set as serious', () => {
    const report = buildInspection({
      ...base,
      scan: {
        stored: [], pending: [],
        permanent: [{ code: 'P0420', system: 'P', origin: 'permanent', rawHex: '0420' }],
        readiness: null, servicesAnswered: [], at: Date.now(),
      },
      readings: { 0x31: 12, 0x30: 1 },
    });
    expect(report.verdict).toBe('serious');
    expect(report.flags.some((f) => f.title.includes('permanent'))).toBe(true);
  });

  it('says nothing is flagged on a settled, clean vehicle', () => {
    const report = buildInspection({
      ...base,
      scan: { stored: [], pending: [], permanent: [], readiness: null, servicesAnswered: [], at: Date.now() },
      readings: { 0x31: 4000, 0x30: 60 },
    });
    expect(report.verdict).toBe('clear');
  });
});

describe('the whole diagnostic path against the simulator', () => {
  it('reads monitor test results and finds the misfiring cylinder', async () => {
    const session = new ObdSession();
    await session.connect(new DemoTransport());

    const results = await session.readTestResults();
    expect(results.length).toBeGreaterThan(0);

    const groups = groupByMonitor(results);

    // The catalyst is passing but with its margin closing.
    const catalyst = groups.find((g) => g.mid === 0x35);
    expect(catalyst?.allPassed).toBe(true);
    expect(catalyst?.worstMargin).toBeLessThan(0.5);

    // Cylinder 1 carries far more misfires than the others, matching P0301.
    const cylinder1 = groups.find((g) => g.mid === 0xa1);
    const cylinder3 = groups.find((g) => g.mid === 0xa3);
    expect(cylinder1?.tests[0]?.value).toBeGreaterThan(cylinder3?.tests[0]?.value ?? 0);

    await session.disconnect();
  });

  it('reads the in-use performance counters', async () => {
    const session = new ObdSession();
    await session.connect(new DemoTransport());

    const counters = await session.readPerformanceCounters();
    expect(counters.length).toBeGreaterThan(0);
    expect(counters[0]?.denominator).toBeGreaterThan(0);

    await session.disconnect();
  });

  it('reads the oxygen sensor voltage and its trim together', async () => {
    const session = new ObdSession();
    await session.connect(new DemoTransport());

    const reading = await session.readValue(0x14);
    expect(reading).not.toBeNull();
    expect(reading!.value).toBeGreaterThan(0);
    expect(reading!.value).toBeLessThan(1.3);

    await session.disconnect();
  });
});
