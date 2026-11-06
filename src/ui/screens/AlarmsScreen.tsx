/**
 * Alarms.
 *
 * An alarm fires once when a reading stays past its limit for the hold time,
 * and re-arms when it comes back. A missing reading never fires one, because
 * silence from the adapter is not the same as a bad value.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  deleteAlarm,
  describeAlarm,
  listAlarms,
  saveAlarm,
  suggestedAlarms,
  type Alarm,
  type Comparator,
} from '@/data/repo/alarms';
import { pidDefinition, pidsForVehicle } from '@/obd/pids';
import { session } from '@/obd/session';
import { useLive } from '@/state/live';
import { useVehicles } from '@/state/vehicles';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Label,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Tappable,
  Title,
} from '../components/primitives';
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AlarmsScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const activeId = useVehicles((s) => s.activeId);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);
  const readings = useLive((s) => s.readings);

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    listAlarms(activeId).then(setAlarms).catch(() => undefined);
  }, [activeId]);

  useFocusEffect(reload);

  if (!activeId) {
    return (
      <Screen>
        <EmptyState
          title="Alarms belong to a vehicle"
          body="Each vehicle keeps its own alarms, since a safe coolant temperature on one is not safe on another. Add a vehicle profile first."
          actionLabel="Add a vehicle"
          onAction={() => navigation.navigate('VehicleEdit', {})}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Alarms</Title>
        <Label>
          {`For ${activeVehicle?.name ?? 'this vehicle'}. Alarms only check readings while live data is on screen.`}
        </Label>
      </View>

      {alarms.length === 0 && !adding ? (
        <View style={{ marginTop: space.wide, gap: space.base }}>
          <Panel>
            <Body color={palette.muted}>
              Nothing set yet. The usual three are an overheat warning, a low charging voltage
              warning and a low fuel warning.
            </Body>
          </Panel>
          <Button
            label="Add the usual three"
            tone="primary"
            onPress={async () => {
              for (const alarm of suggestedAlarms(activeId)) await saveAlarm(alarm);
              reload();
            }}
          />
          <Button label="Add one myself" tone="neutral" onPress={() => setAdding(true)} />
        </View>
      ) : null}

      {alarms.length > 0 ? (
        <Panel style={{ marginTop: space.gap, padding: 0 }}>
          {alarms.map((alarm, index) => {
            const definition = pidDefinition(alarm.pid);
            const current = readings[alarm.pid]?.value ?? null;
            const tripped =
              current !== null &&
              (alarm.comparator === 'above' ? current >= alarm.threshold : current <= alarm.threshold);

            return (
              <View key={alarm.id}>
                {index > 0 ? <Divider inset={space.gap} /> : null}
                <Row justify="space-between" style={{ padding: space.gap }} gap={space.base}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Title style={{ fontSize: type.body }} numberOfLines={1}>
                      {alarm.label ?? definition?.name ?? 'Alarm'}
                    </Title>
                    <Label numberOfLines={2}>{describeAlarm(alarm)}</Label>
                    {current !== null ? (
                      <Label style={{ color: tripped ? palette.red : palette.muted, marginTop: 2 }}>
                        {`Now ${current.toFixed(definition?.precision ?? 0)}${definition?.unit ? ` ${definition.unit}` : ''}${tripped ? ' — past the limit' : ''}`}
                      </Label>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: space.small }}>
                    <Switch
                      value={alarm.enabled}
                      onValueChange={async (enabled) => {
                        await saveAlarm({ ...alarm, enabled });
                        reload();
                      }}
                      trackColor={{ true: palette.amber, false: palette.track }}
                      thumbColor={palette.isDark ? palette.text : '#FFFFFF'}
                    />
                    <Tappable
                      onPress={() =>
                        Alert.alert('Delete this alarm?', describeAlarm(alarm), [
                          { text: 'Keep it', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              await deleteAlarm(alarm.id);
                              reload();
                            },
                          },
                        ])
                      }
                    >
                      <Label style={{ color: palette.muted }}>Delete</Label>
                    </Tappable>
                  </View>
                </Row>
              </View>
            );
          })}
        </Panel>
      ) : null}

      {adding ? (
        <AlarmEditor
          vehicleId={activeId}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : alarms.length > 0 ? (
        <Button label="Add an alarm" tone="neutral" onPress={() => setAdding(true)} style={{ marginTop: space.gap }} />
      ) : null}
    </Screen>
  );
}

function AlarmEditor({
  vehicleId, onDone, onCancel,
}: {
  vehicleId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const palette = usePalette();
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);

  const available = pidsForVehicle(activeVehicle?.type ?? 'car').filter(
    (d) => session.supportedPids.length === 0 || session.supportedPids.includes(d.pid),
  );

  const [pid, setPid] = useState<number>(available[0]?.pid ?? 0x05);
  const [comparator, setComparator] = useState<Comparator>('above');
  const [threshold, setThreshold] = useState('100');
  const [hold, setHold] = useState('5');

  const definition = pidDefinition(pid);

  return (
    <Panel style={{ marginTop: space.gap, gap: space.gap }}>
      <Title style={{ fontSize: type.lead }}>New alarm</Title>

      <View style={{ gap: space.small }}>
        <Label style={{ color: palette.text, fontSize: type.body, fontWeight: '600' }}>Reading</Label>
        <View style={{ maxHeight: 220 }}>
          <Screen scroll contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
            {available.slice(0, 20).map((d) => (
              <Tappable key={d.pid} onPress={() => setPid(d.pid)}>
                <Row justify="space-between" style={{ paddingVertical: 9 }}>
                  <Label style={{ color: d.pid === pid ? palette.amber : palette.text, flex: 1 }} numberOfLines={1}>
                    {d.name}
                  </Label>
                  {d.pid === pid ? <Label style={{ color: palette.amber }}>✓</Label> : null}
                </Row>
              </Tappable>
            ))}
          </Screen>
        </View>
      </View>

      <Row gap={space.small}>
        {(['above', 'below'] as Comparator[]).map((option) => {
          const active = option === comparator;
          return (
            <Tappable key={option} onPress={() => setComparator(option)} style={{ flex: 1 }}>
              <View
                style={{
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderRadius: radius.tile,
                  backgroundColor: active ? palette.amber : palette.panelHigh,
                }}
              >
                <Label
                  style={{
                    color: active ? (palette.isDark ? palette.ground : '#FFFFFF') : palette.text,
                    fontWeight: '600',
                    fontSize: type.body,
                  }}
                >
                  {option === 'above' ? 'Goes above' : 'Falls below'}
                </Label>
              </View>
            </Tappable>
          );
        })}
      </Row>

      <Row gap={space.base}>
        <View style={{ flex: 1, gap: space.small }}>
          <Label>{`Limit${definition?.unit ? ` (${definition.unit})` : ''}`}</Label>
          <TextInput
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numbers-and-punctuation"
            style={inputStyle(palette)}
          />
        </View>
        <View style={{ flex: 1, gap: space.small }}>
          <Label>Hold for (s)</Label>
          <TextInput
            value={hold}
            onChangeText={setHold}
            keyboardType="number-pad"
            style={inputStyle(palette)}
          />
        </View>
      </Row>

      <Row gap={space.small}>
        <Button
          label="Save alarm"
          tone="primary"
          style={{ flex: 1 }}
          onPress={async () => {
            await saveAlarm({
              vehicleId,
              pid,
              comparator,
              threshold: Number(threshold) || 0,
              holdSeconds: Number(hold) || 3,
              enabled: true,
              label: definition?.name ?? null,
            });
            onDone();
          }}
        />
        <Button label="Cancel" tone="quiet" onPress={onCancel} style={{ flex: 1 }} />
      </Row>
    </Panel>
  );
}

function inputStyle(palette: ReturnType<typeof usePalette>) {
  return {
    backgroundColor: palette.panelHigh,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: palette.line,
    color: palette.text,
    paddingHorizontal: space.base,
    paddingVertical: 12,
    fontSize: type.body,
  };
}
