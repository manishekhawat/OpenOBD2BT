/**
 * App entry.
 *
 * Opens straight onto the home screen. There is no sign-in, no account
 * creation, no trial and no purchase step anywhere in the app — the only thing
 * between launch and a working tool is the database opening.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { getDb } from '@/data/db';
import { discardUnfinishedTrips } from '@/data/repo/trips';
import { useVehicles } from '@/state/vehicles';

import { Navigation } from '@/ui/navigation';
import { Body, Title } from '@/ui/components/primitives';
import { space, usePalette } from '@/ui/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadVehicles = useVehicles((s) => s.load);

  useEffect(() => {
    (async () => {
      await getDb();
      // A trip left open by the app being killed mid-recording has no end time
      // and no useful summary, so it is dropped rather than shown as a stub.
      await discardUnfinishedTrips();
      await loadVehicles();
      setReady(true);
    })().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'The local database could not be opened.');
      // Still let the app run: fault lookup and the demo work without storage.
      setReady(true);
    });
  }, [loadVehicles]);

  if (!ready) return <Boot />;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Navigation />
      {error ? <StorageWarning message={error} /> : null}
    </SafeAreaProvider>
  );
}

function Boot() {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.ground }} />
  );
}

/**
 * Shown only if the database could not be opened. The app keeps working; what
 * is lost is saving, so the message says exactly that rather than apologising.
 */
function StorageWarning({ message }: { message: string }) {
  const palette = usePalette();
  return (
    <View
      style={{
        position: 'absolute',
        left: space.gap,
        right: space.gap,
        bottom: 80,
        backgroundColor: palette.panel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.red,
        padding: space.gap,
      }}
    >
      <Title style={{ fontSize: 15, color: palette.red }}>Scans will not be saved</Title>
      <Body color={palette.muted} style={{ marginTop: 4, fontSize: 13 }}>
        {`Storage on this phone could not be opened, so history is unavailable this session. Everything else works. (${message})`}
      </Body>
    </View>
  );
}
