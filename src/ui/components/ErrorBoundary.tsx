/**
 * Error boundary, global handler and unhandled-rejection trap.
 *
 * A diagnostic tool that closes without explanation is worse than useless:
 * whatever went wrong is exactly the information needed to fix it, and it
 * disappears with the process.
 *
 * Three routes lead here, and all three are intercepted:
 *
 *  - An error thrown while React renders, caught by the boundary.
 *  - An error thrown outside React — in a promise, a timer, or a callback
 *    from native code — which reaches React Native's global handler. That
 *    handler's default behaviour for a fatal error is to rethrow it into Java,
 *    which ends the process. So it is only chained to when nothing is
 *    listening, which means before the app has mounted.
 *  - A rejected promise nobody handled, which on Hermes otherwise vanishes.
 *
 * A crash inside native code still cannot be caught: it takes the process down
 * before JavaScript runs. Everything else lands on a readable screen.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export interface CapturedError {
  error: unknown;
  isFatal: boolean;
  source: 'global' | 'rejection';
  at: number;
}

type Listener = (captured: CapturedError) => void;

/** Kept outside React so an error before mount is still recorded. */
const pending: CapturedError[] = [];
let listener: Listener | null = null;

function capture(captured: CapturedError): void {
  pending.push(captured);
  listener?.(captured);
}

function subscribe(next: Listener): () => void {
  listener = next;
  // Hand over anything that arrived before the boundary mounted.
  const queued = [...pending];
  pending.length = 0;
  for (const item of queued) next(item);

  return () => {
    listener = null;
  };
}

export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      capture({ error, isFatal: isFatal ?? false, source: 'global', at: Date.now() });

      // Chaining to the default handler on a fatal error rethrows into Java
      // and ends the process — the exact outcome this exists to prevent. It
      // is only worth doing when there is no screen to show the error on.
      if (!listener) previous(error, isFatal);
    });
  }

  // Hermes reports unhandled rejections through this hook when it is set.
  const hermesPromise = (globalThis as {
    HermesInternal?: { hasPromise?: () => boolean };
    Promise?: { prototype?: unknown };
  }).HermesInternal;

  if (hermesPromise) {
    const tracking = (globalThis as {
      __turboModuleProxy?: unknown;
      process?: { on?: (event: string, handler: (reason: unknown) => void) => void };
    }).process;
    tracking?.on?.('unhandledRejection', (reason: unknown) => {
      capture({ error: reason, isFatal: false, source: 'rejection', at: Date.now() });
    });
  }
}

function describe(captured: CapturedError): string {
  const { error } = captured;
  const label = captured.source === 'rejection' ? 'Unhandled promise rejection' : 'Error';
  const fatal = captured.isFatal ? ' (fatal)' : '';

  if (error instanceof Error) {
    return `${label}${fatal}: ${error.message}\n${error.stack ?? '(no stack)'}`;
  }
  return `${label}${fatal}: ${String(error)}`;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };
  private unsubscribe: (() => void) | null = null;
  private captured: CapturedError[] = [];

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidMount(): void {
    this.unsubscribe = subscribe((item) => {
      this.captured = [...this.captured.slice(-4), item];
      // Only take over the screen for something that would have ended the
      // process. A handled rejection is recorded but not shown.
      if (item.isFatal || item.source === 'global') {
        const error = item.error instanceof Error ? item.error : new Error(String(item.error));
        this.setState({ error });
      }
    });
  }

  override componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, componentStack: info.componentStack ?? null });
  }

  private report(): string {
    const { error, componentStack } = this.state;
    const lines = [
      'OBD Scout — error report',
      new Date().toISOString(),
      '',
      `Message: ${error?.message ?? 'unknown'}`,
      '',
      'Stack:',
      error?.stack ?? '(none)',
    ];

    if (componentStack) lines.push('', 'Component stack:', componentStack);

    if (this.captured.length > 0) {
      lines.push('', 'Captured errors, oldest first:');
      for (const item of this.captured) lines.push('', describe(item));
    }

    return lines.join('\n');
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Deliberately plain: the theme and shared components may be part of what
    // failed, so this screen depends on neither.
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0E14', padding: 24, paddingTop: 72 }}>
        <Text style={{ color: '#FF4D3D', fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
          Something broke
        </Text>
        <Text style={{ color: '#8296AE', fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
          The app hit an error it could not recover from. The details below are what is needed to
          fix it — sharing them is far more useful than describing what happened.
        </Text>

        <ScrollView
          style={{
            flex: 1,
            backgroundColor: '#141A23',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#243040',
            padding: 14,
          }}
        >
          <Text selectable style={{ color: '#E8EDF4', fontSize: 12, lineHeight: 18 }}>
            {this.report()}
          </Text>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Text
            onPress={async () => {
              try {
                const file = new File(Paths.cache, `obd-scout-error-${Date.now()}.txt`);
                file.create({ overwrite: true });
                await file.write(this.report());
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
                }
              } catch {
                // A second error screen helps nobody; the text above is
                // selectable and can be copied by hand.
              }
            }}
            style={{
              flex: 1, backgroundColor: '#FFB020', color: '#0A0E14',
              fontSize: 15, fontWeight: '600', textAlign: 'center',
              paddingVertical: 14, borderRadius: 10, overflow: 'hidden',
            }}
          >
            Share the details
          </Text>
          <Text
            onPress={() => this.setState({ error: null, componentStack: null })}
            style={{
              flex: 1, backgroundColor: '#1C242F', color: '#E8EDF4',
              fontSize: 15, fontWeight: '600', textAlign: 'center',
              paddingVertical: 14, borderRadius: 10, overflow: 'hidden',
            }}
          >
            Back to the app
          </Text>
        </View>
      </View>
    );
  }
}
