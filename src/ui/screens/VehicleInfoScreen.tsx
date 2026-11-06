/**
 * Vehicle information.
 *
 * What the vehicle says about itself over Mode 09 — VIN, calibration
 * identifiers, ECU names — plus the protocol that was negotiated and the
 * adapter's own identity. Cars report most of this; motorcycles often none.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { session } from '@/obd/session';
import { looksLikeVin, vinCheckDigitValid, type VehicleInfo } from '@/obd/vehicleInfo';
import { pidDefinition } from '@/obd/pids';
import { useConnection } from '@/state/connection';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Field,
  Label,
  Panel,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function VehicleInfoScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);

  const [info, setInfo] = useState<VehicleInfo | null>(session.vehicleInfo);
  const [loading, setLoading] = useState(false);

  const connected = status.state === 'ready';

  const read = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      setInfo(await session.readVehicleInfo());
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    if (!info && connected) void read();
  }, [info, connected, read]);

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to read vehicle information"
          body="The VIN and calibration identifiers come from the engine computer."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  const vin = info?.vin ?? null;
  const vinVerified = vin && looksLikeVin(vin) ? vinCheckDigitValid(vin) : null;

  return (
    <Screen>
      <View style={{ paddingTop: space.gap }}>
        <Title>Vehicle information</Title>
      </View>

      <SectionHeader>Identity</SectionHeader>
      <Panel>
        <Field label="VIN" value={vin ?? 'Not reported'} />
        {vin && vinVerified === false ? (
          <Label style={{ color: palette.amber, marginTop: 4 }}>
            The VIN was read, but its check digit does not validate. Some European makers do not use
            the check digit, so this is not necessarily wrong.
          </Label>
        ) : null}
        <Divider />
        <Field label="ECU name" value={info?.ecuName ?? 'Not reported'} />
        {info?.calibrationIds.length ? (
          <>
            <Divider />
            {info.calibrationIds.map((id) => (
              <Field key={id} label="Calibration" value={id} />
            ))}
          </>
        ) : null}
      </Panel>

      <SectionHeader>Connection</SectionHeader>
      <Panel>
        <Field label="Adapter" value={status.adapterLabel ?? '—'} />
        <Divider />
        <Field label="Adapter firmware" value={status.adapterIdentity ?? 'Not reported'} />
        <Divider />
        <Field label="Protocol" value={status.protocol ?? 'Not determined'} />
        <Divider />
        <Field
          label="Battery voltage"
          value={status.voltage !== null ? `${status.voltage.toFixed(1)} V` : 'Not reported'}
        />
      </Panel>

      <SectionHeader>Capability</SectionHeader>
      <Panel>
        <Field label="Readable parameters" value={String(session.supportedPids.length)} />
        <Divider />
        <Field label="OBD standard" value={session.obdStandard ?? 'Not reported'} />
        <Divider />
        <Field label="Fuel type" value={session.fuelType ?? 'Not reported'} />
      </Panel>

      {session.supportedPids.length > 0 ? (
        <>
          <SectionHeader>What this vehicle reports</SectionHeader>
          <Panel style={{ gap: 6 }}>
            {session.supportedPids.map((pid) => {
              const definition = pidDefinition(pid);
              return (
                <Label key={pid} style={{ color: definition ? palette.text : palette.muted }}>
                  {definition
                    ? `${definition.name}`
                    : `PID ${pid.toString(16).toUpperCase().padStart(2, '0')} — supported, not decoded by this app`}
                </Label>
              );
            })}
          </Panel>
        </>
      ) : null}

      <Button
        label={loading ? 'Reading' : 'Read again'}
        onPress={() => void read()}
        tone="neutral"
        busy={loading}
        style={{ marginTop: space.wide }}
      />
    </Screen>
  );
}
