/**
 * Trips.
 *
 * Recording in progress at the top, finished trips below. Distance comes from
 * the vehicle's speed signal, so it keeps counting where satellites drop out.
 */

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { listTrips, type Trip } from '@/data/repo/trips';
import { useConnection } from '@/state/connection';
import { useSettings } from '@/state/settings';
import { useTripRecorder } from '@/features/tripRecorder';
import { format, formatDuration, formatEconomy, formatTimestamp } from '@/features/units';

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
  Tappable,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TripsScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const units = useSettings((s) => s.units);

  const status = useConnection((s) => s.status);
  const recorder = useTripRecorder();
  const [trips, setTrips] = useState<Trip[]>([]);

  const reload = useCallback(() => {
    listTrips().then(setTrips).catch(() => undefined);
  }, []);

  useFocusEffect(reload);

  const connected = status.state === 'ready' && !status.vehicleSilent;

  return (
    <Screen>
      <View style={{ paddingTop: space.wide }}>
        <Title>Trips</Title>
      </View>

      {recorder.recording ? (
        <Panel style={{ marginTop: space.gap, borderColor: palette.amber, gap: space.gap }}>
          <Row justify="space-between">
            <View>
              <Label style={{ color: palette.amber }}>Recording</Label>
              <Reading
                value={format(recorder.distanceKm, 'km', units, 1).text}
                unit={units === 'metric' ? 'km' : 'mi'}
                size={type.heading}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>Elapsed</Label>
              <Title style={{ fontSize: type.lead, marginTop: 4 }}>
                {formatDuration(recorder.startedAt ? (Date.now() - recorder.startedAt) / 1000 : 0)}
              </Title>
            </View>
          </Row>

          <Row justify="space-between">
            <Label>{`${recorder.pointCount} samples`}</Label>
            <Label>
              {recorder.hasLocation ? 'Recording the route' : 'No location — speed and revs only'}
            </Label>
          </Row>

          <Button
            label="Stop recording"
            tone="danger"
            onPress={async () => {
              const id = await recorder.stop();
              reload();
              if (id) navigation.navigate('TripDetail', { tripId: id });
            }}
          />
        </Panel>
      ) : (
        <Panel style={{ marginTop: space.gap, gap: space.base }}>
          <Body color={palette.muted}>
            {connected
              ? 'Records speed, revs and fuel use from the vehicle, and the route from this phone. Everything stays on the phone — no map is downloaded.'
              : 'Connect to the vehicle to record a trip.'}
          </Body>
          <Button
            label={connected ? 'Start recording' : 'Connect adapter'}
            tone="primary"
            onPress={() => {
              if (connected) void recorder.start();
              else navigation.navigate('Connect');
            }}
          />
          {recorder.error ? <Label style={{ color: palette.red }}>{recorder.error}</Label> : null}
        </Panel>
      )}

      {trips.length === 0 ? (
        <EmptyState
          title="No trips recorded yet"
          body="A recorded trip gives you distance, average and top speed, fuel used, and a route you can export as GPX."
        />
      ) : (
        <>
          <SectionHeader>Recorded</SectionHeader>
          <Panel style={{ padding: 0 }}>
            {trips.map((trip, index) => {
              const economy =
                trip.fuelUsedL && trip.distanceKm > 0
                  ? formatEconomy((trip.fuelUsedL / trip.distanceKm) * 100, units)
                  : null;
              return (
                <View key={trip.id}>
                  {index > 0 ? <Divider inset={space.gap} /> : null}
                  <Tappable
                    onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
                    accessibilityLabel={`Trip on ${formatTimestamp(trip.startedAt)}`}
                  >
                    <Row justify="space-between" style={{ padding: space.gap }} gap={space.base}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Title style={{ fontSize: type.body }}>{formatTimestamp(trip.startedAt)}</Title>
                        <Label numberOfLines={1}>
                          {[
                            formatDuration(trip.durationS),
                            `top ${format(trip.maxSpeedKmh, 'km/h', units, 0).text} ${units === 'metric' ? 'km/h' : 'mph'}`,
                            economy ? `${economy.text} ${economy.unit}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Label>
                      </View>
                      <Reading
                        value={format(trip.distanceKm, 'km', units, 1).text}
                        unit={units === 'metric' ? 'km' : 'mi'}
                        size={type.title}
                        align="right"
                      />
                    </Row>
                  </Tappable>
                </View>
              );
            })}
          </Panel>
        </>
      )}
    </Screen>
  );
}
