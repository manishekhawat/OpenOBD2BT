/**
 * Fuel.
 *
 * Fill-ups entered at the pump. Each tank-to-full entry with a distance makes
 * the app's own consumption estimate more accurate, so the figures improve the
 * more you log.
 */

import { useCallback, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  addFuelLog,
  averageCostPerKm,
  averageEconomy,
  deleteFuelLog,
  listFuelLogs,
  type FuelLog,
} from '@/data/repo/fuel';
import { formatEconomy, formatTimestamp } from '@/features/units';
import { useSettings } from '@/state/settings';
import { useVehicles } from '@/state/vehicles';

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
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FuelScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const units = useSettings((s) => s.units);

  const activeId = useVehicles((s) => s.activeId);
  const activeVehicle = useVehicles((s) => s.vehicles.find((v) => v.id === s.activeId) ?? null);

  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    listFuelLogs(activeId).then(setLogs).catch(() => undefined);
  }, [activeId]);

  useFocusEffect(reload);

  if (!activeId) {
    return (
      <Screen>
        <EmptyState
          title="Fuel logs belong to a vehicle"
          body="Add a vehicle profile so fill-ups can be kept per vehicle and used to correct its consumption estimate."
          actionLabel="Add a vehicle"
          onAction={() => navigation.navigate('VehicleEdit', {})}
        />
      </Screen>
    );
  }

  const economy = averageEconomy(logs);
  const costPerKm = averageCostPerKm(logs);
  const shown = formatEconomy(economy, units);

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Fuel</Title>
        <Label>{activeVehicle?.name ?? 'This vehicle'}</Label>
      </View>

      <Panel style={{ marginTop: space.gap }}>
        <Row justify="space-between">
          <View>
            <Label>Average economy</Label>
            <Reading value={shown.text} unit={shown.unit} size={type.heading} />
          </View>
          {costPerKm !== null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Label>Cost per km</Label>
              <Reading value={costPerKm.toFixed(2)} size={type.title} align="right" />
            </View>
          ) : null}
        </Row>
        <Label style={{ marginTop: space.small }}>
          {economy === null
            ? 'Log two fill-ups to full, with the distance between them, to get a real figure.'
            : `From ${logs.filter((l) => l.filledToFull && l.distanceKm).length} fill-ups to full.`}
        </Label>
      </Panel>

      {adding ? (
        <FuelEditor
          vehicleId={activeId}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button
          label="Add a fill-up"
          tone="primary"
          onPress={() => setAdding(true)}
          style={{ marginTop: space.gap }}
        />
      )}

      {logs.length === 0 ? (
        <EmptyState
          title="No fill-ups yet"
          body="Enter what the pump delivered and the distance since the previous fill-up. Only tank-to-full entries can anchor the calculation, since a partial fill leaves an unknown amount behind."
        />
      ) : (
        <>
          <SectionHeader>Fill-ups</SectionHeader>
          <Panel style={{ padding: 0 }}>
            {logs.map((log, index) => (
              <View key={log.id}>
                {index > 0 ? <Divider inset={space.gap} /> : null}
                <Row justify="space-between" style={{ padding: space.gap }} gap={space.base}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Title style={{ fontSize: type.body }}>{formatTimestamp(log.at)}</Title>
                    <Label numberOfLines={1}>
                      {[
                        `${log.litres.toFixed(2)} L`,
                        log.distanceKm ? `${log.distanceKm.toFixed(0)} km` : null,
                        log.cost ? `cost ${log.cost.toFixed(2)}` : null,
                        log.filledToFull ? 'to full' : 'partial',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Label>
                  </View>
                  <Tappable
                    onPress={() =>
                      Alert.alert('Delete this fill-up?', 'It will no longer count towards the average.', [
                        { text: 'Keep it', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            await deleteFuelLog(log.id);
                            reload();
                          },
                        },
                      ])
                    }
                  >
                    <Label style={{ color: palette.muted }}>Delete</Label>
                  </Tappable>
                </Row>
              </View>
            ))}
          </Panel>
        </>
      )}

      <Panel tone="high" style={{ marginTop: space.wide }}>
        <Body color={palette.muted}>
          Fill to the same point each time — the first click of the pump is the usual convention.
          Consistency matters more than precision, because the calculation depends on the tank being
          at a known level at both ends.
        </Body>
      </Panel>
    </Screen>
  );
}

function FuelEditor({
  vehicleId, onDone, onCancel,
}: {
  vehicleId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const palette = usePalette();
  const [litres, setLitres] = useState('');
  const [distance, setDistance] = useState('');
  const [cost, setCost] = useState('');

  const style = {
    backgroundColor: palette.panelHigh,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: palette.line,
    color: palette.text,
    paddingHorizontal: space.base,
    paddingVertical: 12,
    fontSize: type.body,
  };

  return (
    <Panel style={{ marginTop: space.gap, gap: space.gap }}>
      <Title style={{ fontSize: type.lead }}>New fill-up</Title>

      <View style={{ gap: space.small }}>
        <Label>Litres delivered</Label>
        <TextInput
          value={litres}
          onChangeText={setLitres}
          keyboardType="numbers-and-punctuation"
          placeholder="32.4"
          placeholderTextColor={palette.muted}
          style={style}
        />
      </View>

      <View style={{ gap: space.small }}>
        <Label>Distance since the previous fill-up (km)</Label>
        <TextInput
          value={distance}
          onChangeText={setDistance}
          keyboardType="numbers-and-punctuation"
          placeholder="412"
          placeholderTextColor={palette.muted}
          style={style}
        />
      </View>

      <View style={{ gap: space.small }}>
        <Label>Cost (optional)</Label>
        <TextInput
          value={cost}
          onChangeText={setCost}
          keyboardType="numbers-and-punctuation"
          placeholderTextColor={palette.muted}
          style={style}
        />
      </View>

      <Row gap={space.small}>
        <Button
          label="Save"
          tone="primary"
          style={{ flex: 1 }}
          onPress={async () => {
            const parsedLitres = Number(litres);
            if (!Number.isFinite(parsedLitres) || parsedLitres <= 0) {
              Alert.alert('Litres needed', 'Enter how much fuel the pump delivered.');
              return;
            }
            await addFuelLog({
              vehicleId,
              at: Date.now(),
              litres: parsedLitres,
              distanceKm: Number(distance) || null,
              cost: Number(cost) || null,
              filledToFull: true,
            });
            onDone();
          }}
        />
        <Button label="Cancel" tone="quiet" onPress={onCancel} style={{ flex: 1 }} />
      </Row>
    </Panel>
  );
}
