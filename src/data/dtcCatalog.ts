/**
 * Fault code lookup.
 *
 * Three layers, tried in order:
 *
 *  1. The hand-written table of generic codes.
 *  2. Family generators, for the ranges the standard defines by repetition —
 *     per-cylinder misfires, injector circuits, ignition coils, oxygen sensors
 *     by bank and position. Generating these beats writing out hundreds of
 *     near-identical rows, and it covers cylinder counts no table would.
 *  3. A structural fallback that says what the code's number range means
 *     without inventing a cause.
 *
 * Manufacturer-specific codes (first digit 1 or 3) are never guessed at. The
 * standard leaves their meaning to the maker, so the app says so plainly
 * instead of offering a description that might be wrong.
 */

import { isGenericCode, powertrainArea, systemName, type DtcSystem } from '@/obd/dtc';
import { DTC_ROWS, type Driveability, type DtcRow, type Severity } from './dtcData';

export type ActionLevel = 'info' | 'monitor' | 'service-soon' | 'urgent' | 'stop';
export type DriveAdvice = 'ok' | 'with-care' | 'do-not-drive';

export interface DtcInfo {
  code: string;
  title: string;
  meaning: string;
  causes: string[];
  action: ActionLevel;
  drive: DriveAdvice;
  /** Where the description came from, so the UI can be honest about it. */
  source: 'catalog' | 'generated' | 'structural' | 'manufacturer';
  /** True when the standard defines this code; false for maker-specific ones. */
  generic: boolean;
}

const SEVERITY_MAP: Record<Severity, ActionLevel> = {
  i: 'info',
  m: 'monitor',
  s: 'service-soon',
  u: 'urgent',
  x: 'stop',
};

const DRIVE_MAP: Record<Driveability, DriveAdvice> = {
  o: 'ok',
  c: 'with-care',
  n: 'do-not-drive',
};

function fromRow(row: DtcRow): DtcInfo {
  const [code, title, meaning, causes, severity, drive] = row;
  return {
    code,
    title,
    meaning,
    causes: causes.split('|').filter(Boolean),
    action: SEVERITY_MAP[severity],
    drive: DRIVE_MAP[drive],
    source: 'catalog',
    generic: true,
  };
}

const CATALOG = new Map<string, DtcInfo>(
  DTC_ROWS.map((row) => [row[0], fromRow(row)]),
);

// --- family generators -----------------------------------------------------

type Generator = (code: string) => DtcInfo | null;

/** P0301-P0320: misfire on a specific cylinder. */
const misfireGenerator: Generator = (code) => {
  const match = /^P03(\d{2})$/.exec(code);
  if (!match?.[1]) return null;
  const cylinder = Number.parseInt(match[1], 10);
  if (cylinder < 1 || cylinder > 20) return null;
  return {
    code,
    title: `Cylinder ${cylinder} misfire detected`,
    meaning: `Cylinder ${cylinder} is not burning its fuel properly. Unburnt fuel passing into the exhaust can overheat and ruin the catalytic converter, so this is worth attending to quickly.`,
    causes: [
      `Worn spark plug or failed ignition coil on cylinder ${cylinder}`,
      `Blocked or leaking fuel injector on cylinder ${cylinder}`,
      'Vacuum leak near that cylinder',
      'Low compression from a worn valve or piston ring',
    ],
    action: 'urgent',
    drive: 'with-care',
    source: 'generated',
    generic: true,
  };
};

/** P0261-P0296: injector circuit faults, two codes per cylinder. */
const injectorGenerator: Generator = (code) => {
  const match = /^P02(\d{2})$/.exec(code);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  if (n < 61 || n > 96) return null;

  // The standard lays these out as three codes per cylinder from 0261:
  // low, high, then a contribution/balance fault.
  const offset = n - 61;
  const cylinder = Math.floor(offset / 3) + 1;
  const variant = offset % 3;
  const kind =
    variant === 0 ? 'circuit low' : variant === 1 ? 'circuit high' : 'contribution or balance fault';

  return {
    code,
    title: `Cylinder ${cylinder} injector ${kind}`,
    meaning:
      variant === 2
        ? `Cylinder ${cylinder} is not contributing its share of power, which usually means its injector is delivering the wrong amount of fuel.`
        : `The injector circuit for cylinder ${cylinder} is reading outside its normal range.`,
    causes: [
      `Failed or blocked injector on cylinder ${cylinder}`,
      'Damaged injector wiring or a loose connector',
      'Engine computer injector driver fault',
      ...(variant === 2 ? ['Low compression on that cylinder'] : []),
    ],
    action: 'urgent',
    drive: 'with-care',
    source: 'generated',
    generic: true,
  };
};

/** P0351-P0362: ignition coil primary/secondary circuit, one per cylinder. */
const coilGenerator: Generator = (code) => {
  const match = /^P03(\d{2})$/.exec(code);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  if (n < 51 || n > 62) return null;
  const cylinder = n - 50;
  return {
    code,
    title: `Ignition coil ${cylinder} primary or secondary circuit`,
    meaning: `The ignition coil circuit for cylinder ${cylinder} is faulty, so that cylinder may not be getting a reliable spark.`,
    causes: [
      `Failed ignition coil on cylinder ${cylinder}`,
      'Damaged coil wiring or connector',
      'Worn spark plug putting extra load on the coil',
      'Engine computer coil driver fault',
    ],
    action: 'urgent',
    drive: 'with-care',
    source: 'generated',
    generic: true,
  };
};

/**
 * P0130-P0167: oxygen sensor faults, laid out as a block of 10 codes per
 * sensor across two banks of four sensors.
 */
const oxygenGenerator: Generator = (code) => {
  const match = /^P01([3-6]\d)$/.exec(code);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  if (n < 30 || n > 67) return null;

  const index = Math.floor((n - 30) / 10); // 0..3
  const variant = (n - 30) % 10;
  const bank = index < 2 ? 1 : 2;
  const sensor = (index % 2) + 1;

  const VARIANTS: Record<number, { title: string; meaning: string; causes: string[] }> = {
    0: {
      title: 'circuit fault',
      meaning: 'is not giving a usable signal',
      causes: ['Failed oxygen sensor', 'Exhaust leak near the sensor', 'Damaged wiring or connector'],
    },
    1: {
      title: 'circuit low voltage',
      meaning: 'is reporting a persistently lean mixture',
      causes: ['Exhaust leak ahead of the sensor', 'Failed oxygen sensor', 'Low fuel pressure or a vacuum leak'],
    },
    2: {
      title: 'circuit high voltage',
      meaning: 'is reporting a persistently rich mixture',
      causes: ['Failed oxygen sensor', 'Leaking fuel injector', 'Fuel pressure too high'],
    },
    3: {
      title: 'slow response',
      meaning: 'is still working but reacting too slowly for accurate fuel control',
      causes: ['Ageing oxygen sensor', 'Sensor contaminated by oil or coolant', 'Exhaust leak'],
    },
    4: {
      title: 'no activity detected',
      meaning: 'is not changing at all',
      causes: ['Failed oxygen sensor', 'Broken or disconnected wiring', 'Blown heater fuse'],
    },
    5: {
      title: 'heater circuit fault',
      meaning: 'has a heater that is not working, so it warms up too slowly to be used',
      causes: ['Failed heater element inside the sensor', 'Blown fuse', 'Damaged wiring'],
    },
  };

  const spec = VARIANTS[variant];
  if (!spec) return null;

  const position = sensor === 1 ? 'before the catalytic converter' : 'after the catalytic converter';
  // A downstream sensor affects emissions monitoring rather than how the engine runs.
  const action: ActionLevel = sensor === 1 ? 'service-soon' : 'monitor';

  return {
    code,
    title: `Oxygen sensor ${spec.title}, bank ${bank} sensor ${sensor}`,
    meaning: `The oxygen sensor on bank ${bank}, ${position}, ${spec.meaning}.`,
    causes: spec.causes,
    action,
    drive: sensor === 1 ? 'with-care' : 'ok',
    source: 'generated',
    generic: true,
  };
};

/** U0100-U0199: lost communication with a named module. */
const lostCommGenerator: Generator = (code) => {
  const match = /^U01(\d{2})$/.exec(code);
  if (!match?.[1]) return null;
  return {
    code,
    title: 'Lost communication with a control module',
    meaning:
      'One of the vehicle’s computers has stopped answering on the communication network. The features it controls will be unavailable, and other modules may store codes of their own as a result.',
    causes: [
      'Damaged CAN bus wiring between modules',
      'Lost power or earth at the module that went quiet',
      'Blown fuse',
      'Failed control module',
    ],
    action: 'urgent',
    drive: 'with-care',
    source: 'generated',
    generic: true,
  };
};

const GENERATORS: Generator[] = [
  misfireGenerator,
  coilGenerator,
  injectorGenerator,
  oxygenGenerator,
  lostCommGenerator,
];

// --- fallbacks -------------------------------------------------------------

function manufacturerSpecific(code: string, system: DtcSystem): DtcInfo {
  return {
    code,
    title: `${systemName(system)} code defined by the manufacturer`,
    meaning:
      'This code is not part of the OBD-II standard. The maker decides what it means, so its description has to come from their own service documentation for your exact model. The code is real and was read from the vehicle — only its wording is unavailable here.',
    causes: [],
    action: 'service-soon',
    drive: 'with-care',
    source: 'manufacturer',
    generic: false,
  };
}

function structural(code: string, system: DtcSystem): DtcInfo {
  const area = powertrainArea(code);
  const where = area ? `, in the area the standard assigns to ${area.toLowerCase()}` : '';
  return {
    code,
    title: `${systemName(system)} fault code ${code}`,
    meaning: `This is a standard ${systemName(system).toLowerCase()} code${where}. A full description is not in this app's catalogue, so treat the code itself as the reliable part and look it up against your vehicle's service information.`,
    causes: [],
    action: 'service-soon',
    drive: 'with-care',
    source: 'structural',
    generic: true,
  };
}

// --- public lookup ---------------------------------------------------------

/** Look up a code. Always returns something; never invents a cause. */
export function lookupDtc(code: string): DtcInfo {
  const normalised = code.trim().toUpperCase();

  const exact = CATALOG.get(normalised);
  if (exact) return exact;

  if (!isGenericCode(normalised)) {
    return manufacturerSpecific(normalised, systemLetter(normalised));
  }

  for (const generate of GENERATORS) {
    const generated = generate(normalised);
    if (generated) return generated;
  }

  return structural(normalised, systemLetter(normalised));
}

function systemLetter(code: string): DtcSystem {
  const letter = code[0];
  return letter === 'C' || letter === 'B' || letter === 'U' ? letter : 'P';
}

/** Every code the catalogue describes, for the browsable reference screen. */
export function allCatalogCodes(): DtcInfo[] {
  return [...CATALOG.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Search the catalogue by code or by words in the title. */
export function searchCatalog(query: string): DtcInfo[] {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return [];

  // A complete code should resolve even when it is not in the table.
  if (/^[PBCU][0-3][0-9A-F]{3}$/.test(q)) return [lookupDtc(q)];

  return allCatalogCodes()
    .filter(
      (info) =>
        info.code.includes(q) ||
        info.title.toUpperCase().includes(q) ||
        info.meaning.toUpperCase().includes(q),
    )
    .slice(0, 60);
}

/** Ranking used to sort a fault list worst-first. */
export function actionRank(action: ActionLevel): number {
  switch (action) {
    case 'stop':
      return 0;
    case 'urgent':
      return 1;
    case 'service-soon':
      return 2;
    case 'monitor':
      return 3;
    case 'info':
      return 4;
  }
}

export function actionLabel(action: ActionLevel): string {
  switch (action) {
    case 'stop':
      return 'Stop driving';
    case 'urgent':
      return 'Needs attention';
    case 'service-soon':
      return 'Service soon';
    case 'monitor':
      return 'Keep an eye on it';
    case 'info':
      return 'For information';
  }
}

export function driveLabel(drive: DriveAdvice): string {
  switch (drive) {
    case 'ok':
      return 'Fine to drive';
    case 'with-care':
      return 'Drive with care';
    case 'do-not-drive':
      return 'Do not drive';
  }
}
