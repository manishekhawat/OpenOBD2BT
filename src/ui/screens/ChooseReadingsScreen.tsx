/**
 * Choose readings.
 *
 * Only the parameters the connected vehicle actually reports are offered, so
 * the list cannot promise something the vehicle will never answer.
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { pidsForVehicle, type PidDefinition } from '@/obd/pids';
import { session } from '@/obd/session';
import { useLive } from '@/state/live';
import { useVehicles } from '@/state/vehicles';
import type { DashboardSlot } from '@/data/repo/vehicles';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Label,
  Panel,
  Row,
  Screen,
  Tappable,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** A dashboard of more than eight gauges is unreadable on a phone. */
const DASHBOARD_LIMIT = 8;

export function ChooseReadingsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ChooseReadings'>>();
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const purpose = route.params.purpose;
  const dashboard = useVehicles((s) => s.dashboard);
  const setDashboard = useVehicles((s) => s.setDashboard);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);
  const activePids = useLive((s) => s.activePids);
  const setActivePids = useLive((s) => s.setActivePids);

  const initial = purpose === 'dashboard' ? dashboard.map((s) => s.pid) : activePids;
  const [selected, setSelected] = useState<number[]>(initial);

  const available = useMemo(() => {
    const forType = pidsForVehicle(activeVehicle?.type ?? 'car');
    return forType.filter((d) => session.supportedPids.includes(d.pid));
  }, [activeVehicle?.type]);

  const limit = purpose === 'dashboard' ? DASHBOARD_LIMIT : 24;

  const toggle = (pid: number) => {
    setSelected((current) => {
      if (current.includes(pid)) return current.filter((p) => p !== pid);
      if (current.length >= limit) return current;
      return [...current, pid];
    });
  };

  const save = async () => {
    if (purpose === 'dashboard') {
      const slots: DashboardSlot[] = selected.map((pid, index) => ({
        slot: index,
        pid,
        style: index < 2 ? 'gauge' : 'number',
      }));
      await setDashboard(slots);
    } else {
      setActivePids(selected);
    }
    navigation.goBack();
  };

  if (available.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing to choose from yet"
          body="The list is built from what the connected vehicle reports it can answer. Connect with the ignition on, and the readings it supports appear here."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  const byCategory = new Map<string, PidDefinition[]>();
  for (const definition of available) {
    const list = byCategory.get(definition.category) ?? [];
    list.push(definition);
    byCategory.set(definition.category, list);
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>{purpose === 'dashboard' ? 'Dashboard readings' : 'Readings to poll'}</Title>
        <Label>
          {`${selected.length} of ${limit} chosen. Fewer readings refresh faster, because the adapter answers one request at a time.`}
        </Label>
      </View>

      {[...byCategory.entries()].map(([category, definitions]) => (
        <View key={category} style={{ marginTop: space.wide }}>
          <Label style={{ marginBottom: space.small }}>{categoryName(category)}</Label>
          <Panel style={{ padding: 0 }}>
            {definitions.map((definition, index) => {
              const chosen = selected.includes(definition.pid);
              const full = !chosen && selected.length >= limit;
              return (
                <View key={definition.pid}>
                  {index > 0 ? <Divider inset={space.gap} /> : null}
                  <Tappable
                    onPress={() => toggle(definition.pid)}
                    accessibilityLabel={`${chosen ? 'Remove' : 'Add'} ${definition.name}`}
                  >
                    <Row justify="space-between" style={{ padding: space.gap, opacity: full ? 0.4 : 1 }}>
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>{definition.name}</Body>
                        <Label style={{ marginTop: 2 }}>
                          {`${definition.unit || 'no unit'} · ${rateLabel(definition.rate)}`}
                        </Label>
                      </View>
                      <View
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor: chosen ? palette.amber : palette.line,
                          backgroundColor: chosen ? palette.amber : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {chosen ? (
                          <Label style={{ color: palette.isDark ? palette.ground : '#FFFFFF', fontWeight: '800' }}>
                            ✓
                          </Label>
                        ) : null}
                      </View>
                    </Row>
                  </Tappable>
                </View>
              );
            })}
          </Panel>
        </View>
      ))}

      <Button
        label="Save"
        tone="primary"
        onPress={() => void save()}
        style={{ marginTop: space.section }}
      />
    </Screen>
  );
}

function rateLabel(rate: PidDefinition['rate']): string {
  switch (rate) {
    case 'fast': return 'refreshes quickly';
    case 'medium': return 'refreshes steadily';
    case 'slow': return 'changes slowly';
  }
}

function categoryName(category: string): string {
  switch (category) {
    case 'engine': return 'Engine';
    case 'fuel': return 'Fuel';
    case 'air': return 'Air and intake';
    case 'temperature': return 'Temperatures';
    case 'electrical': return 'Electrical';
    case 'emissions': return 'Emissions';
    case 'turbo': return 'Turbocharger';
    case 'dpf': return 'Particulate filter';
    case 'torque': return 'Torque';
    case 'trip': return 'Counters';
    default: return 'Other';
  }
}
