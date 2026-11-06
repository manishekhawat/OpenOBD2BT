/**
 * Head-up display.
 *
 * For propping the phone on the dashboard: one huge number, mirrored so it
 * reads correctly in the windscreen reflection, and black everywhere so the
 * glass does not glow. Tapping cycles the reading; a long press turns the
 * mirroring off for use as a plain large readout.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StatusBar, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';

import { pidDefinition } from '@/obd/pids';
import { session } from '@/obd/session';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { format } from '@/features/units';

import { Label } from '../components/primitives';
import { tabular } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The readings worth projecting, in cycle order. */
const HUD_PIDS = [0x0d, 0x0c, 0x05, 0x42, 0x04, 0x11];

export function HudScreen() {
  const navigation = useNavigation<Nav>();
  const units = useSettings((s) => s.units);
  const readings = useLive((s) => s.readings);
  const startPolling = useLive((s) => s.startPolling);
  const stopPolling = useLive((s) => s.stopPolling);

  const [index, setIndex] = useState(0);
  const [mirrored, setMirrored] = useState(true);

  // A head-up display that sleeps is useless, so this one always stays awake.
  useKeepAwake('obd-hud');

  const available = useMemo(
    () => HUD_PIDS.filter((pid) => session.supportedPids.includes(pid)),
    [],
  );

  useEffect(() => {
    if (available.length === 0) return undefined;
    startPolling(available);
    return () => stopPolling();
  }, [available, startPolling, stopPolling]);

  const pid = available[index % Math.max(1, available.length)] ?? HUD_PIDS[0] ?? 0x0d;
  const definition = pidDefinition(pid);
  const raw = readings[pid]?.value ?? null;
  const shown = definition && raw !== null ? format(raw, definition.unit, units, definition.precision) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar hidden />
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => setIndex((i) => i + 1)}
        onLongPress={() => setMirrored((m) => !m)}
        accessibilityLabel="Head-up display. Tap to change the reading, long press to flip it."
      >
        <View style={{ transform: [{ scaleX: mirrored ? -1 : 1 }], alignItems: 'center' }}>
          <Text
            style={[
              tabular,
              {
                color: '#FFB020',
                fontSize: 148,
                fontWeight: '700',
                letterSpacing: -6,
                lineHeight: 160,
              },
            ]}
          >
            {shown ? shown.text : '—'}
          </Text>
          <Text style={{ color: '#8A6418', fontSize: 30, fontWeight: '600', marginTop: -14 }}>
            {shown ? shown.unit : definition?.unit ?? ''}
          </Text>
          <Text style={{ color: '#5C4411', fontSize: 17, marginTop: 14 }}>
            {definition?.name ?? 'No reading'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => navigation.goBack()}
        style={{ position: 'absolute', top: 20, right: 20, padding: 16 }}
        accessibilityLabel="Close the head-up display"
      >
        <Label style={{ color: '#5C4411', fontSize: 17 }}>Close</Label>
      </Pressable>

      <View style={{ position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' }}>
        <Label style={{ color: '#3A2C0C', fontSize: 12 }}>
          Tap to change reading · hold to flip · prop against the windscreen
        </Label>
      </View>
    </View>
  );
}
