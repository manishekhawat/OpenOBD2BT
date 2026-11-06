/**
 * Diagnostic trouble code decoding.
 *
 * A DTC is two bytes on the wire. The top two bits select the system letter and
 * the next two the first digit; the remaining three nibbles are the code number.
 *
 *   byte A            byte B
 *   7 6 | 5 4 | 3..0  7..4 | 3..0
 *   sys | d1  | d2    d3   | d4
 */

import type { ProtocolFamily } from './framing';

export type DtcSystem = 'P' | 'C' | 'B' | 'U';

/** Which list a code came from, which changes what it means to the driver. */
export type DtcOrigin = 'stored' | 'pending' | 'permanent';

export interface DecodedDtc {
  /** Display form, e.g. "P0301". */
  code: string;
  system: DtcSystem;
  origin: DtcOrigin;
  /** The two raw bytes, kept for the session log and CSV export. */
  rawHex: string;
}

const SYSTEM_LETTERS: readonly DtcSystem[] = ['P', 'C', 'B', 'U'];

/** Decode one two-byte DTC. Returns null for the 0x0000 padding word. */
export function decodeDtcBytes(a: number, b: number, origin: DtcOrigin): DecodedDtc | null {
  if (a === 0 && b === 0) return null;

  const system = SYSTEM_LETTERS[(a >> 6) & 0x03] ?? 'P';
  const d1 = (a >> 4) & 0x03;
  const d2 = a & 0x0f;
  const d3 = (b >> 4) & 0x0f;
  const d4 = b & 0x0f;

  const code =
    system +
    d1.toString(10) +
    d2.toString(16).toUpperCase() +
    d3.toString(16).toUpperCase() +
    d4.toString(16).toUpperCase();

  return {
    code,
    system,
    origin,
    rawHex: a.toString(16).toUpperCase().padStart(2, '0') +
      b.toString(16).toUpperCase().padStart(2, '0'),
  };
}

/**
 * Decode the payload of a service 03 / 07 / 0A response.
 *
 * On CAN the payload opens with a count byte; the other protocols pack DTCs
 * directly, three to a message, padded with zero words. Both shapes are handled
 * so the caller does not need to care which protocol negotiated.
 */
export function decodeDtcPayload(
  payload: number[],
  origin: DtcOrigin,
  family: ProtocolFamily,
): DecodedDtc[] {
  let body = payload;

  if (family === 'can11' || family === 'can29' || family === 'unknown') {
    // Treat the first byte as a count only when it is consistent with the
    // payload length; some clones omit it even on CAN.
    const first = body[0];
    if (first !== undefined) {
      const pairsAfterCount = Math.floor((body.length - 1) / 2);
      if (first <= pairsAfterCount && (body.length - 1) % 2 === 0) {
        body = body.slice(1);
      }
    }
  }

  const codes: DecodedDtc[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 1 < body.length; i += 2) {
    const a = body[i];
    const b = body[i + 1];
    if (a === undefined || b === undefined) break;
    const dtc = decodeDtcBytes(a, b, origin);
    if (dtc && !seen.has(dtc.code)) {
      seen.add(dtc.code);
      codes.push(dtc);
    }
  }
  return codes;
}

/** Human-readable name of the system a code's letter refers to. */
export function systemName(system: DtcSystem): string {
  switch (system) {
    case 'P':
      return 'Powertrain';
    case 'C':
      return 'Chassis';
    case 'B':
      return 'Body';
    case 'U':
      return 'Network';
  }
}

/**
 * The subsystem a powertrain code belongs to, from its second digit. Useful
 * for grouping a long fault list into something readable.
 */
export function powertrainArea(code: string): string | null {
  if (!code.startsWith('P') || code.length < 3) return null;
  switch (code[2]) {
    case '0':
      return 'Fuel and air metering';
    case '1':
      return 'Fuel and air metering (injector circuit)';
    case '2':
      return 'Fuel and air metering (injector circuit)';
    case '3':
      return 'Ignition system or misfire';
    case '4':
      return 'Auxiliary emission controls';
    case '5':
      return 'Vehicle speed, idle control and inputs';
    case '6':
      return 'Computer and output circuits';
    case '7':
    case '8':
      return 'Transmission';
    case '9':
      return 'Transmission and gearbox control';
    case 'A':
    case 'B':
    case 'C':
      return 'Hybrid propulsion';
    default:
      return null;
  }
}

/**
 * Whether a code is defined by the standard (generic) or left to the
 * manufacturer. Generic codes have a 0 or 2 as the first digit; manufacturer
 * codes use 1 or 3 and need make-specific documentation to interpret.
 */
export function isGenericCode(code: string): boolean {
  const d1 = code[1];
  return d1 === '0' || d1 === '2';
}
