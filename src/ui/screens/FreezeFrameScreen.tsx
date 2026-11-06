/**
 * Freeze frame.
 *
 * The snapshot of conditions the engine computer kept at the moment a fault
 * was recorded — the single most useful thing for working out why it happened,
 * and the thing clearing codes destroys.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { pidDefinition } from '@/obd/pids';
import { session, type Reading as ObdReading } from '@/obd/session';
import { useConnection } from '@/state/connection';
import { useSettings } from '@/state/settings';
import { format } from '@/features/units';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Label,
  Panel,
  Reading,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FreezeFrameScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);
  const units = useSettings((s) => s.units);

  const [frame, setFrame] = useState<ObdReading[] | null>(null);
  const [loading, setLoading] = useState(false);

  const connected = status.state === 'ready' && !status.vehicleSilent;

  const read = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      setFrame(await session.readFreezeFrame(0));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    if (frame === null && connected) void read();
  }, [frame, connected, read]);

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to read the freeze frame"
          body="The snapshot lives in the engine computer, so the vehicle has to be connected."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  if (loading && frame === null) {
    return (
      <Screen>
        <View style={{ paddingTop: space.page }}>
          <Title>Reading the snapshot…</Title>
        </View>
      </Screen>
    );
  }

  if (!frame || frame.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No freeze frame stored"
          body="The engine computer keeps a snapshot only when it records a fault. An empty frame usually means nothing is stored, or the codes were cleared — clearing erases the frame along with them."
          actionLabel="Read again"
          onAction={() => void read()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Conditions when the fault was recorded</Title>
        <Body color={palette.muted}>
          These are not live values. They are what the engine was doing at the instant the fault was
          stored, which is usually the fastest route to understanding it.
        </Body>
      </View>

      <SectionHeader>Snapshot</SectionHeader>
      <Panel style={{ paddingVertical: space.small }}>
        {frame.map((entry, index) => {
          const definition = pidDefinition(entry.pid);
          if (!definition) return null;
          const shown = format(entry.value, definition.unit, units, definition.precision);
          return (
            <View key={entry.pid}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" style={{ paddingVertical: space.base }}>
                <Body style={{ flex: 1 }} numberOfLines={1}>
                  {definition.name}
                </Body>
                <Reading value={shown.text} unit={shown.unit} size={type.lead} align="right" />
              </Row>
            </View>
          );
        })}
      </Panel>

      <Button
        label={loading ? 'Reading' : 'Read again'}
        onPress={() => void read()}
        tone="neutral"
        busy={loading}
        style={{ marginTop: space.gap }}
      />
    </Screen>
  );
}
