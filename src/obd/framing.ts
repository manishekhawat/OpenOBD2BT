/**
 * Response framing.
 *
 * With headers on (ATH1) the adapter hands us one line per CAN frame, tagged
 * with the responding ECU's address. This module turns those lines back into
 * one payload per ECU, reassembling ISO-TP multi-frame responses and stripping
 * the protocol-specific wrapping (PCI bytes on CAN, checksum byte elsewhere).
 */

export type ProtocolFamily = 'can11' | 'can29' | 'iso9141' | 'kwp' | 'j1850' | 'unknown';

export interface EcuResponse {
  /** Responding ECU address as printed by the adapter, e.g. "7E8". */
  header: string;
  /** Payload bytes with all transport wrapping removed. */
  data: number[];
}

/** Map an ATDPN protocol number to the framing rules it implies. */
export function protocolFamilyFromNumber(atdpn: string): ProtocolFamily {
  // ATDPN answers e.g. "A6" (automatic, protocol 6) or "6".
  const n = atdpn.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(-1);
  switch (n) {
    case '1':
    case '2':
      return 'j1850';
    case '3':
      return 'iso9141';
    case '4':
    case '5':
      return 'kwp';
    case '6':
    case '8':
    case 'B':
      return 'can11';
    case '7':
    case '9':
    case 'A':
    case 'C':
      return 'can29';
    default:
      return 'unknown';
  }
}

function headerLength(line: string, family: ProtocolFamily): number {
  switch (family) {
    case 'can11':
      return 3;
    case 'can29':
      return 8;
    case 'iso9141':
    case 'kwp':
    case 'j1850':
      return 6;
    default:
      // Unknown protocol: infer from the line. An odd length means a 3-nibble
      // 11-bit CAN header; a 29-bit CAN header is recognisable by its prefix.
      if (/^18(DA|DB)/.test(line)) return 8;
      if (line.length % 2 === 1) return 3;
      return 6;
  }
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return bytes;
    bytes.push(byte);
  }
  return bytes;
}

/**
 * Reassemble adapter lines into one payload per responding ECU.
 *
 * `lines` are hex-only, whitespace-stripped, uppercase — as produced by
 * `parseReply`. Lines are grouped by header so a multi-ECU answer (common on
 * cars, where several modules answer 0100) yields one entry each.
 */
export function assembleResponses(lines: string[], family: ProtocolFamily): EcuResponse[] {
  const groups = new Map<string, string[]>();
  const order: string[] = [];

  for (const line of lines) {
    const hlen = headerLength(line, family);
    if (line.length <= hlen) continue;
    const header = line.slice(0, hlen);
    const body = line.slice(hlen);
    if (!groups.has(header)) {
      groups.set(header, []);
      order.push(header);
    }
    groups.get(header)?.push(body);
  }

  const out: EcuResponse[] = [];
  for (const header of order) {
    const bodies = groups.get(header) ?? [];
    const data = isCan(family)
      ? unwrapIsoTp(bodies)
      : unwrapNonCan(bodies, family);
    if (data.length > 0) out.push({ header, data });
  }
  return out;
}

function isCan(family: ProtocolFamily): boolean {
  return family === 'can11' || family === 'can29' || family === 'unknown';
}

/**
 * Strip ISO 15765-2 (ISO-TP) framing.
 *
 * Single frame:      0L <L data bytes>
 * First frame:       1LLL <6 data bytes>      (LLL = 12-bit total length)
 * Consecutive frame: 2N <up to 7 data bytes>  (N = sequence number)
 *
 * Adapters that are already set to strip PCI, or non-conforming clones, send
 * the payload bare; that case falls through to a plain concatenation.
 */
function unwrapIsoTp(bodies: string[]): number[] {
  if (bodies.length === 0) return [];

  const first = bodies[0] ?? '';
  const typeNibble = first.slice(0, 1);

  if (bodies.length === 1 && typeNibble === '0') {
    const length = Number.parseInt(first.slice(1, 2), 16);
    const bytes = hexToBytes(first.slice(2));
    return Number.isNaN(length) ? bytes : bytes.slice(0, length);
  }

  if (typeNibble === '1') {
    const total = Number.parseInt(first.slice(1, 4), 16);
    const assembled: number[] = hexToBytes(first.slice(4));
    // Consecutive frames in sequence order; the adapter preserves arrival order.
    for (const body of bodies.slice(1)) {
      if (body.slice(0, 1) === '2') {
        assembled.push(...hexToBytes(body.slice(2)));
      } else {
        assembled.push(...hexToBytes(body));
      }
    }
    return Number.isNaN(total) ? assembled : assembled.slice(0, total);
  }

  // No recognisable PCI: concatenate, trimming single-frame length bytes where
  // each line independently looks like a single frame.
  const assembled: number[] = [];
  for (const body of bodies) {
    if (body.slice(0, 1) === '0') {
      const length = Number.parseInt(body.slice(1, 2), 16);
      const bytes = hexToBytes(body.slice(2));
      assembled.push(...(Number.isNaN(length) ? bytes : bytes.slice(0, length)));
    } else {
      assembled.push(...hexToBytes(body));
    }
  }
  return assembled;
}

/**
 * ISO 9141-2 / KWP2000 / J1850 carry no PCI. Each line is payload followed by a
 * one-byte checksum, which the adapter has already validated.
 */
function unwrapNonCan(bodies: string[], family: ProtocolFamily): number[] {
  const assembled: number[] = [];
  for (const body of bodies) {
    const bytes = hexToBytes(body);
    // J1850 and ISO 9141 append a checksum byte; drop it when present.
    if (family !== 'unknown' && bytes.length > 1) {
      assembled.push(...bytes.slice(0, -1));
    } else {
      assembled.push(...bytes);
    }
  }
  return assembled;
}

/**
 * Pick out the payload for a service request, verifying the positive-response
 * byte (service + 0x40) and, for data services, the echoed PID.
 *
 * Returns the bytes after the PID echo, or null when this ECU did not answer
 * the request we asked about.
 */
export function payloadFor(
  response: EcuResponse,
  service: number,
  pid?: number,
): number[] | null {
  const { data } = response;
  if (data.length === 0) return null;
  if (data[0] !== service + 0x40) return null;
  if (pid === undefined) return data.slice(1);
  if (data.length < 2 || data[1] !== pid) return null;
  return data.slice(2);
}
