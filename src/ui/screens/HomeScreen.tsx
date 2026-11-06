/**
 * Home.
 *
 * Opens straight to the state of the vehicle: a verdict strip, then the
 * evidence. No sign-in, no trial banner, nothing in front of it.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { lookupDtc } from '@/data/dtcCatalog';
import { session } from '@/obd/session';
import { pidDefinition } from '@/obd/pids';
import { overallDriveAdvice, rankedCodes, readinessSummary, useFaults } from '@/state/faults';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useVehicles, describeVehicle } from '@/state/vehicles';
import { useSettings } from '@/state/settings';
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
  Tappable,
  Title,
} from '../components/primitives';
import { StatusStrip, type Verdict } from '../components/StatusStrip';
import { BarReading } from '../components/Gauge';
import { FaultRow } from '../components/FaultRow';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Readings worth showing at a glance the moment a vehicle is connected. */
const GLANCE_PIDS = [0x0c, 0x0d, 0x05, 0x42];

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const status = useConnection((s) => s.status);
  const probeStep = useConnection((s) => s.probeStep);
  const connecting = useConnection((s) => s.connecting);
  const disconnect = useConnection((s) => s.disconnect);

  const { result, scanning, scan } = useFaults();
  const readings = useLive((s) => s.readings);
  const startPolling = useLive((s) => s.startPolling);
  const stopPolling = useLive((s) => s.stopPolling);

  const vehicles = useVehicles((s) => s.vehicles);
  const activeId = useVehicles((s) => s.activeId);
  const units = useSettings((s) => s.units);

  const [refreshing, setRefreshing] = useState(false);

  const connected = status.state === 'ready';
  const activeVehicle = vehicles.find((v) => v.id === activeId) ?? null;

  // Poll a small set of readings while this screen is open and connected.
  useEffect(() => {
    if (!connected || status.vehicleSilent) return undefined;
    const available = GLANCE_PIDS.filter((pid) => session.supportedPids.includes(pid));
    if (available.length === 0) return undefined;
    startPolling(available);
    return () => stopPolling();
  }, [connected, status.vehicleSilent, startPolling, stopPolling]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (connected) await session.refreshVoltage();
    setRefreshing(false);
  }, [connected]);

  const codes = result ? rankedCodes(result) : [];
  const verdict = buildVerdict({
    state: status.state,
    silent: status.vehicleSilent,
    message: status.message,
    probeStep,
    connecting,
    hasResult: result !== null,
    codes,
    voltage: status.voltage,
  });

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.muted} />}>
      <StatusStrip verdict={verdict} />

      <View style={{ gap: space.base, marginTop: space.wide }}>
        {connected ? (
          <Row gap={space.base}>
            <Button
              label={scanning ? 'Scanning' : 'Scan for faults'}
              onPress={() => void scan()}
              tone="primary"
              busy={scanning}
              style={{ flex: 1 }}
            />
            <Button label="Disconnect" onPress={() => void disconnect()} tone="neutral" />
          </Row>
        ) : (
          <Button
            label={connecting ? 'Connecting' : 'Connect adapter'}
            onPress={() => navigation.navigate('Connect')}
            tone="primary"
            busy={connecting}
          />
        )}
      </View>

      {connected && !status.vehicleSilent ? (
        <>
          <SectionHeader>At a glance</SectionHeader>
          <Panel style={{ gap: space.gap }}>
            {GLANCE_PIDS.map((pid) => {
              const definition = pidDefinition(pid);
              if (!definition || !session.supportedPids.includes(pid)) return null;
              const value = readings[pid]?.value ?? null;
              const shown = value === null ? null : format(value, definition.unit, units, definition.precision);
              return (
                <BarReading
                  key={pid}
                  name={definition.name}
                  value={shown ? shown.value : null}
                  min={definition.min}
                  max={definition.max}
                  unit={shown ? shown.unit : definition.unit}
                  pid={pid}
                  precision={definition.precision}
                />
              );
            })}
          </Panel>
        </>
      ) : null}

      {result ? (
        <>
          <SectionHeader>
            {codes.length === 0 ? 'Nothing stored' : codes.length === 1 ? '1 fault' : `${codes.length} faults`}
          </SectionHeader>

          {codes.length === 0 ? (
            <Panel>
              <Body color={palette.muted}>
                The engine computer reported no stored, pending or permanent trouble codes.
              </Body>
            </Panel>
          ) : (
            <View style={{ gap: space.small }}>
              {codes.slice(0, 4).map((dtc) => {
                const info = lookupDtc(dtc.code);
                return (
                  <FaultRow
                    key={`${dtc.code}-${dtc.origin}`}
                    code={dtc.code}
                    title={info.title}
                    action={info.action}
                    origin={dtc.origin}
                    onPress={() => navigation.navigate('FaultDetail', { code: dtc.code })}
                  />
                );
              })}
              {codes.length > 4 ? (
                <Tappable onPress={() => navigation.navigate('Tabs')}>
                  <Label style={{ paddingVertical: space.base, color: palette.amber, fontWeight: '600' }}>
                    {`See all ${codes.length} faults`}
                  </Label>
                </Tappable>
              ) : null}
            </View>
          )}

          {result.readiness ? (
            <Tappable onPress={() => navigation.navigate('Readiness')} style={{ marginTop: space.base }}>
              <Panel>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Title style={{ fontSize: type.lead }}>Emission readiness</Title>
                    <Label style={{ marginTop: 3 }}>{readinessSummary(result.readiness) ?? 'Not reported'}</Label>
                  </View>
                  <Label style={{ color: result.readiness.readyForTest ? palette.green : palette.amber, fontSize: type.body, fontWeight: '600' }}>
                    {result.readiness.readyForTest ? 'Ready' : 'Not ready'}
                  </Label>
                </Row>
              </Panel>
            </Tappable>
          ) : null}
        </>
      ) : null}

      <SectionHeader>Vehicle</SectionHeader>
      {activeVehicle ? (
        <Tappable onPress={() => navigation.navigate('Vehicles')}>
          <Panel>
            <Title style={{ fontSize: type.lead }}>{activeVehicle.name}</Title>
            <Label style={{ marginTop: 3 }}>{describeVehicle(activeVehicle)}</Label>
            <Divider inset={0} />
            {session.vehicleInfo?.vin ? <Field label="VIN" value={session.vehicleInfo.vin} /> : null}
            {status.protocol ? <Field label="Protocol" value={status.protocol} /> : null}
            {status.adapterIdentity ? <Field label="Adapter" value={status.adapterIdentity} /> : null}
          </Panel>
        </Tappable>
      ) : (
        <EmptyState
          title="No vehicle profile yet"
          body="A profile is optional — readings and fault codes work without one. Add it to get fuel figures in litres, power estimates and a saved dashboard."
          actionLabel="Add a vehicle"
          onAction={() => navigation.navigate('VehicleEdit', {})}
        />
      )}

      {connected ? (
        <View style={{ gap: space.small, marginTop: space.wide }}>
          <Button label="Vehicle information" onPress={() => navigation.navigate('VehicleInfo')} tone="quiet" />
          <Button label="Scan history" onPress={() => navigation.navigate('History')} tone="quiet" />
        </View>
      ) : null}
    </Screen>
  );
}

function buildVerdict(input: {
  state: string;
  silent: boolean;
  message: string | null;
  probeStep: string | null;
  connecting: boolean;
  hasResult: boolean;
  codes: ReturnType<typeof rankedCodes>;
  voltage: number | null;
}): Verdict {
  if (input.connecting || input.state === 'connecting' || input.state === 'initialising') {
    return { kind: 'connecting', detail: input.probeStep ?? 'Opening the link to the adapter.' };
  }
  if (input.state !== 'ready') return { kind: 'disconnected' };
  if (input.silent) {
    return { kind: 'silent', detail: input.message ?? 'The adapter is connected but the vehicle is not answering.' };
  }
  if (!input.hasResult) return { kind: 'unscanned' };
  if (input.codes.length === 0) return { kind: 'clear', voltage: input.voltage };

  const worst = input.codes[0];
  return {
    kind: 'faults',
    count: input.codes.length,
    drive: overallDriveAdvice(input.codes),
    worst: worst ? lookupDtc(worst.code).title.toLowerCase() : 'unknown',
  };
}
