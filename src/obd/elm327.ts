/**
 * ELM327 command layer.
 *
 * Owns the request/response discipline of an ELM327-style adapter: one command
 * at a time, terminated by the '>' prompt. Everything above this layer works in
 * terms of OBD services ("01 0C") and gets back parsed hex payloads.
 */

import type { Transport } from './transport';

/** Adapter replies that are a protocol/bus condition rather than data. */
const BUS_ERRORS = [
  'UNABLE TO CONNECT',
  'NO DATA',
  'CAN ERROR',
  'BUS ERROR',
  'BUS BUSY',
  'BUS INIT: ERROR',
  'BUS INIT:ERROR',
  'DATA ERROR',
  'FB ERROR',
  'BUFFER FULL',
  'RX ERROR',
  'LV RESET',
  'STOPPED',
  'ERROR',
  '?',
] as const;

export type ElmReplyKind =
  | 'ok'
  | 'no-data'
  | 'unable-to-connect'
  | 'bus-error'
  | 'bus-busy'
  | 'buffer-full'
  | 'stopped'
  | 'unsupported'
  | 'timeout'
  | 'searching';

export interface ElmReply {
  kind: ElmReplyKind;
  /** Raw adapter text with the prompt and echo stripped. */
  raw: string;
  /** Uppercase hex-only lines, in arrival order. Empty unless kind === 'ok'. */
  lines: string[];
}

export interface Elm327Options {
  /** Milliseconds to wait for the '>' prompt before giving up. */
  timeoutMs?: number;
  /** Called with every line in and out, for the session log. */
  onTrace?: (direction: 'tx' | 'rx', text: string) => void;
}

interface Pending {
  resolve: (reply: ElmReply) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
}

export class Elm327 {
  private readonly transport: Transport;
  private readonly timeoutMs: number;
  private readonly onTrace?: (direction: 'tx' | 'rx', text: string) => void;

  private buffer = '';
  private pending: Pending | null = null;
  /** Commands are serialised: an adapter can only have one in flight. */
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  /** Set once ATH1 is confirmed, so response parsing knows headers are on. */
  headersOn = false;
  /** Protocol string reported by ATDP, e.g. "ISO 15765-4 (CAN 11/500)". */
  protocol: string | null = null;
  /** Adapter identity from ATI, e.g. "ELM327 v1.5". */
  identity: string | null = null;

  constructor(transport: Transport, options: Elm327Options = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.onTrace = options.onTrace;
  }

  /** Feed bytes from the transport. Called by the session wiring. */
  ingest(chunk: string): void {
    this.buffer += chunk;
    // The adapter signals "ready for the next command" with '>'.
    const promptAt = this.buffer.indexOf('>');
    if (promptAt === -1) return;

    const complete = this.buffer.slice(0, promptAt);
    this.buffer = this.buffer.slice(promptAt + 1);
    this.settle(complete);
  }

  /** The link dropped: fail anything in flight so callers do not hang. */
  fail(reason: string): void {
    this.closed = true;
    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
  }

  private settle(text: string): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    this.onTrace?.('rx', text.trim());
    p.resolve(parseReply(text, p.command));
  }

  /**
   * Send one command and await its reply. Calls are queued, so concurrent
   * callers are serialised rather than corrupting each other's responses.
   */
  send(command: string, timeoutMs?: number): Promise<ElmReply> {
    const run = async (): Promise<ElmReply> => {
      if (this.closed || !this.transport.isOpen()) {
        throw new Error('Adapter is not connected');
      }
      // Drop anything left over from a timed-out previous command.
      this.buffer = '';
      this.onTrace?.('tx', command);

      const reply = await new Promise<ElmReply>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pending?.timer === timer) {
            this.pending = null;
            resolve({ kind: 'timeout', raw: '', lines: [] });
          }
        }, timeoutMs ?? this.timeoutMs);

        this.pending = { resolve, reject, timer, command };
        this.transport.write(`${command}\r`).catch((err: unknown) => {
          clearTimeout(timer);
          this.pending = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });

      // "SEARCHING..." means the adapter is still negotiating a protocol; the
      // real answer follows on the next prompt, so wait once more.
      if (reply.kind === 'searching') {
        return this.send(command, timeoutMs ?? this.timeoutMs);
      }
      return reply;
    };

    const result = this.queue.then(run, run);
    // Keep the chain alive even when a command fails.
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Bring a freshly opened adapter to a known state.
   *
   * Order matters: reset first, then silence the echo and line feeds so replies
   * are compact, then turn headers on so multi-ECU responses can be told apart.
   */
  async initialise(opts: { safeMode?: boolean } = {}): Promise<void> {
    // ATZ reboots the adapter and can take a while; it also echoes junk.
    await this.send('ATZ', 3000);
    await delay(300);
    await this.send('ATE0', 2000); // echo off
    await this.send('ATL0', 2000); // line feeds off
    await this.send('ATS0', 2000); // spaces off — halves the bytes on the wire
    await this.send('ATH1', 2000); // headers on
    this.headersOn = true;

    // Adaptive timing speeds up polling on adapters that support it; safe mode
    // leaves it off and polls one PID at a time for flaky clones.
    await this.send(opts.safeMode ? 'ATAT0' : 'ATAT1', 2000);
    await this.send('ATSP0', 2000); // automatic protocol search

    const id = await this.send('ATI', 2000);
    this.identity = id.raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? null;
  }

  /** Ask the adapter which protocol it settled on. Call after first data. */
  async readProtocol(): Promise<string | null> {
    const reply = await this.send('ATDP', 2000);
    if (reply.kind !== 'ok' && reply.raw.trim() === '') return null;
    const text = reply.raw.replace(/[\r\n>]+/g, ' ').trim();
    this.protocol = text.length > 0 ? text : null;
    return this.protocol;
  }

  /** Battery voltage at the OBD connector, in volts, via ATRV. */
  async readVoltage(): Promise<number | null> {
    const reply = await this.send('ATRV', 2000);
    const match = /([0-9]+(?:\.[0-9]+)?)\s*V?/i.exec(reply.raw);
    if (!match?.[1]) return null;
    const v = Number.parseFloat(match[1]);
    return Number.isFinite(v) ? v : null;
  }
}

/** Classify an adapter reply and extract its hex payload lines. */
export function parseReply(text: string, command?: string): ElmReply {
  const raw = text.replace(/\r/g, '\n');
  const upper = raw.toUpperCase();

  if (/SEARCHING/.test(upper)) {
    // Keep going only if nothing else useful came with it.
    const withoutSearching = upper.replace(/SEARCHING\.*/g, '').trim();
    if (withoutSearching === '' || withoutSearching === command?.toUpperCase()) {
      return { kind: 'searching', raw, lines: [] };
    }
  }
  if (upper.includes('NO DATA')) return { kind: 'no-data', raw, lines: [] };
  if (upper.includes('UNABLE TO CONNECT')) {
    return { kind: 'unable-to-connect', raw, lines: [] };
  }
  if (upper.includes('BUS BUSY')) return { kind: 'bus-busy', raw, lines: [] };
  if (upper.includes('BUFFER FULL')) return { kind: 'buffer-full', raw, lines: [] };
  if (upper.includes('STOPPED')) return { kind: 'stopped', raw, lines: [] };
  if (upper.trim() === '?') return { kind: 'unsupported', raw, lines: [] };
  if (BUS_ERRORS.some((e) => e !== 'ERROR' && e !== '?' && upper.includes(e))) {
    return { kind: 'bus-error', raw, lines: [] };
  }

  const lines = raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, '').toUpperCase())
    .filter((line) => line.length > 0)
    // Drop the echoed command and anything that is not pure hex.
    .filter((line) => line !== command?.replace(/\s+/g, '').toUpperCase())
    .filter((line) => /^[0-9A-F]+$/.test(line));

  if (lines.length === 0) {
    // Non-hex but not a known error: treat a bare "OK" as success.
    if (upper.includes('OK')) return { kind: 'ok', raw, lines: [] };
    if (upper.includes('ERROR')) return { kind: 'bus-error', raw, lines: [] };
    return { kind: 'no-data', raw, lines: [] };
  }

  return { kind: 'ok', raw, lines };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
