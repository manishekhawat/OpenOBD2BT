/**
 * Live data.
 *
 * One screen with three views of the same stream — a gauge dashboard, the full
 * list of readings, and a plot — because they are the same data at different
 * densities, not three separate features.
 */

import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';

import { pidDefinition, pidsForVehicle } from '@/obd/pids';
import { session } from '@/obd/session';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useVehicles } from '@/state/vehicles';
import { fuelRate, litresPer100Km } from '@/features/fuel';
import { format, formatEconomy } from '@/features/units';

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
  Tappable,
  Title,
} from '../components/primitives';
import { BarReading, Gauge } from '../components/Gauge';
import { Chart, type Series } from '../components/Chart';
import { radius, space, tabular, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type View_ = 'dashboard' | 'readings' | 'graph';

const SERIES_COLORS = ['#FFB020', '#55A8FF', '#3DD68C', '#FF4D3D', '#B98CFF', '#FF8FB1'];

export function LiveScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const { width } = useWindowDimensions();

  const status = useConnection((s) => s.status);
  const readings = useLive((s) => s.readings);
  const history = useLive((s) => s.history);
  const startPolling = useLive((s) => s.startPolling);
  const stopPolling = useLive((s) => s.stopPolling);

  const dashboard = useVehicles((s) => s.dashboard);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);
  const units = useSettings((s) => s.units);
  const keepAwake = useSettings((s) => s.keepAwake);

  const [view, setView] = useState<View_>('dashboard');
  const connected = status.state === 'ready' && !status.vehicleSilent;

  // Readings are useless if the screen sleeps while you watch the engine.
  useKeepAwake(keepAwake && connected ? 'obd-live' : undefined);

  const vehicleType = activeVehicle?.type ?? 'car';
  const supported = useMemo(
    () =>
      pidsForVehicle(vehicleType).filter((d) => session.supportedPids.includes(d.pid)),
    [vehicleType, status.state],
  );

  // What to poll depends on which view is open: the dashboard only needs its
  // own slots, so it stays fast.
  const pollPids = useMemo(() => {
    if (view === 'dashboard') {
      const slotted = dashboard.map((s) => s.pid).filter((pid) => session.supportedPids.includes(pid));
      return slotted.length > 0 ? slotted : supported.slice(0, 6).map((d) => d.pid);
    }
    if (view === 'graph') {
      return supported.slice(0, 4).map((d) => d.pid);
    }
    return supported.map((d) => d.pid);
  }, [view, dashboard, supported]);

  useEffect(() => {
    if (!connected || pollPids.length === 0) return undefined;
    startPolling(pollPids);
    return () => stopPolling();
  }, [connected, pollPids, startPolling, stopPolling]);

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to see live data"
          body="Readings stream straight from the engine computer — revs, speed, temperatures, fuel trims and whatever else your vehicle reports."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.wide, gap: space.gap }}>
        <Row justify="space-between">
          <Title>Live data</Title>
          <Tappable onPress={() => navigation.navigate('Hud')}>
            <Label style={{ color: palette.amber, fontWeight: '600', fontSize: type.body }}>
              Head-up
            </Label>
          </Tappable>
        </Row>

        <Segments value={view} onChange={setView} />
      </View>

      <View style={{ marginTop: space.wide }}>
        {view === 'dashboard' ? (
          <DashboardView
            pids={pollPids}
            onEdit={() => navigation.navigate('ChooseReadings', { purpose: 'dashboard' })}
          />
        ) : null}

        {view === 'readings' ? <ReadingsView supportedPids={supported.map((d) => d.pid)} /> : null}

        {view === 'graph' ? (
          <GraphView pids={pollPids} width={width - space.gap * 2} />
        ) : null}
      </View>

      {view !== 'graph' ? <EconomyPanel /> : null}
    </Screen>
  );
}

function Segments({ value, onChange }: { value: View_; onChange: (v: View_) => void }) {
  const palette = usePalette();
  const items: { key: View_; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'readings', label: 'All readings' },
    { key: 'graph', label: 'Graph' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: palette.panel,
        borderRadius: radius.tile,
        padding: 3,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Tappable key={item.key} onPress={() => onChange(item.key)} style={{ flex: 1 }}>
            <View
              style={{
                paddingVertical: 9,
                borderRadius: radius.inset,
                backgroundColor: active ? palette.panelHigh : 'transparent',
                alignItems: 'center',
              }}
            >
              <Label
                style={{
                  color: active ? palette.text : palette.muted,
                  fontWeight: active ? '600' : '500',
                  fontSize: type.body,
                }}
              >
                {item.label}
              </Label>
            </View>
          </Tappable>
        );
      })}
    </View>
  );
}

function DashboardView({ pids, onEdit }: { pids: number[]; onEdit: () => void }) {
  const readings = useLive((s) => s.readings);
  const units = useSettings((s) => s.units);
  const { width } = useWindowDimensions();

  // Two columns on a phone, three once there is room.
  const columns = width > 520 ? 3 : 2;
  const gaugeSize = Math.min(168, (width - space.gap * 2 - space.gap * (columns - 1)) / columns);

  if (pids.length === 0) {
    return (
      <EmptyState
        title="No readings on the dashboard yet"
        body="Choose which readings to show. Only the ones your vehicle actually reports are offered."
        actionLabel="Choose readings"
        onAction={onEdit}
      />
    );
  }

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap, justifyContent: 'space-between' }}>
        {pids.map((pid) => {
          const definition = pidDefinition(pid);
          if (!definition) return null;
          const raw = readings[pid]?.value ?? null;
          const shown = raw === null ? null : format(raw, definition.unit, units, definition.precision);
          return (
            <Gauge
              key={pid}
              value={shown ? shown.value : null}
              min={definition.min}
              max={definition.max}
              unit={shown ? shown.unit : definition.unit}
              name={definition.short}
              pid={pid}
              size={gaugeSize}
              precision={definition.precision}
            />
          );
        })}
      </View>
      <Button label="Choose readings" onPress={onEdit} tone="quiet" />
    </View>
  );
}

function ReadingsView({ supportedPids }: { supportedPids: number[] }) {
  const palette = usePalette();
  const readings = useLive((s) => s.readings);
  const units = useSettings((s) => s.units);

  if (supportedPids.length === 0) {
    return (
      <Panel>
        <Body color={palette.muted}>
          This vehicle did not report any readable parameters. That usually means the ignition is
          off, or the engine computer is still waking up.
        </Body>
      </Panel>
    );
  }

  // Grouped by what the reading is about, which is more useful than PID order.
  const byCategory = new Map<string, number[]>();
  for (const pid of supportedPids) {
    const definition = pidDefinition(pid);
    if (!definition) continue;
    const list = byCategory.get(definition.category) ?? [];
    list.push(pid);
    byCategory.set(definition.category, list);
  }

  return (
    <View style={{ gap: space.wide }}>
      {[...byCategory.entries()].map(([category, pids]) => (
        <View key={category} style={{ gap: space.base }}>
          <Label style={{ color: palette.muted }}>{categoryName(category)}</Label>
          <Panel style={{ paddingVertical: space.small }}>
            {pids.map((pid, index) => {
              const definition = pidDefinition(pid);
              if (!definition) return null;
              const raw = readings[pid]?.value ?? null;
              const shown = raw === null ? null : format(raw, definition.unit, units, definition.precision);
              return (
                <View key={pid}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" style={{ paddingVertical: space.base }}>
                    <Body style={{ flex: 1 }} numberOfLines={1}>
                      {definition.name}
                    </Body>
                    <Reading
                      value={shown ? shown.text : '—'}
                      unit={shown ? shown.unit : definition.unit}
                      size={type.lead}
                      align="right"
                    />
                  </Row>
                </View>
              );
            })}
          </Panel>
        </View>
      ))}
    </View>
  );
}

function GraphView({ pids, width }: { pids: number[]; width: number }) {
  const history = useLive((s) => s.history);
  const [highlight, setHighlight] = useState<number | null>(null);
  const palette = usePalette();

  const series: Series[] = pids.flatMap((pid, index) => {
    const definition = pidDefinition(pid);
    const points = history[pid] ?? [];
    if (!definition || points.length < 2) return [];
    return [
      {
        key: pid,
        name: definition.short,
        unit: definition.unit,
        color: SERIES_COLORS[index % SERIES_COLORS.length] ?? palette.amber,
        points,
        precision: definition.precision,
      },
    ];
  });

  return (
    <View style={{ gap: space.gap }}>
      <Panel>
        <Chart series={series} width={width - space.gap * 2} height={220} highlightKey={highlight ?? undefined} />
      </Panel>

      <Row gap={space.small} style={{ flexWrap: 'wrap' }}>
        {series.map((s) => (
          <Tappable key={s.key} onPress={() => setHighlight(Number(s.key))}>
            <View
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: radius.chip,
                borderWidth: 1,
                borderColor: highlight === s.key ? s.color : palette.line,
                backgroundColor: palette.panel,
              }}
            >
              <Label style={[tabular, { color: highlight === s.key ? s.color : palette.muted }]}>
                {s.name}
              </Label>
            </View>
          </Tappable>
        ))}
      </Row>
      <Label>Tap a reading to put the axis on it. The window holds the last few minutes.</Label>
    </View>
  );
}

/** Instant fuel consumption, with the source of the figure stated. */
function EconomyPanel() {
  const palette = usePalette();
  const readings = useLive((s) => s.readings);
  const units = useSettings((s) => s.units);
  const calibration = useSettings((s) => s.fuelCalibration);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);

  const speed = readings[0x0d]?.value ?? null;
  const rate = fuelRate({
    fuelRateLh: readings[0x5e]?.value ?? null,
    mafGs: readings[0x10]?.value ?? null,
    mapKpa: readings[0x0b]?.value ?? null,
    intakeTempC: readings[0x0f]?.value ?? null,
    rpm: readings[0x0c]?.value ?? null,
    engineCc: activeVehicle?.engineCc ?? null,
    fuelType: activeVehicle?.fuelType ?? null,
    calibration: activeVehicle ? calibration[activeVehicle.id] : undefined,
  });

  if (!rate) return null;

  const instant = speed !== null ? litresPer100Km(rate.litresPerHour, speed) : null;
  const economy = formatEconomy(instant, units);

  const sourceNote =
    rate.source === 'reported'
      ? 'Reported by the vehicle.'
      : rate.source === 'maf'
        ? 'Worked out from measured air flow — an estimate. A fill-up entry will correct it.'
        : 'Estimated from manifold pressure and engine size, with no air flow sensor to measure against. Rough until calibrated with a fill-up.';

  return (
    <Panel style={{ marginTop: space.wide, gap: space.small }}>
      <Row justify="space-between" align="flex-end">
        <View>
          <Label>Consumption now</Label>
          <Reading value={economy.text} unit={economy.unit} size={type.heading} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>Flow</Label>
          <Reading value={rate.litresPerHour.toFixed(1)} unit="L/h" size={type.title} align="right" />
        </View>
      </Row>
      <Label style={{ color: palette.muted }}>{sourceNote}</Label>
    </Panel>
  );
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
