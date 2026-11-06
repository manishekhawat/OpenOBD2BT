/**
 * Error boundary and global handler.
 *
 * A diagnostic tool that closes without explanation is worse than useless:
 * whatever went wrong is exactly the information needed to fix it, and it
 * disappears with the process. This catches what can be caught, shows it
 * plainly, and lets it be shared.
 *
 * It cannot catch a crash inside native code — that takes the process down
 * before JavaScript sees anything. But most crashes in a React Native app are
 * JavaScript, and those land here.
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

/** Kept outside React so a handler firing during a render can still record it. */
let lastGlobalError: { error: unknown; isFatal: boolean } | null = null;

export function installGlobalErrorHandler(): void {
  // ErrorUtils is React Native's own global handler hook. It is not in the
  // type definitions, so it is reached through globalThis.
  const errorUtils = (globalThis as { ErrorUtils?: {
    getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  } }).ErrorUtils;

  if (!errorUtils) return;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    lastGlobalError = { error, isFatal: isFatal ?? false };
    previous(error, isFatal);
  });
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
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

    if (componentStack) {
      lines.push('', 'Component stack:', componentStack);
    }

    if (lastGlobalError) {
      const globalError = lastGlobalError.error;
      lines.push(
        '',
        `Earlier global error (fatal: ${lastGlobalError.isFatal}):`,
        globalError instanceof Error
          ? `${globalError.message}\n${globalError.stack ?? ''}`
          : String(globalError),
      );
    }

    return lines.join('\n');
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Deliberately plain: the theme hooks may be part of what failed, so this
    // screen uses no context and no shared components.
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0E14', padding: 24, paddingTop: 72 }}>
        <Text style={{ color: '#FF4D3D', fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
          Something broke
        </Text>
        <Text style={{ color: '#8296AE', fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
          The app hit an error it could not recover from. The details below are what is needed to
          fix it — sharing them is more useful than describing what happened.
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
                // Sharing failing here is not worth a second error screen; the
                // text above is selectable and can be copied instead.
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
            Try again
          </Text>
        </View>
      </View>
    );
  }
}
