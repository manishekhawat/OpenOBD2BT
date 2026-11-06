/**
 * One trip.
 *
 * The route is drawn from its own recorded points — no map tiles are fetched,
 * so nothing about where you drove leaves the phone.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';

import { deleteTrip, getTrip, getTripPoints, type Trip, type TripPoint } from '@/data/repo/trips';
import { exportTripCsv, exportTripGpx } from '@/features/exports';
import { format, formatDuration, formatEconomy, formatTimestamp } from '@/features/units';
import { useSettings } from '@/state/settings';

import {
  Body,
  Button,
  Divider,
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
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TripDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'TripDetail'>>();
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const units = useSettings((s) => s.units);
  const { width } = useWindowDimensions();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTrip(route.params.tripId).then(setTrip).catch(() => undefined);
    getTripPoints(route.params.tripId).then(setPoints).catch(() => undefined);
  }, [route.params.tripId]);

  const series: Series[] = useMemo(() => {
    const speed = points
      .filter((p) => p.speedKmh != null)
      .map((p) => ({ at: p.tMs, value: p.speedKmh as number }));
    const rpm = points
      .filter((p) => p.rpm != null)
      .map((p) => ({ at: p.tMs, value: p.rpm as number }));

    const out: Series[] = [];
    if (speed.length > 1) {
      out.push({ key: 'speed', name: 'Speed', unit: 'km/h', color: palette.amber, points: speed, precision: 0 });
    }
    if (rpm.length > 1) {
      out.push({ key: 'rpm', name: 'Revs', unit: 'rpm', color: palette.blue, points: rpm, precision: 0 });
    }
    return out;
  }, [points, palette]);

  if (!trip) {
    return (
      <Screen>
        <View style={{ paddingTop: space.page }}>
          <Title>Loading…</Title>
        </View>
      </Screen>
    );
  }

  const economy =
    trip.fuelUsedL && trip.distanceKm > 0
      ? formatEconomy((trip.fuelUsedL / trip.distanceKm) * 100, units)
      : null;

  const distance = format(trip.distanceKm, 'km', units, 1);

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title style={{ fontSize: type.heading }}>{formatTimestamp(trip.startedAt)}</Title>
        <Label>{`${points.length} samples recorded`}</Label>
      </View>

      <Panel style={{ marginTop: space.wide }}>
        <Row justify="space-between">
          <View>
            <Label>Distance</Label>
            <Reading value={distance.text} unit={distance.unit} size={type.heading} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Duration</Label>
            <Title style={{ fontSize: type.title, marginTop: 4 }}>{formatDuration(trip.durationS)}</Title>
          </View>
        </Row>
        <Divider />
        <Field
          label="Average speed"
          value={`${format(trip.avgSpeedKmh, 'km/h', units, 0).text} ${units === 'metric' ? 'km/h' : 'mph'}`}
        />
        <Divider />
        <Field
          label="Top speed"
          value={`${format(trip.maxSpeedKmh, 'km/h', units, 0).text} ${units === 'metric' ? 'km/h' : 'mph'}`}
        />
        {trip.fuelUsedL ? (
          <>
            <Divider />
            <Field label="Fuel used" value={`${trip.fuelUsedL.toFixed(2)} L`} />
            {economy ? (
              <>
                <Divider />
                <Field label="Economy" value={`${economy.text} ${economy.unit}`} />
              </>
            ) : null}
          </>
        ) : null}
      </Panel>

      <RouteMap points={points} width={width - space.gap * 2} />

      {series.length > 0 ? (
        <>
          <SectionHeader>Speed and revs</SectionHeader>
          <Panel>
            <Chart series={series} width={width - space.gap * 4} height={200} />
          </Panel>
        </>
      ) : null}

      <View style={{ gap: space.small, marginTop: space.wide }}>
        <Button
          label="Export as CSV"
          tone="neutral"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await exportTripCsv(trip, points);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          label="Export route as GPX"
          tone="neutral"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await exportTripGpx(trip, points);
            } catch (error) {
              Alert.alert(
                'No route to export',
                error instanceof Error ? error.message : 'This trip has no satellite positions.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          label="Delete this trip"
          tone="quiet"
          onPress={() =>
            Alert.alert('Delete this trip?', 'The recording is removed from this phone. This cannot be undone.', [
              { text: 'Keep it', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteTrip(trip.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}

/** The route, drawn from recorded positions alone. */
function RouteMap({ points, width }: { points: TripPoint[]; width: number }) {
  const palette = usePalette();
  const height = 200;

  const path = useMemo(() => {
    const located = points.filter(
      (p): p is TripPoint & { lat: number; lon: number } => p.lat != null && p.lon != null,
    );
    if (located.length < 2) return null;

    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    for (const p of located) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }

    // Keep the aspect ratio honest: a degree of longitude shortens with latitude.
    const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLon = Math.max((maxLon - minLon) * Math.cos(midLat), 1e-6);
    const scale = Math.min((width - 24) / spanLon, (height - 24) / spanLat);

    const project = (p: { lat: number; lon: number }) => ({
      x: width / 2 + ((p.lon - (minLon + maxLon) / 2) * Math.cos(midLat)) * scale,
      y: height / 2 - (p.lat - (minLat + maxLat) / 2) * scale,
    });

    const d = located
      .map((p, index) => {
        const { x, y } = project(p);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    const first = located[0];
    const last = located[located.length - 1];
    return first && last ? { d, start: project(first), end: project(last) } : null;
  }, [points, width]);

  if (!path) {
    return (
      <Panel style={{ marginTop: space.wide }}>
        <Body color={palette.muted}>
          No satellite positions were recorded for this trip, so there is no route to draw. Speed and
          revs were still recorded.
        </Body>
      </Panel>
    );
  }

  return (
    <View style={{ marginTop: space.wide }}>
      <SectionHeader>Route</SectionHeader>
      <View
        style={{
          backgroundColor: palette.panel,
          borderRadius: radius.panel,
          borderWidth: 1,
          borderColor: palette.line,
          overflow: 'hidden',
        }}
      >
        <Svg width={width} height={height}>
          <Path d={path.d} stroke={palette.amber} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={path.start.x} cy={path.start.y} r={5} fill={palette.green} />
          <Circle cx={path.end.x} cy={path.end.y} r={5} fill={palette.red} />
        </Svg>
      </View>
      <Label style={{ marginTop: space.small }}>
        Drawn from the recorded points only — no map was downloaded. Green is the start, red the end.
      </Label>
    </View>
  );
}
