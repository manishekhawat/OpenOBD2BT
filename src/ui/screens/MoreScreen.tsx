/**
 * More.
 *
 * Everything that is not a daily destination. Grouped by what you would be
 * trying to do, not by how the app is built.
 */

import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useConnection } from '@/state/connection';
import { useVehicles, describeVehicle } from '@/state/vehicles';

import {
  Divider,
  Label,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Tappable,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Item {
  label: string;
  note: string;
  route: keyof RootStackParamList;
  needsConnection?: boolean;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Vehicle',
    items: [
      { label: 'Vehicles', note: 'Profiles, engine size, tank and weight', route: 'Vehicles' },
      { label: 'Vehicle information', note: 'VIN, calibration and ECU names', route: 'VehicleInfo', needsConnection: true },
      { label: 'Fuel', note: 'Log fill-ups and track economy', route: 'Fuel' },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { label: 'Vehicle health', note: 'What the readings mean together', route: 'Health', needsConnection: true },
      { label: 'Monitor test results', note: 'The measurements behind each self-check', route: 'TestResults', needsConnection: true },
      { label: 'Pre-purchase inspection', note: 'Checking a vehicle before buying it', route: 'Inspection', needsConnection: true },
      { label: 'Scan history', note: 'Every saved scan on this phone', route: 'History' },
      { label: 'Look up a code', note: 'Search by code number or words', route: 'CodeLookup' },
      { label: 'Emission readiness', note: 'On-board self-check status', route: 'Readiness', needsConnection: true },
      { label: 'Freeze frame', note: 'Conditions when the fault was recorded', route: 'FreezeFrame', needsConnection: true },
    ],
  },
  {
    title: 'Measurement',
    items: [
      { label: 'Performance', note: 'Acceleration runs and power estimates', route: 'Performance' },
      { label: 'Alarms', note: 'Warn when a reading goes out of range', route: 'Alarms' },
    ],
  },
  {
    title: 'App',
    items: [
      { label: 'Settings', note: 'Theme, units, language and adapter behaviour', route: 'Settings' },
      { label: 'Adapter log', note: 'The raw conversation, for troubleshooting', route: 'AdapterLog' },
      { label: 'About', note: 'Version, data sources and licences', route: 'About' },
    ],
  },
];

export function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);

  const connected = status.state === 'ready';

  return (
    <Screen>
      <View style={{ paddingTop: space.wide }}>
        <Title>More</Title>
      </View>

      <Panel style={{ marginTop: space.gap }}>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Label>{connected ? 'Connected' : 'Not connected'}</Label>
            <Title style={{ fontSize: type.lead, marginTop: 2 }} numberOfLines={1}>
              {status.adapterLabel ?? 'No adapter'}
            </Title>
            {status.protocol ? <Label style={{ marginTop: 2 }}>{status.protocol}</Label> : null}
          </View>
          <View
            style={{
              width: 9, height: 9, borderRadius: 5,
              backgroundColor: connected ? palette.green : palette.muted,
            }}
          />
        </Row>
        {activeVehicle ? (
          <>
            <Divider />
            <Row justify="space-between" style={{ paddingTop: space.base }}>
              <Label>Vehicle</Label>
              <Label style={{ color: palette.text }}>
                {`${activeVehicle.name} · ${describeVehicle(activeVehicle)}`}
              </Label>
            </Row>
          </>
        ) : null}
      </Panel>

      {GROUPS.map((group) => (
        <View key={group.title}>
          <SectionHeader>{group.title}</SectionHeader>
          <Panel style={{ padding: 0 }}>
            {group.items.map((item, index) => {
              const disabled = item.needsConnection && !connected;
              return (
                <View key={item.label}>
                  {index > 0 ? <Divider inset={space.gap} /> : null}
                  <Tappable
                    onPress={() => {
                      if (disabled) navigation.navigate('Connect');
                      else navigation.navigate(item.route as never);
                    }}
                  >
                    <View style={{ padding: space.gap, opacity: disabled ? 0.5 : 1 }}>
                      <Row justify="space-between">
                        <View style={{ flex: 1 }}>
                          <Title style={{ fontSize: type.body }}>{item.label}</Title>
                          <Label style={{ marginTop: 2 }}>
                            {disabled ? 'Needs a connected adapter' : item.note}
                          </Label>
                        </View>
                        <Label style={{ fontSize: type.title, color: palette.muted }}>›</Label>
                      </Row>
                    </View>
                  </Tappable>
                </View>
              );
            })}
          </Panel>
        </View>
      ))}
    </Screen>
  );
}
