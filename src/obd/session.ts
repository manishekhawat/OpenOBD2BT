/**
 * ObdSession — the single place that owns a live connection.
 *
 * It wires a transport to the ELM327 layer, discovers what the vehicle
 * supports, and exposes the operations the UI needs: read a value, poll a set
 * of values, scan and clear fault codes, read a freeze frame, readiness and
 * vehicle information. Screens never talk to a transport directly.
 */

import { Elm327, delay, type ElmReply } from './elm327';
import {
  assembleResponses,
  payloadFor,
  protocolFamilyFromNumber,
  type ProtocolFamily,
} from './framing';
import { decodeDtcPayload, type DecodedDtc, type DtcOrigin } from './dtc';
import { decodeReadiness, type ReadinessReport } from './monitors';
import {
  decodeSupportBitmap,
  reportsNextBlock,
  SUPPORT_BLOCK_PIDS,
} from './pidSupport';
import {
  decodeFuelType,
  decodeObdStandard,
  hex2,
  pidDefinition,
  type PidDefinition,
  type PidRate,
} from './pids';
import {
  decodeAsciiInfo,
  INFO_PIDS,
  looksLikeVin,
  vinCheckDigitValid,
  type VehicleInfo,
} from './vehicleInfo';
import type { Transport } from './transport';

export interface Reading {
  pid: number;
  value: number;
  unit: string;
  at: number;
}

export interface TraceEntry {
  direction: 'tx' | 'rx' | 'info';
  text: string;
  at: number;
}

export interface SessionStatus {
  state: 'idle' | 'connecting' | 'initialising' | 'ready' | 'error' | 'closed';
  adapterLabel: string | null;
  adapterIdentity: string | null;
  protocol: string | null;
  family: ProtocolFamily;
  voltage: number | null;
  /** True when the adapter is up but the vehicle is not answering. */
  vehicleSilent: boolean;
  message: string | null;
}

export interface ScanResult {
  stored: DecodedDtc[];
  pending: DecodedDtc[];
  permanent: DecodedDtc[];
  readiness: ReadinessReport | null;
  /** Which services actually answered, so the UI can say what was checked. */
  servicesAnswered: DtcOrigin[];
  at: number;
}

/** How many poll ticks to skip between reads, by rate class. */
const RATE_DIVISOR: Record<PidRate, number> = { fast: 1, medium: 3, slow: 10 };

const MAX_TRACE = 500;

export class ObdSession {
  private transport: Transport | null = null;
  private elm: Elm327 | null = null;

  private status: SessionStatus = {
    state: 'idle',
    adapterLabel: null,
    adapterIdentity: null,
    protocol: null,
    family: 'unknown',
    voltage: null,
    vehicleSilent: false,
    message: null,
  };

  /** Mode 01 PIDs the vehicle reported as supported. */
  supportedPids: number[] = [];
  /** Mode 09 info PIDs the vehicle reported as supported. */
  supportedInfoPids: number[] = [];
  vehicleInfo: VehicleInfo | null = null;
  obdStandard: string | null = null;
  fuelType: string | null = null;

  private trace: TraceEntry[] = [];
  private statusListeners = new Set<(s: SessionStatus) => void>();
  private traceListeners = new Set<(t: TraceEntry[]) => void>();

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTick = 0;
  private safeMode = false;

  // --- observation -------------------------------------------------------

  getStatus(): SessionStatus {
    return this.status;
  }

  onStatus(listener: (s: SessionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getTrace(): TraceEntry[] {
    return this.trace;
  }

  onTrace(listener: (t: TraceEntry[]) => void): () => void {
    this.traceListeners.add(listener);
    return () => this.traceListeners.delete(listener);
  }

  private setStatus(patch: Partial<SessionStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.statusListeners) l(this.status);
  }

  private addTrace(direction: TraceEntry['direction'], text: string): void {
    this.trace = [...this.trace.slice(-(MAX_TRACE - 1)), { direction, text, at: Date.now() }];
    for (const l of this.traceListeners) l(this.trace);
  }

  clearTrace(): void {
    this.trace = [];
    for (const l of this.traceListeners) l(this.trace);
  }

  // --- lifecycle ---------------------------------------------------------

  isReady(): boolean {
    return this.status.state === 'ready';
  }

  /**
   * Open a transport, initialise the adapter, and discover the vehicle.
   *
   * Throws with a readable message if the adapter cannot be reached; a vehicle
   * that does not answer is *not* an error, because the adapter is still useful
   * (voltage, self-test) and the user may simply not have switched the ignition
   * on yet.
   */
  async connect(transport: Transport, opts: { safeMode?: boolean } = {}): Promise<void> {
    await this.disconnect();

    this.safeMode = opts.safeMode ?? false;
    this.transport = transport;
    this.setStatus({
      state: 'connecting',
      adapterLabel: transport.label,
      message: null,
      vehicleSilent: false,
    });

    const elm = new Elm327(transport, {
      onTrace: (direction, text) => this.addTrace(direction, text),
    });
    this.elm = elm;

    await transport.open({
      onData: (chunk) => elm.ingest(chunk),
      onClose: (reason) => {
        elm.fail(reason);
        this.stopPolling();
        this.setStatus({ state: 'closed', message: reason });
        this.addTrace('info', `Link closed: ${reason}`);
      },
    });

    this.setStatus({ state: 'initialising' });
    this.addTrace('info', `Connected to ${transport.label}`);

    await elm.initialise({ safeMode: this.safeMode });
    this.setStatus({ adapterIdentity: elm.identity });

    this.status.voltage = await elm.readVoltage();

    // Determine the protocol before anything is parsed, because framing
    // depends on it. ATDPN is the machine-readable form.
    const dpn = await elm.send('ATDPN', 2000);
    const family = protocolFamilyFromNumber(dpn.raw);
    const protocol = await elm.readProtocol();
    this.setStatus({ family, protocol, voltage: this.status.voltage });

    // A first real request tells us whether the vehicle is awake.
    const probe = await elm.send('0100', 6000);
    if (probe.kind !== 'ok') {
      this.setStatus({
        state: 'ready',
        vehicleSilent: true,
        message: describeSilence(probe),
      });
      return;
    }

    // Now that a protocol has been negotiated, re-read it: ATSP0 only resolves
    // the real protocol after the first successful exchange.
    const resolvedDpn = await elm.send('ATDPN', 2000);
    const resolvedFamily = protocolFamilyFromNumber(resolvedDpn.raw);
    const resolvedProtocol = await elm.readProtocol();
    this.setStatus({
      family: resolvedFamily === 'unknown' ? family : resolvedFamily,
      protocol: resolvedProtocol ?? protocol,
    });

    await this.discoverSupport(probe);
    await this.readStaticInfo();

    this.setStatus({ state: 'ready', vehicleSilent: false, message: null });
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.elm?.fail('Disconnected');
    this.elm = null;
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.supportedPids = [];
    this.supportedInfoPids = [];
    this.vehicleInfo = null;
    this.setStatus({
      state: 'idle',
      adapterLabel: null,
      adapterIdentity: null,
      protocol: null,
      family: 'unknown',
      voltage: null,
      vehicleSilent: false,
      message: null,
    });
  }

  // --- discovery ---------------------------------------------------------

  /** Walk the Mode 01 support bitmaps to learn what this vehicle answers. */
  private async discoverSupport(firstBlock?: ElmReply): Promise<void> {
    const supported: number[] = [];

    for (const basePid of SUPPORT_BLOCK_PIDS) {
      const reply =
        basePid === 0x00 && firstBlock
          ? firstBlock
          : await this.request(1, basePid, 4000);
      if (!reply || reply.kind !== 'ok') break;

      const responses = assembleResponses(reply.lines, this.status.family);
      // Several modules can answer; the union is what the vehicle supports.
      let blockPids: number[] = [];
      for (const response of responses) {
        const payload = payloadFor(response, 1, basePid);
        if (!payload) continue;
        blockPids = [...new Set([...blockPids, ...decodeSupportBitmap(basePid, payload)])];
      }
      if (blockPids.length === 0) break;

      supported.push(...blockPids);
      if (!reportsNextBlock(basePid, blockPids)) break;
    }

    // The block markers themselves are not readable values.
    this.supportedPids = [...new Set(supported)]
      .filter((pid) => !SUPPORT_BLOCK_PIDS.includes(pid as never))
      .sort((a, b) => a - b);

    this.addTrace('info', `${this.supportedPids.length} live parameters supported`);
  }

  /** Read the values that do not change during a session. */
  private async readStaticInfo(): Promise<void> {
    if (this.supportedPids.includes(0x1c)) {
      const data = await this.readRaw(1, 0x1c);
      if (data) this.obdStandard = decodeObdStandard(data);
    }
    if (this.supportedPids.includes(0x51)) {
      const data = await this.readRaw(1, 0x51);
      if (data) this.fuelType = decodeFuelType(data);
    }

    const infoSupport = await this.readRaw(9, INFO_PIDS.supported);
    if (infoSupport) {
      this.supportedInfoPids = decodeSupportBitmap(0x00, infoSupport);
    }
    this.vehicleInfo = await this.readVehicleInfo();
  }

  // --- primitives --------------------------------------------------------

  /** Send a service+PID request, returning the raw adapter reply. */
  private async request(
    service: number,
    pid?: number,
    timeoutMs?: number,
  ): Promise<ElmReply | null> {
    if (!this.elm) return null;
    const command = pid === undefined ? hex2(service) : `${hex2(service)}${hex2(pid)}`;
    try {
      return await this.elm.send(command, timeoutMs);
    } catch {
      return null;
    }
  }

  /**
   * Read one parameter's payload bytes, merging multi-ECU answers by taking the
   * first module that answers for that PID (conventionally the engine ECU).
   */
  async readRaw(service: number, pid: number, timeoutMs?: number): Promise<number[] | null> {
    const reply = await this.request(service, pid, timeoutMs);
    if (!reply || reply.kind !== 'ok') return null;
    const responses = assembleResponses(reply.lines, this.status.family);
    for (const response of responses) {
      const payload = payloadFor(response, service, pid);
      if (payload && payload.length > 0) return payload;
    }
    return null;
  }

  /** Read and scale one live parameter. */
  async readValue(pid: number): Promise<Reading | null> {
    const definition = pidDefinition(pid);
    if (!definition) return null;
    const data = await this.readRaw(1, pid);
    if (!data) return null;
    const value = definition.decode(data);
    if (value === null || !Number.isFinite(value)) return null;
    return { pid, value, unit: definition.unit, at: Date.now() };
  }

  // --- polling -----------------------------------------------------------

  /**
   * Poll a set of parameters continuously.
   *
   * Reads are sequential because an ELM327 handles one request at a time.
   * Slower-changing values are read less often so the fast ones (RPM, speed,
   * throttle) stay responsive. Returns a function that stops the loop.
   */
  startPolling(
    pids: number[],
    onReading: (reading: Reading) => void,
    opts: { intervalMs?: number } = {},
  ): () => void {
    this.stopPolling();
    const interval = opts.intervalMs ?? (this.safeMode ? 250 : 80);

    const definitions = pids
      .map((pid) => pidDefinition(pid))
      .filter((d): d is PidDefinition => d !== undefined);

    let cancelled = false;

    const loop = async (): Promise<void> => {
      while (!cancelled && this.isReady()) {
        this.pollTick += 1;
        const due = definitions.filter(
          (d) => this.pollTick % RATE_DIVISOR[d.rate] === 0,
        );
        // Nothing due this tick: wait a beat rather than spinning.
        if (due.length === 0) {
          await delay(interval);
          continue;
        }
        for (const definition of due) {
          if (cancelled) return;
          const reading = await this.readValue(definition.pid);
          if (reading) onReading(reading);
        }
        await delay(interval);
      }
    };

    void loop();

    const stop = () => {
      cancelled = true;
    };
    this.pollTimer = null;
    this.stopCurrentPoll = stop;
    return stop;
  }

  private stopCurrentPoll: (() => void) | null = null;

  stopPolling(): void {
    this.stopCurrentPoll?.();
    this.stopCurrentPoll = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollTick = 0;
  }

  // --- fault codes -------------------------------------------------------

  /** Read stored, pending and permanent codes plus the readiness report. */
  async scanFaults(): Promise<ScanResult> {
    const servicesAnswered: DtcOrigin[] = [];

    const readList = async (service: number, origin: DtcOrigin): Promise<DecodedDtc[]> => {
      const reply = await this.request(service, undefined, 6000);
      if (!reply) return [];
      if (reply.kind !== 'ok') {
        // NO DATA on service 03 legitimately means "no faults stored".
        if (reply.kind === 'no-data') servicesAnswered.push(origin);
        return [];
      }
      servicesAnswered.push(origin);
      const responses = assembleResponses(reply.lines, this.status.family);
      const codes: DecodedDtc[] = [];
      for (const response of responses) {
        const payload = payloadFor(response, service);
        if (!payload) continue;
        codes.push(...decodeDtcPayload(payload, origin, this.status.family));
      }
      // De-duplicate across modules reporting the same code.
      const seen = new Set<string>();
      return codes.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
    };

    const stored = await readList(0x03, 'stored');
    const pending = await readList(0x07, 'pending');
    const permanent = await readList(0x0a, 'permanent');

    let readiness: ReadinessReport | null = null;
    const monitorData = await this.readRaw(1, 0x01);
    if (monitorData) readiness = decodeReadiness(monitorData);

    return { stored, pending, permanent, readiness, servicesAnswered, at: Date.now() };
  }

  /**
   * Clear stored codes (service 04) and re-read to confirm.
   *
   * Clearing also erases freeze frames and resets readiness monitors, which is
   * why the UI confirms first and why the before/after counts are returned.
   */
  async clearFaults(): Promise<{ cleared: boolean; remaining: DecodedDtc[] }> {
    const reply = await this.request(0x04, undefined, 6000);
    const accepted = reply?.kind === 'ok';

    // Give the ECU a moment; some need it before service 03 is accurate again.
    await delay(900);
    const after = await this.scanFaults();

    return { cleared: accepted, remaining: after.stored };
  }

  /** Mode 02 freeze frame for the given frame number (0 is the only one most ECUs keep). */
  async readFreezeFrame(frameNumber = 0): Promise<Reading[]> {
    const readings: Reading[] = [];
    for (const pid of this.supportedPids) {
      const definition = pidDefinition(pid);
      if (!definition) continue;
      const reply = await this.elm
        ?.send(`02${hex2(pid)}${hex2(frameNumber)}`, 3000)
        .catch(() => null);
      if (!reply || reply.kind !== 'ok') continue;
      const responses = assembleResponses(reply.lines, this.status.family);
      for (const response of responses) {
        const payload = payloadFor(response, 2, pid);
        if (!payload) continue;
        const value = definition.decode(payload);
        if (value !== null && Number.isFinite(value)) {
          readings.push({ pid, value, unit: definition.unit, at: Date.now() });
        }
        break;
      }
    }
    return readings;
  }

  async readReadiness(): Promise<ReadinessReport | null> {
    const data = await this.readRaw(1, 0x01);
    return data ? decodeReadiness(data) : null;
  }

  async readVehicleInfo(): Promise<VehicleInfo> {
    const info: VehicleInfo = { vin: null, calibrationIds: [], cvns: [], ecuName: null };

    const vinData = await this.readRaw(9, INFO_PIDS.vin, 4000);
    if (vinData) {
      const candidates = decodeAsciiInfo(vinData, 17);
      const vin = candidates.find((c) => looksLikeVin(c)) ?? candidates[0] ?? null;
      info.vin = vin ?? null;
      if (vin && looksLikeVin(vin) && !vinCheckDigitValid(vin)) {
        this.addTrace('info', 'VIN read, but its check digit does not validate');
      }
    }

    const calData = await this.readRaw(9, INFO_PIDS.calibrationId, 4000);
    if (calData) info.calibrationIds = decodeAsciiInfo(calData, 16);

    const nameData = await this.readRaw(9, INFO_PIDS.ecuName, 4000);
    if (nameData) info.ecuName = decodeAsciiInfo(nameData, 20)[0] ?? null;

    return info;
  }

  /** Re-read the adapter's measured battery voltage. */
  async refreshVoltage(): Promise<number | null> {
    if (!this.elm) return null;
    const v = await this.elm.readVoltage();
    this.setStatus({ voltage: v });
    return v;
  }
}

function describeSilence(reply: ElmReply): string {
  switch (reply.kind) {
    case 'unable-to-connect':
      return 'The adapter is connected but the vehicle is not answering. Switch the ignition on and try again.';
    case 'no-data':
      return 'The vehicle did not return any data. Switch the ignition on, or the vehicle may not support OBD-II.';
    case 'bus-busy':
      return 'The diagnostic bus is busy. Switch the ignition off, wait a few seconds and reconnect.';
    case 'timeout':
      return 'The adapter stopped answering. Unplug it, wait five seconds and reconnect.';
    default:
      return 'The adapter is connected but the vehicle is not answering yet.';
  }
}

/** One session is shared by every screen. */
export const session = new ObdSession();
