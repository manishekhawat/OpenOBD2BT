/**
 * Vehicle profile.
 *
 * Only the name is required. Every other field says what it unlocks, so it is
 * clear why it is worth filling in rather than feeling like a form to complete.
 */

import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { newVehicleId, useVehicles } from '@/state/vehicles';
import type { VehicleType } from '@/obd/pids';

import {
  Button,
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

const TYPES: { key: VehicleType; label: string }[] = [
  { key: 'car', label: 'Car' },
  { key: 'motorcycle', label: 'Motorcycle' },
  { key: 'scooter', label: 'Scooter' },
  { key: 'truck', label: 'Truck' },
];

export function VehicleEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'VehicleEdit'>>();
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const vehicles = useVehicles((s) => s.vehicles);
  const upsert = useVehicles((s) => s.upsert);
  const remove = useVehicles((s) => s.remove);

  const existing = route.params?.id ? vehicles.find((v) => v.id === route.params.id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<VehicleType>(existing?.type ?? 'car');
  const [make, setMake] = useState(existing?.make ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [year, setYear] = useState(existing?.year ? String(existing.year) : '');
  const [engineCc, setEngineCc] = useState(existing?.engineCc ? String(existing.engineCc) : '');
  const [fuelType, setFuelType] = useState(existing?.fuelType ?? '');
  const [tank, setTank] = useState(existing?.tankLitres ? String(existing.tankLitres) : '');
  const [weight, setWeight] = useState(existing?.kerbWeightKg ? String(existing.kerbWeightKg) : '');

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      Alert.alert('Name needed', 'Give the vehicle a name so you can tell profiles apart — "My car" is fine.');
      return;
    }

    await upsert({
      id: existing?.id ?? newVehicleId(),
      name: trimmed,
      type: kind,
      make: make.trim() || null,
      model: model.trim() || null,
      year: Number(year) || null,
      engineCc: Number(engineCc) || null,
      fuelType: fuelType.trim() || null,
      tankLitres: Number(tank) || null,
      kerbWeightKg: Number(weight) || null,
      createdAt: existing?.createdAt ?? Date.now(),
    });

    navigation.goBack();
  };

  return (
    <Screen>
      <View style={{ paddingTop: space.gap }}>
        <Title>{existing ? 'Edit profile' : 'New vehicle'}</Title>
      </View>

      <Panel style={{ marginTop: space.gap, gap: space.gap }}>
        <TextField label="Name" hint="What you call it" value={name} onChange={setName} />

        <View style={{ gap: space.small }}>
          <Label style={{ color: palette.text, fontSize: type.body, fontWeight: '600' }}>Type</Label>
          <Label>Decides which readings are offered and the default dashboard.</Label>
          <Row gap={space.small} style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {TYPES.map((item) => {
              const active = item.key === kind;
              return (
                <Tappable key={item.key} onPress={() => setKind(item.key)}>
                  <View
                    style={{
                      paddingVertical: 9,
                      paddingHorizontal: 14,
                      borderRadius: radius.chip,
                      backgroundColor: active ? palette.amber : palette.panelHigh,
                      borderWidth: 1,
                      borderColor: active ? palette.amber : palette.line,
                    }}
                  >
                    <Label
                      style={{
                        color: active ? (palette.isDark ? palette.ground : '#FFFFFF') : palette.text,
                        fontWeight: '600',
                        fontSize: type.body,
                      }}
                    >
                      {item.label}
                    </Label>
                  </View>
                </Tappable>
              );
            })}
          </Row>
        </View>
      </Panel>

      <SectionHeader>Identity</SectionHeader>
      <Panel style={{ gap: space.gap }}>
        <TextField label="Make" hint="Optional" value={make} onChange={setMake} />
        <TextField label="Model" hint="Optional" value={model} onChange={setModel} />
        <TextField label="Year" hint="Optional" value={year} onChange={setYear} numeric />
      </Panel>

      <SectionHeader>Figures the app uses</SectionHeader>
      <Panel style={{ gap: space.gap }}>
        <TextField
          label="Engine size (cc)"
          hint="Lets consumption be worked out on vehicles with no air flow sensor"
          value={engineCc}
          onChange={setEngineCc}
          numeric
        />
        <TextField
          label="Fuel"
          hint="Petrol, diesel, LPG, CNG — sets the air-fuel ratio used for consumption"
          value={fuelType}
          onChange={setFuelType}
        />
        <TextField
          label="Tank (litres)"
          hint="Turns the fuel gauge percentage into litres remaining"
          value={tank}
          onChange={setTank}
          numeric
        />
        <TextField
          label="Kerb weight (kg)"
          hint="The biggest factor in the power estimate. Without it, power figures are not shown"
          value={weight}
          onChange={setWeight}
          numeric
        />
      </Panel>

      <Button label="Save" tone="primary" onPress={() => void save()} style={{ marginTop: space.section }} />

      {existing ? (
        <Button
          label="Delete this vehicle"
          tone="quiet"
          style={{ marginTop: space.small }}
          onPress={() =>
            Alert.alert(
              'Delete this profile?',
              'Its dashboard layout and alarms go too. Saved scans and trips are kept.',
              [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await remove(existing.id);
                    navigation.goBack();
                  },
                },
              ],
            )
          }
        />
      ) : null}
    </Screen>
  );
}

function TextField({
  label, hint, value, onChange, numeric,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: space.small }}>
      <Label style={{ color: palette.text, fontSize: type.body, fontWeight: '600' }}>{label}</Label>
      <Label>{hint}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'number-pad' : 'default'}
        placeholderTextColor={palette.muted}
        style={{
          backgroundColor: palette.panelHigh,
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: palette.line,
          color: palette.text,
          paddingHorizontal: space.base,
          paddingVertical: 12,
          fontSize: type.body,
          marginTop: 2,
        }}
      />
    </View>
  );
}
