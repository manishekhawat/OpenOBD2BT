/**
 * Navigation.
 *
 * Five tabs for the things people return to, with detail screens pushed on a
 * single root stack so they are reachable from anywhere rather than duplicated
 * per tab.
 *
 * There is no gate in front of any of this: the app opens straight onto the
 * home screen, and every screen is reachable immediately.
 */

import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

import { usePalette, type Palette } from './theme';

import { HomeScreen } from './screens/HomeScreen';
import { LiveScreen } from './screens/LiveScreen';
import { FaultsScreen } from './screens/FaultsScreen';
import { TripsScreen } from './screens/TripsScreen';
import { MoreScreen } from './screens/MoreScreen';

import { ConnectScreen } from './screens/ConnectScreen';
import { FaultDetailScreen } from './screens/FaultDetailScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ScanDetailScreen } from './screens/ScanDetailScreen';
import { ReadinessScreen } from './screens/ReadinessScreen';
import { FreezeFrameScreen } from './screens/FreezeFrameScreen';
import { VehicleInfoScreen } from './screens/VehicleInfoScreen';
import { ChooseReadingsScreen } from './screens/ChooseReadingsScreen';
import { HudScreen } from './screens/HudScreen';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { AlarmsScreen } from './screens/AlarmsScreen';
import { VehiclesScreen } from './screens/VehiclesScreen';
import { VehicleEditScreen } from './screens/VehicleEditScreen';
import { TripDetailScreen } from './screens/TripDetailScreen';
import { FuelScreen } from './screens/FuelScreen';
import { CodeLookupScreen } from './screens/CodeLookupScreen';
import { AdapterLogScreen } from './screens/AdapterLogScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AboutScreen } from './screens/AboutScreen';

export type RootStackParamList = {
  Tabs: undefined;
  Connect: undefined;
  FaultDetail: { code: string };
  History: undefined;
  ScanDetail: { scanId: number };
  Readiness: undefined;
  FreezeFrame: undefined;
  VehicleInfo: undefined;
  ChooseReadings: { purpose: 'dashboard' | 'readings' | 'graph' };
  Hud: undefined;
  Performance: undefined;
  Alarms: undefined;
  Vehicles: undefined;
  VehicleEdit: { id?: string };
  TripDetail: { tripId: number };
  Fuel: undefined;
  CodeLookup: undefined;
  AdapterLog: undefined;
  Settings: undefined;
  About: undefined;
};

export type TabParamList = {
  Home: undefined;
  Live: undefined;
  Faults: undefined;
  Trips: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/**
 * Tab icons drawn as glyphs rather than an icon font, which keeps the bundle
 * small and avoids a font-loading failure in a tool people use in a garage.
 */
const TAB_GLYPHS: Record<keyof TabParamList, string> = {
  Home: '◉',
  Live: '◫',
  Faults: '⚠',
  Trips: '◢',
  More: '≡',
};

function TabIcon({ name, focused, palette }: { name: keyof TabParamList; focused: boolean; palette: Palette }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 19, color: focused ? palette.amber : palette.muted }}>
        {TAB_GLYPHS[name]}
      </Text>
    </View>
  );
}

function Tabs() {
  const palette = usePalette();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.amber,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.panel,
          borderTopColor: palette.line,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -2 },
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} palette={palette} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
      <Tab.Screen name="Faults" component={FaultsScreen} options={{ title: 'Faults' }} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

function navigationTheme(palette: Palette): Theme {
  return {
    dark: palette.isDark,
    colors: {
      primary: palette.amber,
      background: palette.ground,
      card: palette.panel,
      text: palette.text,
      border: palette.line,
      notification: palette.red,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };
}

export function Navigation() {
  const palette = usePalette();

  return (
    <NavigationContainer theme={navigationTheme(palette)}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: palette.ground },
          headerTitleStyle: { color: palette.text, fontSize: 17, fontWeight: '600' },
          headerTintColor: palette.amber,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.ground },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Connect" component={ConnectScreen} options={{ title: 'Connect adapter' }} />
        <Stack.Screen name="FaultDetail" component={FaultDetailScreen} options={{ title: 'Fault' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Scan history' }} />
        <Stack.Screen name="ScanDetail" component={ScanDetailScreen} options={{ title: 'Saved scan' }} />
        <Stack.Screen name="Readiness" component={ReadinessScreen} options={{ title: 'Emission readiness' }} />
        <Stack.Screen name="FreezeFrame" component={FreezeFrameScreen} options={{ title: 'Freeze frame' }} />
        <Stack.Screen name="VehicleInfo" component={VehicleInfoScreen} options={{ title: 'Vehicle information' }} />
        <Stack.Screen name="ChooseReadings" component={ChooseReadingsScreen} options={{ title: 'Choose readings' }} />
        <Stack.Screen name="Hud" component={HudScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Performance" component={PerformanceScreen} options={{ title: 'Performance' }} />
        <Stack.Screen name="Alarms" component={AlarmsScreen} options={{ title: 'Alarms' }} />
        <Stack.Screen name="Vehicles" component={VehiclesScreen} options={{ title: 'Vehicles' }} />
        <Stack.Screen name="VehicleEdit" component={VehicleEditScreen} options={{ title: 'Vehicle profile' }} />
        <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ title: 'Trip' }} />
        <Stack.Screen name="Fuel" component={FuelScreen} options={{ title: 'Fuel' }} />
        <Stack.Screen name="CodeLookup" component={CodeLookupScreen} options={{ title: 'Look up a code' }} />
        <Stack.Screen name="AdapterLog" component={AdapterLogScreen} options={{ title: 'Adapter log' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
