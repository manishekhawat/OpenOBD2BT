/**
 * Connect.
 *
 * Four ways in, plus an auto-detect that tries each in turn. When a connection
 * fails the screen says what to do about it rather than only reporting the
 * error — "pairs but will not connect" is the commonest problem with these
 * adapters, and the fix depends on which kind you have.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useConnection } from '@/state/connection';
import { useSettings } from '@/state/settings';
import { isLikelyBleOnly } from '@/obd/transports/bluetoothClassic';
import { COMMON_WIFI_ENDPOINTS } from '@/obd/transports/wifi';
import type { AdapterCandidate, TransportKind } from '@/obd/transport';

import {
  Body,
  Button,
  Chip,
  Divider,
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
type Mode = Exclude<TransportKind, never>;

const MODES: { key: Mode; label: string }[] = [
  { key: 'bt-classic', label: 'Bluetooth' },
  { key: 'ble', label: 'Bluetooth LE' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'demo', label: 'Demo' },
];

/** Android 12 and later gate scanning and connecting behind runtime permissions. */
async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Number(Platform.Version);

  const wanted =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const granted = await PermissionsAndroid.requestMultiple(wanted);
  return Object.values(granted).every((state) => state === PermissionsAndroid.RESULTS.GRANTED);
}

export function ConnectScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const {
    candidates, scanning, connecting, lastError, probeStep,
    refreshPaired, discover, stopDiscovery, connectTo, connectWifi, connectDemo,
    autoDetect, clearError,
  } = useConnection();

  const settings = useSettings();
  const [mode, setMode] = useState<Mode>((settings.lastAdapterKind as Mode) ?? 'bt-classic');
  const [host, setHost] = useState(settings.wifiHost);
  const [port, setPort] = useState(String(settings.wifiPort));
  const [permissionDenied, setPermissionDenied] = useState(false);

  const loadPaired = useCallback(async () => {
    const ok = await requestBluetoothPermissions();
    setPermissionDenied(!ok);
    if (ok) await refreshPaired();
  }, [refreshPaired]);

  useEffect(() => {
    if (mode === 'bt-classic') void loadPaired();
    return () => stopDiscovery();
  }, [mode, loadPaired, stopDiscovery]);

  const handleConnect = async (candidate: AdapterCandidate) => {
    clearError();
    // Ask again at the point of use: the permission may have been dismissed
    // when the screen opened, and connecting without it is what Android
    // punishes hardest.
    const granted = await requestBluetoothPermissions();
    setPermissionDenied(!granted);
    if (!granted) return;

    const ok = await connectTo(candidate);
    if (ok) navigation.goBack();
  };

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <Button
          label={connecting ? 'Searching' : 'Find my adapter'}
          onPress={async () => {
            clearError();
            const ok = await requestBluetoothPermissions();
            setPermissionDenied(!ok);
            const connected = await autoDetect();
            if (connected) navigation.goBack();
          }}
          tone="primary"
          busy={connecting}
        />
        <Label>
          Tries paired Bluetooth adapters, then Bluetooth LE, then the usual Wi-Fi addresses, and
          connects to whichever answers.
        </Label>
        {probeStep ? (
          <Row gap={space.small}>
            <ActivityIndicator color={palette.amber} size="small" />
            <Label style={{ color: palette.text }}>{probeStep}</Label>
          </Row>
        ) : null}
      </View>

      {lastError ? (
        <Panel style={{ marginTop: space.wide, borderColor: palette.red }}>
          <Title style={{ fontSize: type.lead, color: palette.red }}>{lastError.message}</Title>
          {lastError.hint ? (
            <Body color={palette.muted} style={{ marginTop: space.small }}>
              {lastError.hint}
            </Body>
          ) : null}
        </Panel>
      ) : null}

      <SectionHeader>Or choose how to connect</SectionHeader>

      <Row gap={space.small} style={{ flexWrap: 'wrap' }}>
        {MODES.map((item) => {
          const active = mode === item.key;
          return (
            <Tappable key={item.key} onPress={() => { clearError(); setMode(item.key); }}>
              <View
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: radius.chip,
                  backgroundColor: active ? palette.amber : palette.panel,
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

      <View style={{ marginTop: space.wide }}>
        {mode === 'bt-classic' ? (
          <ClassicPanel
            candidates={candidates.filter((c) => c.kind === 'bt-classic')}
            scanning={scanning}
            connecting={connecting}
            permissionDenied={permissionDenied}
            onRefresh={() => void loadPaired()}
            onDiscover={() => void discover('bt-classic')}
            onConnect={handleConnect}
          />
        ) : null}

        {mode === 'ble' ? (
          <BlePanel
            candidates={candidates.filter((c) => c.kind === 'ble')}
            scanning={scanning}
            connecting={connecting}
            onScan={async () => {
              await requestBluetoothPermissions();
              void discover('ble');
            }}
            onConnect={handleConnect}
          />
        ) : null}

        {mode === 'wifi' ? (
          <WifiPanel
            host={host}
            port={port}
            onHost={setHost}
            onPort={setPort}
            connecting={connecting}
            onConnect={async () => {
              clearError();
              const ok = await connectWifi(host.trim(), Number(port) || 35000);
              if (ok) navigation.goBack();
            }}
          />
        ) : null}

        {mode === 'demo' ? (
          <Panel style={{ gap: space.base }}>
            <Title style={{ fontSize: type.lead }}>Demo vehicle</Title>
            <Body color={palette.muted}>
              A simulated car that answers exactly as a real one would — live readings on a repeating
              drive cycle, three stored faults, a freeze frame and a VIN. Use it to try every screen
              without an adapter.
            </Body>
            <Button
              label="Start demo"
              onPress={async () => {
                const ok = await connectDemo();
                if (ok) navigation.goBack();
              }}
              tone="primary"
              busy={connecting}
            />
          </Panel>
        ) : null}
      </View>
    </Screen>
  );
}

function ClassicPanel({
  candidates, scanning, connecting, permissionDenied, onRefresh, onDiscover, onConnect,
}: {
  candidates: AdapterCandidate[];
  scanning: boolean;
  connecting: boolean;
  permissionDenied: boolean;
  onRefresh: () => void;
  onDiscover: () => void;
  onConnect: (c: AdapterCandidate) => void;
}) {
  const palette = usePalette();

  return (
    <View style={{ gap: space.base }}>
      {permissionDenied ? (
        <Panel style={{ borderColor: palette.amber }}>
          <Body>
            Android needs Bluetooth and location permission to find adapters. Allow them in the
            system settings, then come back.
          </Body>
        </Panel>
      ) : null}

      <Panel style={{ gap: space.small, padding: 0 }}>
        {candidates.length === 0 ? (
          <View style={{ padding: space.gap }}>
            <Body color={palette.muted}>
              {scanning ? 'Searching…' : 'No paired adapters found. Pair the adapter in Android Bluetooth settings first — the PIN is usually 1234.'}
            </Body>
          </View>
        ) : (
          candidates.map((candidate, index) => (
            <View key={candidate.id}>
              {index > 0 ? <Divider inset={space.gap} /> : null}
              <Tappable onPress={() => onConnect(candidate)} accessibilityLabel={`Connect to ${candidate.name}`}>
                <View style={{ padding: space.gap, gap: 4, opacity: connecting ? 0.5 : 1 }}>
                  <Row justify="space-between">
                    <Title style={{ fontSize: type.body, flex: 1 }} numberOfLines={1}>
                      {candidate.name}
                    </Title>
                    {candidate.paired ? <Chip label="Paired" /> : null}
                  </Row>
                  <Label>{candidate.id}</Label>
                  {isLikelyBleOnly(candidate.name) ? (
                    <Label style={{ color: palette.amber, marginTop: 4 }}>
                      This name suggests a Bluetooth LE adapter. If connecting here fails, try the
                      Bluetooth LE tab.
                    </Label>
                  ) : null}
                </View>
              </Tappable>
            </View>
          ))
        )}
      </Panel>

      <Button label="Refresh paired devices" onPress={onRefresh} tone="neutral" />

      <Panel tone="high" style={{ gap: space.small }}>
        <Title style={{ fontSize: type.body }}>If it pairs but will not connect</Title>
        <Body color={palette.muted}>
          Connecting tries three ways in turn — a secure serial socket, an insecure one, then a
          direct connection to channel 1 — so an adapter with a malformed service record is handled
          without you doing anything.
        </Body>
        <Body color={palette.muted}>
          If all three fail: unplug the adapter for ten seconds, since these hold the last
          connection open. Close any other OBD app, and check no second phone nearby is
          reconnecting to it. Switch the ignition on. If it still refuses, the adapter may be a
          Bluetooth LE type, which Android will pair but never open a serial link to — try the
          Bluetooth LE tab.
        </Body>
      </Panel>
    </View>
  );
}

function BlePanel({
  candidates, scanning, connecting, onScan, onConnect,
}: {
  candidates: AdapterCandidate[];
  scanning: boolean;
  connecting: boolean;
  onScan: () => void;
  onConnect: (c: AdapterCandidate) => void;
}) {
  const palette = usePalette();

  return (
    <View style={{ gap: space.base }}>
      <Panel style={{ padding: 0 }}>
        {candidates.length === 0 ? (
          <View style={{ padding: space.gap }}>
            <Body color={palette.muted}>
              {scanning
                ? 'Scanning for nearby devices…'
                : 'Bluetooth LE adapters do not appear in the Android pairing list. Scan to find yours — likely names include OBDII, OBDBLE, V-Link and Vgate.'}
            </Body>
          </View>
        ) : (
          candidates.map((candidate, index) => (
            <View key={candidate.id}>
              {index > 0 ? <Divider inset={space.gap} /> : null}
              <Tappable onPress={() => onConnect(candidate)} accessibilityLabel={`Connect to ${candidate.name}`}>
                <View style={{ padding: space.gap, gap: 4, opacity: connecting ? 0.5 : 1 }}>
                  <Row justify="space-between">
                    <Title style={{ fontSize: type.body, flex: 1 }} numberOfLines={1}>
                      {candidate.name}
                    </Title>
                    {candidate.rssi ? <Label>{`${candidate.rssi} dBm`}</Label> : null}
                  </Row>
                  <Label>{candidate.id}</Label>
                </View>
              </Tappable>
            </View>
          ))
        )}
      </Panel>

      <Button
        label={scanning ? 'Scanning' : 'Scan for adapters'}
        onPress={onScan}
        tone="neutral"
        busy={scanning}
      />
    </View>
  );
}

function WifiPanel({
  host, port, onHost, onPort, connecting, onConnect,
}: {
  host: string;
  port: string;
  onHost: (v: string) => void;
  onPort: (v: string) => void;
  connecting: boolean;
  onConnect: () => void;
}) {
  const palette = usePalette();

  const inputStyle = {
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
    <View style={{ gap: space.base }}>
      <Panel style={{ gap: space.base }}>
        <Body color={palette.muted}>
          Join the adapter&apos;s own Wi-Fi network in Android settings first, then enter its address.
        </Body>

        <View style={{ gap: space.small }}>
          <Label>Address</Label>
          <TextInput
            value={host}
            onChangeText={onHost}
            placeholder="192.168.0.10"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={inputStyle}
          />
        </View>

        <View style={{ gap: space.small }}>
          <Label>Port</Label>
          <TextInput
            value={port}
            onChangeText={onPort}
            placeholder="35000"
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            style={inputStyle}
          />
        </View>

        <Button label="Connect" onPress={onConnect} tone="primary" busy={connecting} />
      </Panel>

      <Panel tone="high" style={{ gap: space.small }}>
        <Title style={{ fontSize: type.body }}>Common addresses</Title>
        {COMMON_WIFI_ENDPOINTS.map((endpoint) => (
          <Tappable
            key={`${endpoint.host}:${endpoint.port}`}
            onPress={() => {
              onHost(endpoint.host);
              onPort(String(endpoint.port));
            }}
          >
            <Row justify="space-between" style={{ paddingVertical: 7 }}>
              <Label style={{ color: palette.text }}>{`${endpoint.host}:${endpoint.port}`}</Label>
              <Label style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {endpoint.note}
              </Label>
            </Row>
          </Tappable>
        ))}
      </Panel>
    </View>
  );
}
