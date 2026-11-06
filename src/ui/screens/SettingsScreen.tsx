/**
 * Settings.
 *
 * These are this phone's preferences. There is no account to sync them to and
 * nothing here leaves the device.
 */

import { Alert, Switch, View } from 'react-native';

import { clearHistory } from '@/data/db';
import { useSettings, type Language, type ThemeChoice } from '@/state/settings';
import { useFaults } from '@/state/faults';
import type { UnitSystem } from '@/features/units';

import {
  Body,
  Button,
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

export function SettingsScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const resetFaults = useFaults((s) => s.reset);

  return (
    <Screen>
      <SectionHeader>Appearance</SectionHeader>
      <Panel style={{ gap: space.gap }}>
        <Choice<ThemeChoice>
          label="Theme"
          value={settings.theme}
          options={[
            { key: 'system', label: 'System' },
            { key: 'dark', label: 'Dark' },
            { key: 'light', label: 'Light' },
          ]}
          onChange={(v) => settings.set('theme', v)}
        />
        <Divider />
        <Choice<UnitSystem>
          label="Units"
          value={settings.units}
          options={[
            { key: 'metric', label: 'Metric' },
            { key: 'imperial', label: 'Imperial' },
          ]}
          onChange={(v) => settings.set('units', v)}
        />
        <Divider />
        <Choice<Language>
          label="Language"
          value={settings.language}
          options={[
            { key: 'en', label: 'English' },
            { key: 'hi', label: 'हिंदी' },
          ]}
          onChange={(v) => settings.set('language', v)}
        />
      </Panel>

      <SectionHeader>Adapter</SectionHeader>
      <Panel style={{ gap: space.base }}>
        <Toggle
          label="Safe mode"
          note="Sends plain requests one at a time with adaptive timing off. Slower, but it suits clone adapters that drop replies when pushed. Turn this on if readings stall or the link keeps dropping."
          value={settings.safeMode}
          onChange={(v) => settings.set('safeMode', v)}
        />
        <Divider />
        <Toggle
          label="Reconnect automatically"
          note="Reopens the link by itself if it drops while the vehicle is still connected."
          value={settings.autoReconnect}
          onChange={(v) => settings.set('autoReconnect', v)}
        />
        <Divider />
        <Toggle
          label="Keep the adapter log"
          note="Records the raw conversation with the adapter so a connection problem can be diagnosed. Stays on this phone."
          value={settings.logAdapterTraffic}
          onChange={(v) => settings.set('logAdapterTraffic', v)}
        />
      </Panel>

      <SectionHeader>Screen</SectionHeader>
      <Panel>
        <Toggle
          label="Keep the screen awake"
          note="While live data is on screen and the vehicle is connected."
          value={settings.keepAwake}
          onChange={(v) => settings.set('keepAwake', v)}
        />
      </Panel>

      <SectionHeader>Stored data</SectionHeader>
      <Panel style={{ gap: space.base }}>
        <Body color={palette.muted}>
          Scans, trips, vehicles and settings are kept on this phone only. Nothing is uploaded and
          there is no account.
        </Body>
        <Button
          label="Delete scan and trip history"
          tone="danger"
          onPress={() => {
            Alert.alert(
              'Delete all history?',
              'Every saved scan and trip on this phone will be removed. Vehicle profiles and settings are kept. This cannot be undone.',
              [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await clearHistory();
                    resetFaults();
                  },
                },
              ],
            );
          }}
        />
      </Panel>

      <View style={{ marginTop: space.wide }}>
        <Button
          label="Reset settings to defaults"
          tone="quiet"
          onPress={() =>
            Alert.alert('Reset settings?', 'Theme, units, language and adapter options go back to their defaults. Your data is untouched.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', onPress: () => settings.reset() },
            ])
          }
        />
      </View>
    </Screen>
  );
}

function Choice<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: space.small }}>
      <Label style={{ color: palette.text, fontSize: type.body }}>{label}</Label>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: palette.panelHigh,
          borderRadius: radius.tile,
          padding: 3,
        }}
      >
        {options.map((option) => {
          const active = option.key === value;
          return (
            <Tappable key={option.key} onPress={() => onChange(option.key)} style={{ flex: 1 }}>
              <View
                style={{
                  paddingVertical: 9,
                  alignItems: 'center',
                  borderRadius: radius.inset,
                  backgroundColor: active ? palette.amber : 'transparent',
                }}
              >
                <Label
                  style={{
                    color: active ? (palette.isDark ? palette.ground : '#FFFFFF') : palette.muted,
                    fontWeight: '600',
                    fontSize: type.body,
                  }}
                >
                  {option.label}
                </Label>
              </View>
            </Tappable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({
  label, note, value, onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const palette = usePalette();
  return (
    <Row justify="space-between" align="flex-start" gap={space.gap}>
      <View style={{ flex: 1, gap: 3 }}>
        <Label style={{ color: palette.text, fontSize: type.body, fontWeight: '600' }}>{label}</Label>
        <Label>{note}</Label>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.amber, false: palette.track }}
        thumbColor={palette.isDark ? palette.text : '#FFFFFF'}
      />
    </Row>
  );
}
