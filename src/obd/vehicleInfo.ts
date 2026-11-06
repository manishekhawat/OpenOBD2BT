/**
 * Mode 09 vehicle information.
 *
 * Cars reliably expose the VIN, calibration identifiers and ECU names here.
 * Motorcycles often do not, so every field is treated as optional.
 */

export interface VehicleInfo {
  vin: string | null;
  calibrationIds: string[];
  /** Calibration verification numbers, as hex. */
  cvns: string[];
  ecuName: string | null;
}

/** Mode 09 PIDs, with the payload each returns. */
export const INFO_PIDS = {
  supported: 0x00,
  vin: 0x02,
  calibrationId: 0x04,
  cvn: 0x06,
  ecuName: 0x0a,
} as const;

/**
 * Decode an ASCII Mode 09 payload.
 *
 * The payload begins with a count of data items, then fixed-width ASCII. Some
 * ECUs left-pad with 0x00 and some with 0x20; both are trimmed.
 */
export function decodeAsciiInfo(payload: number[], itemLength: number): string[] {
  if (payload.length === 0) return [];

  // Mode 09 responses open with the number of data items. Strip it when the
  // leading byte is a plausible count, which it is whenever the rest of the
  // payload is not itself a clean multiple of the item length.
  let body = payload;
  const count = payload[0];
  if (count !== undefined && count > 0 && count <= 8 && payload.length % itemLength !== 0) {
    body = payload.slice(1);
  }

  const items: string[] = [];
  for (let offset = 0; offset < body.length; offset += itemLength) {
    const chunk = body.slice(offset, offset + itemLength);
    const text = chunk
      // Keep printable ASCII only. ECUs pad with 0x00 or 0x20, and a stray
      // control byte must never end up inside a VIN or a module name.
      .filter((byte) => byte >= 0x20 && byte < 0x7f)
      .map((byte) => String.fromCharCode(byte))
      .join('')
      .trim();
    if (text.length > 0) items.push(text);
  }
  return items;
}

/** A VIN is 17 characters and excludes I, O and Q to avoid ambiguity. */
export function looksLikeVin(text: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(text);
}

/**
 * Validate a VIN's check digit (position 9). Mandatory on North American and
 * many Asian vehicles, not used by all European makers, so a failure is worth
 * surfacing as "unverified" rather than treating the VIN as wrong.
 */
export function vinCheckDigitValid(vin: string): boolean {
  if (!looksLikeVin(vin)) return false;
  const translit: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const ch = vin[i];
    const weight = weights[i];
    if (ch === undefined || weight === undefined) return false;
    const value = /[0-9]/.test(ch) ? Number(ch) : translit[ch];
    if (value === undefined) return false;
    sum += value * weight;
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}
