/**
 * Vehicles.
 *
 * Profiles are optional throughout the app, so this screen says what one buys
 * you rather than demanding one before anything works.
 */

import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useVehicles, describeVehicle } from '@/state/vehicles';

import {
  Body,
  Button,
  Chip,
  Divider,
  EmptyState,
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

export function VehiclesScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const vehicles = useVehicles((s) => s.vehicles);
  const activeId = useVehicles((s) => s.activeId);
  const setActive = useVehicles((s) => s.setActive);

  if (vehicles.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No vehicles yet"
          body="Readings and fault codes work without a profile. Adding one lets the app show fuel in litres rather than a percentage, estimate power from weight, and remember a dashboard layout per vehicle."
          actionLabel="Add a vehicle"
          onAction={() => navigation.navigate('VehicleEdit', {})}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap }}>
        <Title>Vehicles</Title>
      </View>

      <Panel style={{ marginTop: space.gap, padding: 0 }}>
        {vehicles.map((vehicle, index) => {
          const active = vehicle.id === activeId;
          return (
            <View key={vehicle.id}>
              {index > 0 ? <Divider inset={space.gap} /> : null}
              <Tappable
                onPress={() => void setActive(vehicle.id)}
                accessibilityLabel={`Select ${vehicle.name}`}
              >
                <Row justify="space-between" style={{ padding: space.gap }} gap={space.base}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Row gap={space.small}>
                      <Title style={{ fontSize: type.body }} numberOfLines={1}>
                        {vehicle.name}
                      </Title>
                      {active ? <Chip label="Selected" color={palette.amber} /> : null}
                    </Row>
                    <Label numberOfLines={1}>{describeVehicle(vehicle)}</Label>
                    <Label numberOfLines={1}>
                      {[
                        vehicle.engineCc ? `${vehicle.engineCc} cc` : null,
                        vehicle.fuelType,
                        vehicle.tankLitres ? `${vehicle.tankLitres} L tank` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No details yet'}
                    </Label>
                  </View>
                  <Tappable
                    onPress={() => navigation.navigate('VehicleEdit', { id: vehicle.id })}
                    accessibilityLabel={`Edit ${vehicle.name}`}
                  >
                    <Label style={{ color: palette.amber, fontWeight: '600', fontSize: type.body }}>
                      Edit
                    </Label>
                  </Tappable>
                </Row>
              </Tappable>
            </View>
          );
        })}
      </Panel>

      <Button
        label="Add a vehicle"
        tone="primary"
        onPress={() => navigation.navigate('VehicleEdit', {})}
        style={{ marginTop: space.wide }}
      />

      <SectionHeader>What a profile changes</SectionHeader>
      <Panel>
        <Body color={palette.muted}>
          Tank size turns the fuel gauge percentage into litres. Kerb weight makes the power estimate
          meaningful — it is the single biggest factor in it. Engine size lets consumption be worked
          out on vehicles with no air flow sensor. Each vehicle keeps its own dashboard layout and
          alarms.
        </Body>
      </Panel>
    </Screen>
  );
}
