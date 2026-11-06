/**
 * Performance.
 *
 * Times acceleration runs from the vehicle's own speed signal. The power figure
 * is derived, not measured, and the screen says so — it depends entirely on the
 * kerb weight in the vehicle profile, so without one it is not shown at all.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';

import { session } from '@/obd/session';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useVehicles } from '@/state/vehicles';
import { useSettings } from '@/state/settings';
import {
  DEFAULT_DRAG_AREA,
  detectRun,
  estimatePower,
  smoothSpeed,
  STANDARD_RUNS,
  type RunResult,
  type SpeedSample,
} from '@/features/performance';
import { format } from '@/features/units';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Field,
  Label,
  Panel,
  Reading,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { Chart, type Series } from '../components/Chart';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Rider or driver weight added to kerb weight for the power estimate. */
const OCCUPANT_KG = 75;

export function PerformanceScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const units = useSettings((s) => s.units);

  const status = useConnection((s) => s.status);
  const startPolling = useLive((s) => s.startPolling);
  const stopPolling = useLive((s) => s.stopPolling);
  const history = useLive((s) => s.history);
  const vehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);

  const [armed, setArmed] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const seen = useRef(new Set<string>());

  const connected = status.state === 'ready' && !status.vehicleSilent;
  useKeepAwake(armed ? 'obd-performance' : undefined);

  useEffect(() => {
    if (!armed || !connected) return undefined;
    const pids = [0x0d, 0x0c].filter((pid) => session.supportedPids.includes(pid));
    if (pids.length === 0) return undefined;
    startPolling(pids);
    return () => stopPolling();
  }, [armed, connected, startPolling, stopPolling]);

  const samples: SpeedSample[] = useMemo(() => {
    const speed = history[0x0d] ?? [];
    const rpm = history[0x0c] ?? [];
    return speed.map((point) => {
      // Pair each speed sample with the revs recorded nearest to it in time.
      let nearest: number | null = null;
      let smallestGap = Number.POSITIVE_INFINITY;
      for (const r of rpm) {
        const gap = Math.abs(r.at - point.at);
        if (gap < smallestGap) {
          smallestGap = gap;
          nearest = r.value;
        }
      }
      return { at: point.at, speedKmh: point.value, rpm: smallestGap < 1500 ? nearest : null };
    });
  }, [history]);

  // Watch the live trace for completed runs.
  useEffect(() => {
    if (!armed || samples.length < 4) return;
    const smoothed = smoothSpeed(samples);
    for (const definition of STANDARD_RUNS) {
      const found = detectRun(smoothed, definition);
      if (!found) continue;
      const key = `${definition.kind}-${Math.round(found.at)}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      setResults((current) => [found, ...current].slice(0, 12));
    }
  }, [samples, armed]);

  const power = useMemo(() => {
    if (!vehicle?.kerbWeightKg || samples.length < 6) return null;
    return estimatePower({
      samples: smoothSpeed(samples),
      massKg: vehicle.kerbWeightKg + OCCUPANT_KG,
      dragAreaM2: DEFAULT_DRAG_AREA[vehicle.type] ?? 0.65,
    });
  }, [samples, vehicle]);

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to measure performance"
          body="Runs are timed from the vehicle's own speed signal, which is more consistent than satellite speed."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  const speedSeries: Series[] = (() => {
    const points = history[0x0d] ?? [];
    if (points.length < 2) return [];
    return [{ key: 'speed', name: 'Speed', unit: 'km/h', color: palette.amber, points, precision: 0 }];
  })();

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <Title>Performance</Title>
        <Body color={palette.muted}>
          Come to a complete stop, then accelerate. Runs are detected and timed automatically; a run
          where speed falls back below the start line is discarded rather than timed generously.
        </Body>

        <Panel tone="high">
          <Label style={{ lineHeight: 19 }}>
            Use a closed course. Never test on a public road — obey the speed limit and keep other
            people safe.
          </Label>
        </Panel>

        <Button
          label={armed ? 'Stop measuring' : 'Start measuring'}
          tone={armed ? 'danger' : 'primary'}
          onPress={() => setArmed((a) => !a)}
        />
      </View>

      {armed ? (
        <>
          <SectionHeader>Live</SectionHeader>
          <Panel>
            <Chart series={speedSeries} width={width - space.gap * 4} height={160} />
          </Panel>
        </>
      ) : null}

      {results.length > 0 ? (
        <>
          <SectionHeader>Runs</SectionHeader>
          <Panel style={{ paddingVertical: space.small }}>
            {results.map((result, index) => (
              <View key={`${result.definition.kind}-${result.at}`}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: space.base }}>
                  <View style={{ flex: 1 }}>
                    <Body>{result.definition.label}</Body>
                    {result.definition.distanceM ? (
                      <Label style={{ marginTop: 2 }}>
                        {`Trap speed ${format(result.endSpeedKmh, 'km/h', units, 0).text} ${units === 'metric' ? 'km/h' : 'mph'}`}
                      </Label>
                    ) : null}
                  </View>
                  <Reading value={result.seconds.toFixed(2)} unit="s" size={type.title} align="right" />
                </Row>
              </View>
            ))}
          </Panel>
        </>
      ) : armed ? (
        <Panel style={{ marginTop: space.wide }}>
          <Body color={palette.muted}>
            Waiting for a run. Come to a full stop first — timing starts the moment the vehicle moves.
          </Body>
        </Panel>
      ) : null}

      <SectionHeader>Power</SectionHeader>
      {!vehicle?.kerbWeightKg ? (
        <Panel>
          <Body color={palette.muted}>
            A power estimate needs the vehicle&apos;s kerb weight, which is the single biggest factor
            in it. Add it to the vehicle profile and the figure appears here.
          </Body>
          <Button
            label="Add kerb weight"
            tone="neutral"
            style={{ marginTop: space.base }}
            onPress={() => navigation.navigate('VehicleEdit', { id: vehicle?.id })}
          />
        </Panel>
      ) : power ? (
        <>
          <Panel>
            <Row justify="space-between">
              <View>
                <Label>Peak power</Label>
                <Reading value={power.peakHp.toFixed(0)} unit="hp" size={type.heading} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Label>At</Label>
                <Title style={{ fontSize: type.lead, marginTop: 4 }}>
                  {power.atRpm ? `${power.atRpm.toFixed(0)} rpm` : `${power.atSpeedKmh.toFixed(0)} km/h`}
                </Title>
              </View>
            </Row>
            <Divider />
            <Field label="Peak power" value={`${power.peakKw.toFixed(1)} kW`} />
            {power.peakTorqueNm ? (
              <>
                <Divider />
                <Field label="Torque at the wheels" value={`${power.peakTorqueNm.toFixed(0)} N·m`} />
              </>
            ) : null}
            <Divider />
            <Field label="Mass used" value={`${(vehicle.kerbWeightKg + OCCUPANT_KG).toFixed(0)} kg`} />
          </Panel>

          <Panel tone="high" style={{ marginTop: space.base }}>
            <Label style={{ lineHeight: 19 }}>
              Worked out from how fast the vehicle gains speed against its mass, air drag and rolling
              resistance. It reads below a manufacturer&apos;s crank figure because it measures power
              reaching the road, and the drag assumption dominates at higher speeds. Treat it as
              indicative, not a dyno reading.
            </Label>
          </Panel>
        </>
      ) : (
        <Panel>
          <Body color={palette.muted}>
            Record a full-throttle run and the estimate appears here.
          </Body>
        </Panel>
      )}
    </Screen>
  );
}
