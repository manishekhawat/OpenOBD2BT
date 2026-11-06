/**
 * VIN decoding.
 *
 * A VIN is structured, not arbitrary, so most of what people want from a
 * "lookup" is already encoded in the 17 characters the vehicle reports. This
 * decodes the parts the standard fixes — world manufacturer, region of
 * assembly, model year and plant code — entirely offline. Nothing is sent
 * anywhere, and no service is needed.
 *
 * What it deliberately does not do is guess the model. That lives in the
 * manufacturer's own interpretation of characters 4 to 8, which differs by
 * maker and is not public in any complete form.
 */

import { looksLikeVin, vinCheckDigitValid } from './vehicleInfo';

export interface DecodedVin {
  vin: string;
  /** World Manufacturer Identifier — the first three characters. */
  wmi: string;
  manufacturer: string | null;
  country: string | null;
  region: string | null;
  /** Four-digit year, or null when the VIN predates a decodable scheme. */
  modelYear: number | null;
  /** Ambiguous by design: the year code repeats every 30 years. */
  modelYearAlternative: number | null;
  plantCode: string;
  /** Characters 4–8, which the manufacturer defines. */
  vehicleDescriptor: string;
  /** Characters 10–17. */
  serial: string;
  checkDigitValid: boolean | null;
}

/**
 * Region from the first character, which the standard assigns by block.
 * Coarser than the country table but always correct.
 */
function regionFor(first: string): string | null {
  if (/[A-H]/.test(first)) return 'Africa';
  if (/[J-R]/.test(first)) return 'Asia';
  if (/[S-Z]/.test(first)) return 'Europe';
  if (/[1-5]/.test(first)) return 'North America';
  if (/[6-7]/.test(first)) return 'Oceania';
  if (/[8-9]/.test(first)) return 'South America';
  return null;
}

/**
 * Country from the first two characters. The standard allocates ranges, so
 * each entry below is a range rather than a single code.
 */
const COUNTRY_RANGES: { from: string; to: string; country: string }[] = [
  { from: 'AA', to: 'AH', country: 'South Africa' },
  { from: 'AJ', to: 'AN', country: 'Ivory Coast' },
  { from: 'BF', to: 'BK', country: 'Kenya' },
  { from: 'CF', to: 'CK', country: 'Morocco' },
  { from: 'JA', to: 'J0', country: 'Japan' },
  { from: 'KA', to: 'KE', country: 'Sri Lanka' },
  { from: 'KF', to: 'KK', country: 'Israel' },
  { from: 'KL', to: 'KR', country: 'South Korea' },
  { from: 'LA', to: 'L0', country: 'China' },
  { from: 'MA', to: 'ME', country: 'India' },
  { from: 'MF', to: 'MK', country: 'Indonesia' },
  { from: 'ML', to: 'MR', country: 'Thailand' },
  { from: 'MS', to: 'MS', country: 'Myanmar' },
  { from: 'NA', to: 'NE', country: 'Iran' },
  { from: 'NF', to: 'NK', country: 'Pakistan' },
  { from: 'NL', to: 'NR', country: 'Turkey' },
  { from: 'PA', to: 'PE', country: 'Philippines' },
  { from: 'PF', to: 'PK', country: 'Singapore' },
  { from: 'PL', to: 'PR', country: 'Malaysia' },
  { from: 'RF', to: 'RK', country: 'Taiwan' },
  { from: 'SA', to: 'SM', country: 'United Kingdom' },
  { from: 'SN', to: 'ST', country: 'Germany' },
  { from: 'SU', to: 'SZ', country: 'Poland' },
  { from: 'TA', to: 'TH', country: 'Switzerland' },
  { from: 'TJ', to: 'TP', country: 'Czech Republic' },
  { from: 'TR', to: 'TV', country: 'Hungary' },
  { from: 'TW', to: 'T1', country: 'Portugal' },
  { from: 'UH', to: 'UM', country: 'Denmark' },
  { from: 'UN', to: 'UT', country: 'Ireland' },
  { from: 'UU', to: 'UZ', country: 'Romania' },
  { from: 'VA', to: 'VE', country: 'Austria' },
  { from: 'VF', to: 'VR', country: 'France' },
  { from: 'VS', to: 'VW', country: 'Spain' },
  { from: 'VX', to: 'V2', country: 'Serbia' },
  { from: 'WA', to: 'W0', country: 'Germany' },
  { from: 'XA', to: 'XE', country: 'Bulgaria' },
  { from: 'XF', to: 'XK', country: 'Greece' },
  { from: 'XL', to: 'XR', country: 'Netherlands' },
  { from: 'XS', to: 'XW', country: 'Soviet Union / CIS' },
  { from: 'XX', to: 'X2', country: 'Luxembourg' },
  { from: 'X3', to: 'X9', country: 'Russia' },
  { from: 'YA', to: 'YE', country: 'Belgium' },
  { from: 'YF', to: 'YK', country: 'Finland' },
  { from: 'YS', to: 'YW', country: 'Sweden' },
  { from: 'ZA', to: 'ZR', country: 'Italy' },
  { from: '1A', to: '10', country: 'United States' },
  { from: '2A', to: '20', country: 'Canada' },
  { from: '3A', to: '37', country: 'Mexico' },
  { from: '4A', to: '40', country: 'United States' },
  { from: '5A', to: '50', country: 'United States' },
  { from: '6A', to: '6W', country: 'Australia' },
  { from: '7A', to: '7E', country: 'New Zealand' },
  { from: '8A', to: '8E', country: 'Argentina' },
  { from: '8F', to: '8K', country: 'Chile' },
  { from: '9A', to: '9E', country: 'Brazil' },
  { from: '93', to: '99', country: 'Brazil' },
];

/**
 * Collation order for the second VIN character.
 *
 * The standard's country ranges run A through Z and then 0 through 9 — so
 * "WA to W0" covers WA…WZ followed by W0…W9. Ordinary ASCII ordering puts the
 * digits first, which inverts those ranges and makes them match nothing.
 * I, O and Q are excluded from VINs to avoid confusion with 1 and 0.
 */
const ORDER = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

function rank(pair: string): number {
  const a = ORDER.indexOf(pair[0] ?? '');
  const b = ORDER.indexOf(pair[1] ?? '');
  return a * 100 + b;
}

function countryFor(prefix: string): string | null {
  const value = rank(prefix);
  for (const range of COUNTRY_RANGES) {
    if (value >= rank(range.from) && value <= rank(range.to)) return range.country;
  }
  return null;
}

/**
 * Manufacturers by WMI. This is the part that genuinely needs a table, so it
 * covers the makes most likely to be met rather than pretending to be complete
 * — an unknown WMI returns null and the UI says so.
 */
const MANUFACTURERS: Record<string, string> = {
  // India
  MAT: 'Tata Motors', MAK: 'Honda Cars India', MA1: 'Mahindra',
  MA3: 'Maruti Suzuki', MA6: 'General Motors India', MA7: 'Hindustan Motors',
  MAL: 'Hyundai India', MAJ: 'Ford India', MAC: 'Mahindra',
  MBH: 'Maruti Suzuki', MBJ: 'Toyota Kirloskar', MB1: 'Ashok Leyland',
  MCA: 'Fiat India', MD2: 'Bajaj Auto', MD6: 'TVS Motor',
  MDH: 'Nissan India', ME1: 'Royal Enfield', ME4: 'Honda Motorcycle India',
  MEC: 'Daimler India', MEE: 'Renault India', MZB: 'Kia India',
  // Japan
  JHM: 'Honda', JH4: 'Acura', JF1: 'Subaru', JM1: 'Mazda',
  JN1: 'Nissan', JN8: 'Nissan', JT2: 'Toyota', JTD: 'Toyota',
  JTE: 'Toyota', JTH: 'Lexus', JS1: 'Suzuki', JS3: 'Suzuki',
  JYA: 'Yamaha', JKA: 'Kawasaki', JA3: 'Mitsubishi', JA4: 'Mitsubishi',
  // Korea
  KMH: 'Hyundai', KM8: 'Hyundai', KNA: 'Kia', KND: 'Kia', KNM: 'Renault Samsung',
  // Germany
  WVW: 'Volkswagen', WV1: 'Volkswagen Commercial', WV2: 'Volkswagen',
  WAU: 'Audi', WA1: 'Audi', WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz',
  WME: 'Smart', WP0: 'Porsche', WP1: 'Porsche', W0L: 'Opel', WF0: 'Ford Germany',
  // Rest of Europe
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën', VF6: 'Renault Trucks',
  ZAR: 'Alfa Romeo', ZFA: 'Fiat', ZFF: 'Ferrari', ZHW: 'Lamborghini',
  ZAM: 'Maserati', SAL: 'Land Rover', SAJ: 'Jaguar', SCC: 'Lotus',
  SCA: 'Rolls-Royce', SCB: 'Bentley', SHS: 'Honda UK', SJN: 'Nissan UK',
  TMB: 'Škoda', TRU: 'Audi Hungary', VSS: 'SEAT', YS3: 'Saab', YV1: 'Volvo',
  // North America
  '1FA': 'Ford', '1FT': 'Ford Trucks', '1G1': 'Chevrolet', '1GC': 'Chevrolet Trucks',
  '1GM': 'Pontiac', '1HG': 'Honda USA', '1N4': 'Nissan USA', '1VW': 'Volkswagen USA',
  '2HG': 'Honda Canada', '2T1': 'Toyota Canada', '3VW': 'Volkswagen Mexico',
  '4T1': 'Toyota USA', '5YJ': 'Tesla', '5NP': 'Hyundai USA',
  // China
  LFV: 'FAW-Volkswagen', LSV: 'SAIC Volkswagen', LGW: 'Great Wall',
  LVS: 'Ford China', LB3: 'Geely', LSJ: 'MG / SAIC', LRW: 'Tesla China',
};

/**
 * Model year from character 10. The code cycles every 30 years, so a VIN alone
 * cannot distinguish 1995 from 2025 — both possibilities are returned and the
 * UI shows the likelier one with the other noted.
 */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

function modelYearFor(code: string): { primary: number | null; alternative: number | null } {
  const index = YEAR_CODES.indexOf(code);
  if (index === -1) return { primary: null, alternative: null };

  // The cycle began in 1980; 30 codes later it restarted in 2010.
  const older = 1980 + index;
  const newer = 2010 + index;
  const currentYear = new Date().getFullYear();

  // Vehicles are not sold before their model year, so anything ahead of next
  // year must belong to the older cycle.
  if (newer <= currentYear + 1) {
    return { primary: newer, alternative: older };
  }
  return { primary: older, alternative: null };
}

export function decodeVin(vin: string): DecodedVin | null {
  const value = vin.trim().toUpperCase();
  if (value.length !== 17) return null;

  const wmi = value.slice(0, 3);
  const yearCode = value[9] ?? '';
  const { primary, alternative } = modelYearFor(yearCode);

  return {
    vin: value,
    wmi,
    manufacturer: MANUFACTURERS[wmi] ?? null,
    country: countryFor(value.slice(0, 2)),
    region: regionFor(value[0] ?? ''),
    modelYear: primary,
    modelYearAlternative: alternative,
    plantCode: value[10] ?? '',
    vehicleDescriptor: value.slice(3, 8),
    serial: value.slice(9),
    checkDigitValid: looksLikeVin(value) ? vinCheckDigitValid(value) : null,
  };
}

/** A one-line description, e.g. "2019 Honda · India". Null when nothing is known. */
export function describeVin(decoded: DecodedVin): string | null {
  const parts = [
    decoded.modelYear ? String(decoded.modelYear) : null,
    decoded.manufacturer,
    decoded.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
