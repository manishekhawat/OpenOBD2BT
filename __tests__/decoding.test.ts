/**
 * Decoding tests.
 *
 * These cover the parts where a mistake would be silent and wrong rather than
 * obviously broken: scaling formulas, DTC bit packing, ISO-TP reassembly and
 * monitor bit layout. The values are worked from the standard by hand.
 */

import { parseReply } from '@/obd/elm327';
import {
  assembleResponses,
  payloadFor,
  protocolFamilyFromNumber,
} from '@/obd/framing';
import { decodeDtcBytes, decodeDtcPayload, isGenericCode } from '@/obd/dtc';
import { decodeReadiness } from '@/obd/monitors';
import { decodeSupportBitmap, reportsNextBlock } from '@/obd/pidSupport';
import { pidDefinition } from '@/obd/pids';
import { decodeAsciiInfo, looksLikeVin, vinCheckDigitValid } from '@/obd/vehicleInfo';
import { lookupDtc } from '@/data/dtcCatalog';

describe('PID scaling', () => {
  const decode = (pid: number, bytes: number[]) => pidDefinition(pid)?.decode(bytes) ?? null;

  it('scales engine speed as (256A+B)/4', () => {
    // 0x1770 = 6000 → 1500 rpm
    expect(decode(0x0c, [0x17, 0x70])).toBeCloseTo(1500, 5);
  });

  it('scales coolant temperature as A-40', () => {
    expect(decode(0x05, [0x7b])).toBe(83);
    expect(decode(0x05, [0x00])).toBe(-40);
  });

  it('scales percentages as A*100/255', () => {
    expect(decode(0x04, [0xff])).toBeCloseTo(100, 5);
    expect(decode(0x11, [0x80])).toBeCloseTo(50.196, 2);
  });

  it('scales fuel trim as (A-128)*100/128, signed about zero', () => {
    expect(decode(0x06, [0x80])).toBeCloseTo(0, 5);
    expect(decode(0x06, [0x00])).toBeCloseTo(-100, 5);
  });

  it('scales mass air flow as (256A+B)/100', () => {
    expect(decode(0x10, [0x05, 0xdc])).toBeCloseTo(15, 5);
  });

  it('scales control module voltage as (256A+B)/1000', () => {
    expect(decode(0x42, [0x37, 0x24])).toBeCloseTo(14.116, 3);
  });

  it('scales catalyst temperature as (256A+B)/10 - 40', () => {
    expect(decode(0x3c, [0x13, 0x88])).toBeCloseTo(460, 5);
  });

  it('returns null rather than a wrong number when the payload is short', () => {
    expect(decode(0x0c, [0x17])).toBeNull();
    expect(decode(0x10, [])).toBeNull();
  });
});

describe('DTC decoding', () => {
  it('decodes the system letter from the top two bits', () => {
    expect(decodeDtcBytes(0x01, 0x33, 'stored')?.code).toBe('P0133');
    expect(decodeDtcBytes(0x43, 0x21, 'stored')?.code).toBe('C0321');
    expect(decodeDtcBytes(0x81, 0x00, 'stored')?.code).toBe('B0100');
    expect(decodeDtcBytes(0xc1, 0x55, 'stored')?.code).toBe('U0155');
  });

  it('decodes hex nibbles in the last three digits', () => {
    expect(decodeDtcBytes(0x0a, 0xbc, 'stored')?.code).toBe('P0ABC');
  });

  it('treats the zero word as padding, not a code', () => {
    expect(decodeDtcBytes(0x00, 0x00, 'stored')).toBeNull();
  });

  it('separates generic from manufacturer-defined codes', () => {
    expect(isGenericCode('P0301')).toBe(true);
    expect(isGenericCode('P2101')).toBe(true);
    expect(isGenericCode('P1101')).toBe(false);
    expect(isGenericCode('P3101')).toBe(false);
  });

  it('strips the CAN count byte and drops padding', () => {
    // 43 03 <3 codes> on CAN
    const payload = [0x03, 0x03, 0x01, 0x04, 0x20, 0x01, 0x71];
    const codes = decodeDtcPayload(payload, 'stored', 'can11');
    expect(codes.map((c) => c.code)).toEqual(['P0301', 'P0420', 'P0171']);
  });

  it('reads codes with no count byte on ISO 9141', () => {
    const payload = [0x01, 0x33, 0x00, 0x00, 0x00, 0x00];
    const codes = decodeDtcPayload(payload, 'stored', 'iso9141');
    expect(codes.map((c) => c.code)).toEqual(['P0133']);
  });

  it('does not report the same code twice', () => {
    const payload = [0x02, 0x03, 0x01, 0x03, 0x01];
    expect(decodeDtcPayload(payload, 'stored', 'can11')).toHaveLength(1);
  });
});

describe('response framing', () => {
  it('maps ATDPN numbers onto protocol families', () => {
    expect(protocolFamilyFromNumber('A6')).toBe('can11');
    expect(protocolFamilyFromNumber('7')).toBe('can29');
    expect(protocolFamilyFromNumber('3')).toBe('iso9141');
    expect(protocolFamilyFromNumber('5')).toBe('kwp');
    expect(protocolFamilyFromNumber('1')).toBe('j1850');
  });

  it('unwraps a single ISO-TP frame', () => {
    const responses = assembleResponses(['7E804410C1770'], 'can11');
    expect(responses).toHaveLength(1);
    expect(responses[0]?.header).toBe('7E8');
    expect(payloadFor(responses[0]!, 1, 0x0c)).toEqual([0x17, 0x70]);
  });

  it('reassembles a multi-frame ISO-TP response in order', () => {
    // Total length 8: 43 03 0301 0420 0171
    const lines = ['7E81008430303010420', '7E8210171'];
    const responses = assembleResponses(lines, 'can11');
    expect(responses).toHaveLength(1);
    expect(payloadFor(responses[0]!, 3)).toEqual([0x03, 0x03, 0x01, 0x04, 0x20, 0x01, 0x71]);
  });

  it('keeps answers from different ECUs apart', () => {
    const responses = assembleResponses(['7E8064100BE3EA813', '7E9064100801FB011'], 'can11');
    expect(responses.map((r) => r.header)).toEqual(['7E8', '7E9']);
  });

  it('rejects a payload whose service or PID does not match the request', () => {
    const responses = assembleResponses(['7E804410C1770'], 'can11');
    expect(payloadFor(responses[0]!, 1, 0x0d)).toBeNull();
    expect(payloadFor(responses[0]!, 3)).toBeNull();
  });

  it('handles a 29-bit CAN header', () => {
    const responses = assembleResponses(['18DAF110044105FF00'], 'can29');
    expect(responses[0]?.header).toBe('18DAF110');
  });
});

describe('adapter replies', () => {
  it('classifies bus conditions rather than treating them as data', () => {
    expect(parseReply('NO DATA').kind).toBe('no-data');
    expect(parseReply('UNABLE TO CONNECT').kind).toBe('unable-to-connect');
    expect(parseReply('BUS BUSY').kind).toBe('bus-busy');
    expect(parseReply('?').kind).toBe('unsupported');
  });

  it('waits again when the adapter is still searching', () => {
    expect(parseReply('SEARCHING...').kind).toBe('searching');
  });

  it('strips the echoed command and keeps only hex lines', () => {
    const reply = parseReply('010C\r7E8 03 41 0C 1A F8\r', '010C');
    expect(reply.kind).toBe('ok');
    expect(reply.lines).toEqual(['7E803410C1AF8']);
  });

  it('accepts a bare OK as success', () => {
    expect(parseReply('OK').kind).toBe('ok');
  });
});

describe('PID support bitmaps', () => {
  it('maps the high bit of the first byte to the lowest PID in the block', () => {
    // 0x80 00 00 00 → only PID 0x01 supported
    expect(decodeSupportBitmap(0x00, [0x80, 0x00, 0x00, 0x00])).toEqual([0x01]);
  });

  it('maps the low bit of the last byte to the block marker', () => {
    expect(decodeSupportBitmap(0x00, [0x00, 0x00, 0x00, 0x01])).toEqual([0x20]);
  });

  it('detects that a further block follows', () => {
    const supported = decodeSupportBitmap(0x00, [0x00, 0x00, 0x00, 0x01]);
    expect(reportsNextBlock(0x00, supported)).toBe(true);
    expect(reportsNextBlock(0x00, [0x01])).toBe(false);
  });

  it('decodes a realistic bitmap', () => {
    // BE 3E A8 13 is a common answer on a petrol car.
    const supported = decodeSupportBitmap(0x00, [0xbe, 0x3e, 0xa8, 0x13]);
    expect(supported).toContain(0x0c); // engine speed
    expect(supported).toContain(0x0d); // vehicle speed
    expect(supported).not.toContain(0x02);
  });
});

describe('readiness monitors', () => {
  it('reads the lamp and the stored fault count from byte A', () => {
    const report = decodeReadiness([0x83, 0x07, 0xe5, 0x21]);
    expect(report?.milOn).toBe(true);
    expect(report?.dtcCount).toBe(3);
  });

  it('reports the lamp off and no faults', () => {
    const report = decodeReadiness([0x00, 0x07, 0xff, 0x00]);
    expect(report?.milOn).toBe(false);
    expect(report?.dtcCount).toBe(0);
    expect(report?.readyForTest).toBe(true);
  });

  it('distinguishes compression ignition from spark ignition', () => {
    expect(decodeReadiness([0x00, 0x00, 0x00, 0x00])?.ignition).toBe('spark');
    expect(decodeReadiness([0x00, 0x08, 0x00, 0x00])?.ignition).toBe('compression');
  });

  it('treats a set "incomplete" bit as a check still running', () => {
    // Misfire supported (bit 0) and incomplete (bit 4).
    const report = decodeReadiness([0x00, 0x11, 0x00, 0x00]);
    const misfire = report?.monitors.find((m) => m.name === 'Misfire');
    expect(misfire?.supported).toBe(true);
    expect(misfire?.complete).toBe(false);
    expect(report?.readyForTest).toBe(false);
  });

  it('returns null rather than guessing on a short payload', () => {
    expect(decodeReadiness([0x00, 0x07])).toBeNull();
  });
});

describe('vehicle information', () => {
  it('decodes a VIN from its ASCII payload', () => {
    const vin = 'WAUZZZ8V9FA123456';
    const payload = [0x01, ...[...vin].map((c) => c.charCodeAt(0))];
    expect(decodeAsciiInfo(payload, 17)[0]).toBe(vin);
  });

  it('recognises a well-formed VIN and rejects ambiguous letters', () => {
    expect(looksLikeVin('WAUZZZ8V9FA123456')).toBe(true);
    expect(looksLikeVin('WAUZZZ8V9FA12345')).toBe(false); // 16 characters
    expect(looksLikeVin('WAUZZZ8V9FAI23456')).toBe(false); // contains I
  });

  it('validates the check digit where one is used', () => {
    expect(vinCheckDigitValid('1M8GDM9AXKP042788')).toBe(true);
    expect(vinCheckDigitValid('1M8GDM9A1KP042788')).toBe(false);
  });
});

describe('fault code lookup', () => {
  it('returns the written description for a catalogued code', () => {
    const info = lookupDtc('P0420');
    expect(info.source).toBe('catalog');
    expect(info.causes.length).toBeGreaterThan(0);
  });

  it('generates per-cylinder misfire descriptions', () => {
    const info = lookupDtc('P0304');
    expect(info.source).toBe('generated');
    expect(info.title).toContain('Cylinder 4');
  });

  it('generates oxygen sensor descriptions by bank and position', () => {
    const info = lookupDtc('P0155');
    expect(info.title).toContain('bank 2 sensor 1');
  });

  it('never invents a meaning for a manufacturer-specific code', () => {
    const info = lookupDtc('P1234');
    expect(info.source).toBe('manufacturer');
    expect(info.generic).toBe(false);
    expect(info.causes).toHaveLength(0);
  });

  it('still resolves an unknown generic code without inventing causes', () => {
    const info = lookupDtc('P0999');
    expect(info.generic).toBe(true);
    expect(info.causes).toHaveLength(0);
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(lookupDtc(' p0420 ').code).toBe('P0420');
  });
});
