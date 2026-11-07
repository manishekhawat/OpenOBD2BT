/**
 * Diagnostic log.
 *
 * Written to disk synchronously, which is the whole point: a native crash ends
 * the process without unwinding, so anything held in memory goes with it. The
 * last line that reached the file is therefore the last thing the app managed
 * to do, which is exactly what is needed to find where it died.
 *
 * Two files are kept. The current session writes to one; at startup that file
 * is rotated to the other, so the log of a session that crashed survives the
 * restart and can be read and shared afterwards.
 *
 * Nothing here is allowed to throw. A logger that can fail is a logger that
 * introduces the crashes it was added to diagnose.
 */

import { Directory, File, Paths } from 'expo-file-system';

export type LogLevel = 'info' | 'warn' | 'error' | 'tx' | 'rx';

export interface LogLine {
  at: number;
  level: LogLevel;
  tag: string;
  message: string;
}

/** Enough to cover a session without growing without bound. */
const MAX_LINES = 1200;

const CURRENT = 'obd-scout-session.log';
const PREVIOUS = 'obd-scout-previous.log';

let lines: LogLine[] = [];
let previousSession: string | null = null;
let ready = false;
/** Writing is skipped entirely once it has failed; it is not worth retrying. */
let diskUsable = true;

function directory(): Directory {
  return new Directory(Paths.document, 'logs');
}

function file(name: string): File {
  return new File(directory(), name);
}

function format(line: LogLine): string {
  const time = new Date(line.at).toISOString().slice(11, 23);
  const marker =
    line.level === 'tx' ? '>>' :
    line.level === 'rx' ? '<<' :
    line.level === 'error' ? 'ER' :
    line.level === 'warn' ? 'WA' : '--';
  return `${time} ${marker} [${line.tag}] ${line.message}`;
}

/**
 * Rotate the previous session's log and start a new one.
 *
 * Called once at startup, before anything else runs, so that whatever happens
 * next is recorded from the first moment.
 */
export function startLogging(context: Record<string, string | number | boolean>): void {
  try {
    const dir = directory();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const current = file(CURRENT);
    if (current.exists) {
      try {
        previousSession = current.textSync();
      } catch {
        previousSession = null;
      }
      try {
        const old = file(PREVIOUS);
        if (old.exists) old.delete();
        current.move(file(PREVIOUS));
      } catch {
        // Losing the older log is not worth failing startup over.
      }
    }
  } catch {
    diskUsable = false;
  }

  ready = true;
  lines = [];

  log('info', 'app', '=== session started ===');
  for (const [key, value] of Object.entries(context)) {
    log('info', 'app', `${key}: ${String(value)}`);
  }

  if (previousSession && !previousSession.includes('=== session ended cleanly ===')) {
    log(
      'warn',
      'app',
      'The previous session did not end cleanly — its log is kept and can be shared.',
    );
  }
}

/** True when the previous session ended without shutting down properly. */
export function previousSessionCrashed(): boolean {
  if (!previousSession) return false;
  return !previousSession.includes('=== session ended cleanly ===');
}

/** The last thing the previous session did, which is where it stopped. */
export function previousSessionLastLine(): string | null {
  if (!previousSession) return null;
  const trimmed = previousSession.trimEnd().split('\n');
  return trimmed[trimmed.length - 1] ?? null;
}

/**
 * Record a line and put it on disk immediately.
 *
 * Synchronous on purpose. An async write scheduled just before a native crash
 * never runs, and the line that mattered most is the one that is lost.
 */
export function log(level: LogLevel, tag: string, message: string): void {
  try {
    const line: LogLine = { at: Date.now(), level, tag, message };
    lines.push(line);
    if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);

    if (!ready || !diskUsable) return;

    const body = lines.map(format).join('\n');
    const target = file(CURRENT);
    if (!target.exists) target.create({ overwrite: true, intermediates: true });
    target.writeSync(body);
  } catch {
    // Never let logging be the thing that breaks.
    diskUsable = false;
  }
}

export const logger = {
  info: (tag: string, message: string) => log('info', tag, message),
  warn: (tag: string, message: string) => log('warn', tag, message),
  error: (tag: string, message: string) => log('error', tag, message),
};

/** Mark a clean shutdown, so the next launch knows this session did not crash. */
export function endLoggingCleanly(): void {
  log('info', 'app', '=== session ended cleanly ===');
}

export function currentLines(): LogLine[] {
  return lines;
}

/** Both sessions, newest last, as plain text for sharing. */
export function fullLogText(): string {
  const parts: string[] = [];

  if (previousSession) {
    parts.push('================ PREVIOUS SESSION ================');
    parts.push(previousSession.trimEnd());
    parts.push('');
  }

  parts.push('================ CURRENT SESSION ================');
  parts.push(lines.map(format).join('\n'));

  return parts.join('\n');
}

/** Clear both logs. */
export function clearLogs(): void {
  try {
    lines = [];
    previousSession = null;
    for (const name of [CURRENT, PREVIOUS]) {
      const target = file(name);
      if (target.exists) target.delete();
    }
  } catch {
    // Nothing useful to do.
  }
}
